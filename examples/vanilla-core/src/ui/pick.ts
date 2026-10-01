/*
 * One product's picker: its option values, the variant they resolve to, how many of that variant
 * are in this step, and add/remove with a reason whenever the answer is no.
 *
 * One Pick per product per step, shared by its card and its details dialog, so the two can never
 * disagree about which variant is chosen. The option grid is core's (`defaultOptionValues`,
 * `resolveVariant`, `reachableOptionValues`, `selectOptionValue`); this file only keeps the
 * shopper's current answer and draws the controls.
 */
import {
    defaultOptionValues,
    reachableOptionValues,
    resolveVariant,
    selectOptionValue,
    type BundleVariant,
    type OptionSelection,
} from '@kitenzo/core';

import { text } from '../content';
import { h, replaceKeepingFocus, setAttr, setText } from '../dom';
import type { ViewProduct, ViewSection } from '../model';
import { blockedReason, type Blocked } from '../selection';
import type { Ctx } from './context';
import { minusIcon, plusIcon } from './icons';

export interface Pick {
    product: ViewProduct;
    section: ViewSection;
    variant: () => BundleVariant;
    quantity: () => number;
    blocked: () => Blocked | null;
    /** A sentence for the shopper when something was refused or is limited, else ''. */
    message: () => string;
    add: () => void;
    remove: () => void;
    setOption: (name: string, value: string) => void;
    setVariant: (variantId: string) => void;
    /** The option axes worth a dropdown: more than one value. */
    options: () => { name: string; value: string; values: { value: string; reachable: boolean }[] }[];
    /** For a product with variants but no option data (an older API): one choice per variant. */
    variantChoices: BundleVariant[] | null;
    dispose: () => void;
}

function matches(variant: BundleVariant, product: ViewProduct['product'], values: OptionSelection): boolean {
    const options = product.options ?? [];
    return options.every((option, index) => values[option.name] === undefined || variant.optionValues?.[index] === values[option.name]);
}

export function createPick(ctx: Ctx, product: ViewProduct, section: ViewSection): Pick {
    const options = product.product.options ?? [];
    const hasOptionData = options.length > 0 && product.variants.every((variant) => (variant.optionValues?.length ?? 0) === options.length);
    let values: OptionSelection = hasOptionData ? defaultOptionValues(product.product) : {};
    let variantId = (product.variants.find((variant) => variant.available) ?? product.variants[0]!).id;
    let refusal: string | null = null;
    let timer: number | undefined;

    const variant = (): BundleVariant => {
        if (!hasOptionData) return product.variants.find((candidate) => candidate.id === variantId) ?? product.variants[0]!;
        // `resolveVariant` only resolves to something buyable. When the chosen combination is sold
        // out, show that variant anyway, so the card can say "Sold out" rather than jump elsewhere.
        return resolveVariant(product.product, values) ?? product.variants.find((candidate) => matches(candidate, product.product, values)) ?? product.variants[0]!;
    };
    const quantity = () => (ctx.state().selections[section.id] ?? []).find((pick) => pick.variantId === variant().id)?.quantity ?? 0;
    const blocked = () => blockedReason(ctx.model, ctx.state().selections, section, variant());

    const say = (message: string | null) => {
        refusal = message;
        window.clearTimeout(timer);
        if (message) timer = window.setTimeout(() => say(null), 5000);
        ctx.render();
    };

    const reasonText = (reason: Blocked): string =>
        text(ctx.content, ({ 'sold-out': 'soldOut', stock: 'stockReached', 'step-full': 'stepFull', 'bundle-full': 'bundleFull' } as const)[reason]);

    return {
        product,
        section,
        variant,
        quantity,
        blocked,
        variantChoices: !hasOptionData && product.variants.length > 1 ? product.variants : null,
        message: () => {
            if (refusal) return refusal;
            const current = variant();
            const stock = current.maxOrderableQuantity;
            return current.available && stock !== null && stock !== undefined && stock > 0 && stock <= 5 ? text(ctx.content, 'onlyLeft', { count: stock }) : '';
        },
        add: () => {
            if (ctx.locked()) return;
            const reason = blocked();
            if (reason) return say(reasonText(reason));
            refusal = null;
            // The engine's own method. It re-validates, notifies, and the widget re-renders from that.
            ctx.builder.addItem(section.id, variant().id, 1);
        },
        remove: () => {
            const current = quantity();
            if (ctx.locked() || current === 0) return;
            refusal = null;
            ctx.builder.updateQuantity(section.id, variant().id, current - 1);
        },
        setOption: (name, value) => {
            values = selectOptionValue(product.product, values, name, value);
            ctx.render();
        },
        setVariant: (id) => {
            variantId = id;
            ctx.render();
        },
        options: () =>
            hasOptionData
                ? options
                      .filter((option) => option.values.length > 1)
                      .map((option) => {
                          const reachable = new Set(reachableOptionValues(product.product, values, option.name));
                          return {
                              name: option.name,
                              value: values[option.name] ?? '',
                              values: option.values.map((value) => ({ value, reachable: reachable.has(value) })),
                          };
                      })
                : [],
        dispose: () => window.clearTimeout(timer),
    };
}

