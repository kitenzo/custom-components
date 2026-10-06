/*
 * The case: what is in it, what it costs, and the button that buys it. As a rail beside the shelf
 * on wide screens, and as a bar stuck to the bottom of the widget on narrow ones.
 *
 * Both carry `cc-add-to-cart` and CSS decides which one shows. JavaScript never mirrors a CSS
 * breakpoint to decide where a test id or a button goes.
 */
import { getBundlePrice } from '@kitenzo/core';

import { text } from '../content';
import { h, setAttr, setText, show } from '../dom';
import { caseSize, type CaseSize } from '../model';
import { pickedCount } from '../selection';
import type { Ctx } from './context';
import { bottle, closeIcon } from './icons';
import { image } from './images';

export interface BuyState {
    canAdd: boolean;
    /** Why the button will not add yet, or the cart's own sentence after a failed add. */
    status: string;
    statusIsError: boolean;
    onAdd: () => void;
}

export interface Region {
    el: HTMLElement;
    update: () => void;
}

/**
 * Every bottle in the case, one entry per bottle: what its slots are filled with. The bottles the
 * SDK adds to every case go in first (`progress.requiredQuantity` of them: fewer once the shopper
 * has picked a required wine themselves), then the shopper's picks in shelf order.
 */
function bottlesInCase(ctx: Ctx): string[] {
    const { selections, progress } = ctx.state();
    const model = ctx.model();
    const required = model.required.flatMap((entry) => Array.from({ length: entry.quantity }, () => entry.product.id)).slice(0, progress.requiredQuantity);
    return required.concat(
        model.sections.flatMap((section) =>
            (selections[section.id] ?? []).flatMap((pick) => {
                const picked = section.byVariantId.get(pick.variantId);
                return picked ? Array.from({ length: pick.quantity }, () => picked.product.id) : [];
            }),
        ),
    );
}

/**
 * The case itself: one slot per bottle it holds, filling as the shopper chooses. Decorative
 * (`aria-hidden`); the caption under it says the same thing in words.
 *
 * Hidden while the bundle has no case to draw. Its size is read on every update, because it can
 * change under the shopper: a condition can hide a step, and a required wine the shopper picks
 * themselves is one the SDK stops adding.
 */
function createCaseGraphic(ctx: Ctx, compact: boolean): Region {
    const grid = h('div', { class: 'vnc-case__grid', 'aria-hidden': 'true' });
    const caption = h('p', { class: 'vnc-case__caption' });
    const el = h('div', { class: `vnc-case${compact ? ' vnc-case--compact' : ''}` }, grid, caption);
    let drawn: CaseSize | null = null;
    let slots: HTMLElement[] = [];

    const update = () => {
        const measured = caseSize(ctx.model(), ctx.state().progress.requiredQuantity);
        // The bar's case stands in one row: past a dozen it is a count, not a picture.
        const size = measured && !(compact && measured.slots > 12) ? measured : null;
        show(el, size !== null);
        if (size === null) return;
        if (size.slots !== drawn?.slots || size.required !== drawn.required) {
            drawn = size;
            slots = Array.from({ length: size.slots }, (_, index) => h('span', { class: `vnc-slot${index >= size.required ? ' vnc-slot--optional' : ''}` }, bottle()));
            grid.replaceChildren(...slots);
            // Two rows, the way a case is packed: 6 is 3 by 2, 12 is 6 by 2. Small cases stand in one row.
            grid.style.setProperty('--vnc-case-columns', String(size.slots <= 4 || compact ? size.slots : Math.ceil(size.slots / 2)));
        }
        const filled = bottlesInCase(ctx);
        slots.forEach((slot, index) => {
            const productId = filled[index];
            setAttr(slot, 'data-filled', productId !== undefined);
            if (productId) slot.style.setProperty('--vnc-capsule', ctx.capsule(productId));
            else slot.style.removeProperty('--vnc-capsule');
        });
        setText(caption, text(ctx.content, 'caseCount', { count: filled.length, size: size.slots }));
        el.classList.toggle('vnc-case--full', filled.length >= size.slots);
    };
    update();
    return { el, update };
}