export interface Controls {
    el: HTMLElement;
    update: () => void;
}

let uid = 0;

/**
 * A product's option dropdowns, its add / quantity control and its message line, for a card or
 * the dialog.
 *
 * Unreachable option values are disabled, not hidden: a shopper needs to see that a size exists
 * before they can work out what to change to reach it. A control that refuses an action stays
 * focusable (`aria-disabled`, not `disabled`) and says why when pressed; only a sold-out product's
 * control is truly `disabled`, because there is nothing the shopper can do about it.
 *
 * Built once and updated in place, so the button under the shopper's finger (and keyboard focus)
 * survives every re-render. Only the switch between "Add" and the stepper rebuilds, and it moves
 * focus to the stepper's + so a keyboard shopper can keep adding.
 */
export function createControls(ctx: Ctx, pick: Pick): Controls {
    const { content } = ctx;
    const id = `vnc-pick-${(uid += 1)}`;

    const selects = pick.options().map((option) => {
        const select = h('select', { class: 'vnc-select', id: `${id}-${option.name}`, onchange: (event) => pick.setOption(option.name, (event.target as HTMLSelectElement).value) });
        for (const entry of option.values) select.append(h('option', { value: entry.value }, entry.value));
        return { name: option.name, select, label: h('label', { class: 'vnc-option', for: select.id }, h('span', { class: 'vnc-option__label' }, option.name), select) };
    });
    const variantSelect = pick.variantChoices
        ? h('select', { class: 'vnc-select', onchange: (event) => pick.setVariant((event.target as HTMLSelectElement).value) }, ...pick.variantChoices.map((variant) => h('option', { value: variant.id, disabled: !variant.available }, variant.title)))
        : null;

    const add = h('button', { type: 'button', class: 'vnc-button vnc-button--secondary vnc-add', 'data-testid': 'cc-pick', onclick: pick.add });
    const minus = h('button', { type: 'button', class: 'vnc-stepper__button', onclick: pick.remove }, minusIcon());
    const count = h('output', { class: 'vnc-stepper__count', 'aria-live': 'polite' });
    const plus = h('button', { type: 'button', class: 'vnc-stepper__button', 'data-testid': 'cc-pick', onclick: pick.add }, plusIcon());
    const stepper = h('div', { class: 'vnc-stepper', role: 'group' }, minus, count, plus);
    const actions = h('div', { class: 'vnc-card__actions' });
    const message = h('p', { class: 'vnc-card__message', role: 'status' });

    const el = h(
        'div',
        { class: 'vnc-controls' },
        selects.length > 0 ? h('div', { class: 'vnc-options' }, ...selects.map((entry) => entry.label)) : null,
        variantSelect ? h('label', { class: 'vnc-option' }, h('span', { class: 'vnc-option__label' }, pick.product.product.options?.[0]?.name ?? 'Option'), variantSelect) : null,
        actions,
        message,
    );

    let mode: 'add' | 'stepper' | null = null;

    const update = () => {
        const locked = ctx.locked();
        const variant = pick.variant();
        const quantity = pick.quantity();
        const blocked = pick.blocked();
        const soldOut = blocked === 'sold-out';
        const refusing = blocked !== null && !soldOut;
        const name = variant.title === 'Default Title' ? pick.product.title : `${pick.product.title}, ${variant.title}`;

        for (const [index, option] of pick.options().entries()) {
            const entry = selects[index];
            if (!entry) continue;
            if (entry.select.value !== option.value) entry.select.value = option.value;
            entry.select.disabled = locked;
            option.values.forEach((value, position) => setAttr(entry.select.options[position]!, 'disabled', !value.reachable));
        }
        if (variantSelect) {
            if (variantSelect.value !== variant.id) variantSelect.value = variant.id;
            variantSelect.disabled = locked;
        }

        const next = quantity === 0 ? 'add' : 'stepper';
        if (next !== mode) {
            mode = next;
            replaceKeepingFocus(actions, [next === 'add' ? add : stepper], next === 'add' ? '.vnc-add' : '[data-testid="cc-pick"]');
        }
        setText(add, soldOut ? text(content, 'soldOut') : text(content, 'add'));
        add.disabled = soldOut;
        setAttr(add, 'aria-disabled', refusing || locked);
        // A sold-out control is disabled, so its name has to carry why: "Semillion: Sold out".
        setAttr(add, 'aria-label', soldOut ? `${name}: ${text(content, 'soldOut')}` : `${text(content, 'add')} ${name}`);
        setAttr(stepper, 'aria-label', name);
        setText(count, String(quantity));
        setAttr(minus, 'aria-label', `${text(content, 'remove')} ${name}`);
        setAttr(minus, 'aria-disabled', locked);
        setAttr(plus, 'aria-label', `${text(content, 'add')} ${name}`);
        setAttr(plus, 'aria-disabled', refusing || locked);
        setText(message, pick.message());
    };
    update();
    return { el, update };
}