/**
 * The case's price. Every figure and every formatted amount is the SDK's (`getBundlePrice`, which
 * is what `useBundlePrice` returns in a React widget): the set price known before the first pick,
 * the conditions engine's discount, the shopper's market. Nothing is added up here.
 */
function createPrice(ctx: Ctx, compact: boolean): Region | null {
    const { content, bundle, settings } = ctx;
    // Hidden prices are not rendered at all: a hidden element still carries a price in the DOM.
    if (content.hidePrices) return null;
    // The page's language, as for every other amount in the widget.
    const locale = document.documentElement.lang || undefined;
    const compare = h('s', { class: 'vnc-price__compare', 'data-testid': 'cc-compare-at' });
    const total = h('strong', { class: 'vnc-price__total', 'data-testid': 'cc-price' });
    const saving = compact ? null : h('span', { class: 'vnc-price__saving', 'data-testid': 'cc-saving' });
    const el = h(
        'div',
        { class: `vnc-price${compact ? ' vnc-price--compact' : ''}` },
        h('span', { class: 'vnc-price__label' }, text(content, 'total')),
        h('span', { class: 'vnc-price__amounts' }, compare, total),
        saving,
    );

    const update = () => {
        const price = getBundlePrice(bundle, ctx.state().selections, { settings, locale });
        // Nothing to price yet: an empty case whose price depends on what goes in.
        show(el, price.discountedPrice !== null);
        if (price.discountedPrice === null) return;
        setText(total, price.formattedDiscountedPrice ?? '');
        // The number that is shown, in the shopper's currency, when there is one: the raw price is
        // not rounded to it. `amounts` is absent for a set price shown before the first pick: there
        // is no original yet, and the raw price is all there is.
        setAttr(total, 'data-price-value', (price.amounts?.discounted ?? Number(price.discountedPrice)).toFixed(2));
        const amounts = price.hasDiscount ? price.amounts : null;
        show(compare, amounts !== null);
        setText(compare, amounts ? (price.formattedOriginalPrice ?? '') : '');
        setAttr(compare, 'data-price-value', amounts?.original.toFixed(2));
        if (saving) {
            show(saving, amounts !== null);
            setText(saving, amounts && price.formattedSavedAmount ? text(content, 'saving', { amount: price.formattedSavedAmount }) : '');
            setAttr(saving, 'data-price-value', amounts ? amounts.saved.toFixed(2) : null);
        }
    };
    update();
    return { el, update };
}

/**
 * The buy button and its two live regions. Both regions are always in the page and only their
 * text changes: a screen reader announces a live region's change, not its arrival, so a region
 * created with the message already in it is never read out.
 */
function createBuy(ctx: Ctx, buy: () => BuyState): Region & { status: HTMLElement } {
    const { content } = ctx;
    const button = h('button', { type: 'button', class: 'vnc-button vnc-button--primary vnc-buy', 'data-testid': 'cc-add-to-cart', onclick: () => buy().onAdd() });
    const polite = h('p', { class: 'vnc-status', role: 'status' });
    const alert = h('p', { class: 'vnc-status vnc-status--error', role: 'alert', 'data-testid': 'cc-cart-error' });
    const status = h('div', { class: 'vnc-status-wrap' }, polite, alert);
    const update = () => {
        const state = buy();
        const cart = ctx.cart();
        setText(button, cart.isAdding ? text(content, 'adding') : cart.isAdded ? text(content, 'added') : text(content, 'addToCart'));
        setAttr(button, 'aria-disabled', !state.canAdd || cart.isAdding);
        setAttr(button, 'aria-busy', cart.isAdding);
        setText(polite, state.statusIsError ? '' : state.status);
        setText(alert, state.statusIsError ? state.status : '');
    };
    update();
    return { el: button, status, update };
}

export function createRail(ctx: Ctx, buy: () => BuyState): Region {
    const { content } = ctx;
    const graphic = createCaseGraphic(ctx, false);
    const price = createPrice(ctx, false);
    const action = createBuy(ctx, buy);
    const empty = h('p', { class: 'vnc-summary__empty' }, text(content, 'summaryEmpty'));
    const list = h('ul', { class: 'vnc-summary__lines', 'aria-label': text(content, 'summaryHeading') });
    // Removing a line removes the button that was pressed; focus goes to the heading, not the page.
    const heading = h('h3', { class: 'vnc-summary__heading', tabindex: '-1' }, text(content, 'summaryHeading'));

    // What every case includes is the bundle's, whatever the shopper picks.
    const required = ctx.model().required.map((entry) =>
        h(
            'li',
            { class: 'vnc-line' },
            entry.product.photos[0] ? image(entry.product.photos[0].url, 48, '') : h('span', { class: 'vnc-line__thumb' }),
            h('span', { class: 'vnc-line__title' }, entry.quantity > 1 ? `${entry.quantity} × ` : '', entry.product.title),
            h('span', { class: 'vnc-line__tag' }, text(content, 'included')),
        ),
    );

    const el = h(
        'aside',
        { class: 'vnc-summary', 'aria-label': text(content, 'summaryHeading') },
        heading,
        graphic.el,
        empty,
        list,
        price?.el,
        action.el,
        action.status,
    );

    let signature = '';
    const update = () => {
        graphic.update();
        price?.update();
        action.update();
        const selections = ctx.state().selections;
        const lines = ctx.model().sections.flatMap((section) =>
            (selections[section.id] ?? []).flatMap((pick) => {
                const picked = section.byVariantId.get(pick.variantId);
                return picked ? [{ section, ...picked, quantity: pick.quantity }] : [];
            }),
        );
        show(empty, lines.length === 0 && required.length === 0);
        // The list only changes when the case does; rebuilding it on every render would steal focus
        // from a remove button mid-press.
        const next = `${ctx.locked()}|${lines.map((line) => `${line.section.id}:${line.variant.id}:${line.quantity}`).join(',')}`;
        if (next === signature) return;
        signature = next;
        list.replaceChildren(
            ...required,
            ...lines.map(({ section, product, variant, quantity }) => {
                const thumb = product.photos[0] ? image(product.photos[0].url, 48, '') : h('span', { class: 'vnc-line__thumb' });
                thumb.classList.add('vnc-line__thumb');
                const capsule = h('span', { class: 'vnc-card__capsule', 'aria-hidden': 'true' });
                capsule.style.setProperty('--vnc-capsule', ctx.capsule(product.id));
                return h(
                    'li',
                    { class: 'vnc-line' },
                    thumb,
                    h(
                        'span',
                        { class: 'vnc-line__title' },
                        capsule,
                        quantity > 1 ? `${quantity} × ` : '',
                        product.title,
                        variant.title !== 'Default Title' ? h('span', { class: 'vnc-line__variant' }, variant.title) : null,
                    ),
                    h(
                        'button',
                        {
                            type: 'button',
                            class: 'vnc-icon-button',
                            'aria-label': `${text(content, 'remove')} ${product.title}`,
                            'aria-disabled': ctx.locked(),
                            onclick: () => {
                                if (ctx.locked()) return;
                                ctx.builder.removeItem(section.id, variant.id);
                                heading.focus();
                            },
                        },
                        closeIcon(),
                    ),
                );
            }),
        );
    };
    for (const node of required) node.querySelector('img')?.classList.add('vnc-line__thumb');
    update();
    return { el, update };
}

export function createMobileBar(ctx: Ctx, buy: () => BuyState): Region {
    const graphic = createCaseGraphic(ctx, true);
    // What the bar shows in place of a case it cannot draw: how many are in it.
    const count = h('span', { class: 'vnc-mobile-bar__count' });
    const price = createPrice(ctx, true);
    const action = createBuy(ctx, buy);
    const el = h(
        'div',
        { class: 'vnc-mobile-bar', 'data-testid': 'cc-mobile-bar' },
        h('div', { class: 'vnc-mobile-bar__info' }, graphic.el, count, price?.el),
        action.el,
        action.status,
    );
    const update = () => {
        graphic.update();
        show(count, graphic.el.hidden);
        setText(count, String(pickedCount(ctx.state().progress)));
        price?.update();
        action.update();
    };
    update();
    return { el, update };
}
