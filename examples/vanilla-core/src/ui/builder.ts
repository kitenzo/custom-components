/*
 * The builder: the shelf of wines, the case, and the add to cart.
 *
 * Generic underneath the wine styling: it draws any bundle the headless API can describe (several
 * steps, per-step and bundle-wide counts, required products, product options, sold-out and capped
 * stock, conditions that hide steps or products). The case graphic draws itself from the limits
 * and steps aside for a list when the bundle has no single size.
 *
 * How it stays in step without a framework: one `render()` updates every region in place from
 * the engine's snapshot and the cart's state. It runs when the builder notifies (`subscribe`),
 * when the cart changes phase, and when a control's own state changes (an option, a refusal).
 * Every region is built once and only patched afterwards, so nothing the shopper is touching is
 * ever replaced under their finger.
 */
import type { BundleBuilderSnapshot, KitenzoClient, ShopSettings } from '@kitenzo/core';

import { createCartFlow, type CartState } from '../cart';
import { cartUrl, routePrefix, type MountConfig } from '../config';
import { text } from '../content';
import { h, setAttr, setText, show } from '../dom';
import type { EditState } from '../load';
import { visibleProducts, type ViewModel, type ViewSection } from '../model';
import { createMoney } from '../money';
import { countOf, createSelection, missingPicks, type Missing } from '../selection';
import { createCard, type Card } from './card';
import type { Ctx } from './context';
import { createDialog } from './dialog';
import { editorPanel } from './notice';
import { createPick, type Pick } from './pick';
import { createMobileBar, createRail, type BuyState } from './summary';

export interface BuilderOptions {
    model: ViewModel;
    settings: ShopSettings;
    client: KitenzoClient;
    config: MountConfig;
    editor: boolean;
    edit: EditState;
}

/** How many bottle capsule colours styles.css defines (`--vnc-capsule-1` and on). */
const CAPSULES = 8;

/** Ids are per widget: the same bundle can be mounted twice on one page. */
let mounts = 0;

function rangeText(section: ViewSection): string {
    const { min, max } = section.limits;
    if (max === Number.POSITIVE_INFINITY) return `${min}+`;
    return min === max ? String(min) : `${min}–${max}`;
}

export function createBuilder(options: BuilderOptions): { el: HTMLElement; destroy: () => void } {
    const { model, config, editor, edit, settings } = options;
    const { content } = config;
    const builder = createSelection(model, edit.selections);
    let snapshot: BundleBuilderSnapshot = builder.getState();
    let nudgeTimer: number | undefined;
    let stayTimer: number | undefined;
    const idPrefix = `vnc${(mounts += 1)}`;

    // Required products get a capsule too: they stand in the case beside the shopper's picks.
    const products = [...model.sections.flatMap((section) => section.products), ...model.required.map((entry) => entry.product)];
    const capsuleOf = new Map(products.map((product, index) => [product.id, `var(--vnc-capsule-${(index % CAPSULES) + 1})`]));

    const cart = createCartFlow({
        client: options.client,
        settings,
        routePrefix: routePrefix(config.rootUrl),
        replace: edit.replace,
        onChange: (state) => {
            render();
            if (state.added) {
                // Themes with a cart drawer listen for this and refresh; the rest follow the redirect.
                root.dispatchEvent(new CustomEvent('kitenzo:bundle-added', { bubbles: true, detail: { bundleId: model.bundle.id } }));
                if (content.afterAdd === 'cart') window.location.assign(cartUrl(config.rootUrl));
                // When the shopper stays on the page, "Added" shows for a moment, then the case can go in again.
                else stayTimer = window.setTimeout(() => cart.reset(), 4000);
            }
        },
    });

    const ctx: Ctx = {
        model,
        content,
        settings,
        money: createMoney(model.bundle, settings),
        builder,
        editor,
        state: () => snapshot,
        cart: (): CartState => cart.state,
        // Held while an add is in flight, and while a dropped add waits to be finished: that add
        // goes in with the selection it started with, so changing the case now would show the
        // shopper one case and put another in their cart.
        locked: () => cart.state.busy || cart.state.resumable,
        render: () => render(),
        openDetails: (productId, sectionId) => {
            const pick = picks.get(`${sectionId}:${productId}`);
            if (pick) dialog.open(pick);
        },
        capsule: (productId) => capsuleOf.get(productId) ?? 'var(--vnc-capsule-1)',
    };

    // ----- The status line and the buy button's rules ----------------------------------------

    const blockingProblem = model.problems.some((problem) => problem.blocking);
    // A draft previews in the theme editor, and the API refuses to configure it.
    const draft = !model.bundle.published;
    const visibleSections = () => model.sections.filter((section) => !snapshot.conditions.hiddenSectionIds.includes(section.id) && section.products.length > 0);

    const missingText = (missing: Missing): string =>
        // With one step, naming it adds nothing: "6 more to fill the case" says it all.
        missing.section && visibleSections().length > 1
            ? text(content, 'chooseMoreStep', { count: missing.count, step: missing.section.name })
            : text(content, 'chooseMore', { count: missing.count });

    const canAdd = () => snapshot.isSatisfied && !snapshot.conditions.hideCartButton && !blockingProblem && !draft && !cart.state.added;
    // A dropped add is finished by pressing again, whatever the selection's state says.
    const resumable = () => cart.state.resumable;

    const buy = (): BuyState => {
        const missing = missingPicks(model, snapshot.selections, snapshot.conditions.hiddenSectionIds);
        let status = '';
        let statusIsError = false;
        if (cart.state.shopperMessage) {
            // The cart's own sentence. Never `error.message`: that one carries the route and status.
            status = resumable() ? `${cart.state.shopperMessage} ${text(content, 'retryAdd')}` : cart.state.shopperMessage;
            statusIsError = true;
        } else if (cart.state.added) status = text(content, 'added');
        else if (draft && editor) status = 'This bundle is a draft, so it previews here but cannot be added to a cart until you publish it in Kitenzo.';
        else if (blockingProblem) status = text(content, 'unavailable');
        else if (missing[0]) status = missingText(missing[0]);
        // A rule other than a count (one per product, a price limit, one of several allowed sizes)
        // refuses this selection. The engine names it only once every step has a pick, and in its
        // own words, so the merchant's sentence always comes first and its detail goes to the editor.
        else if (!snapshot.isSatisfied) status = editor && snapshot.errors[0] ? `${text(content, 'notAllowed')} (${snapshot.errors[0].message})` : text(content, 'notAllowed');
        return { canAdd: canAdd() || resumable(), status, statusIsError, onAdd };
    };

    const onAdd = () => {
        if (cart.state.busy) return;
        if (!canAdd() && !resumable()) {
            root.classList.add('vnc-root--nudged');
            window.clearTimeout(nudgeTimer);
            nudgeTimer = window.setTimeout(() => root.classList.remove('vnc-root--nudged'), 1200);
            return;
        }
        // Gated on `isSatisfied` above, so this is a selection `/configure` accepts. A resumed add
        // ignores the selection passed here and finishes the one it holds.
        void cart.add(model.bundle, snapshot.selections);
    };

    // ----- The regions -------------------------------------------------------------------------

    const picks = new Map<string, Pick>();
    const cards: { section: ViewSection; card: Card }[] = [];
    const steps = model.sections.map((section, index) => {
        const sectionCards = section.products.map((product) => {
            const pick = createPick(ctx, product, section);
            picks.set(`${section.id}:${product.id}`, pick);
            const card = createCard(ctx, pick, section);
            cards.push({ section, card });
            return card;
        });
        const counter = h('span', { class: 'vnc-step__counter' });
        const el = h(
            'section',
            { class: 'vnc-step', id: `${idPrefix}-step-${section.id}`, 'aria-labelledby': `${idPrefix}-step-title-${section.id}` },
            h(
                'header',
                { class: 'vnc-step__header' },
                model.sections.length > 1 ? h('span', { class: 'vnc-step__index' }, index + 1) : null,
                h(
                    'div',
                    { class: 'vnc-step__titles' },
                    h('h3', { class: 'vnc-step__title', id: `${idPrefix}-step-title-${section.id}` }, section.name),
                    section.description ? h('p', { class: 'vnc-step__description' }, section.description) : null,
                ),
                counter,
            ),
            h('div', { class: 'vnc-grid' }, ...sectionCards.map((card) => card.el)),
        );
        return { section, el, counter };
    });

    const rail = createRail(ctx, buy);
    const bar = createMobileBar(ctx, buy);
    const dialog = createDialog(ctx);
    const heading = content.heading || model.bundle.name;
    const intro = content.intro || model.bundle.description;

    const root = h(
        'div',
        { class: 'vnc-root', 'data-testid': 'cc-root' },
        editor && model.problems.length > 0 ? editorPanel(h('ul', { class: 'vnc-editor-panel__list' }, ...model.problems.map((problem) => h('li', {}, problem.detail)))) : null,
        !editor && blockingProblem ? h('div', { class: 'vnc-error', 'data-testid': 'cc-error', role: 'alert' }, h('p', {}, text(content, 'unavailable'))) : null,
        h('header', { class: 'vnc-header' }, h('h2', { class: 'vnc-header__title' }, heading), intro ? h('p', { class: 'vnc-header__intro' }, intro) : null),
        // Only an edit that will really replace the cart line says so. When the saved case could not
        // be restored, `replace` is null and the add creates a new case alongside it.
        edit.isEditing && edit.replace
            ? h('div', { class: 'vnc-notice', role: 'status' }, h('p', {}, text(content, 'editNotice')), edit.missing.length > 0 ? h('p', {}, text(content, 'editMissing')) : null)
            : null,
        h('div', { class: 'vnc-layout' }, h('div', { class: 'vnc-steps' }, ...steps.map((step) => step.el)), rail.el),
        bar.el,
        dialog.el,
    );

    // ----- Render ------------------------------------------------------------------------------

    const previousCounts = new Map<number, number>();

    function render() {
        snapshot = builder.getState();
        const selections = snapshot.selections;
        setAttr(root, 'data-complete', snapshot.isSatisfied ? 'true' : 'false');
        setAttr(root, 'data-qa-count', countOf(selections));

        const shown = visibleSections();
        for (const { section, el, counter } of steps) {
            show(el, shown.includes(section));
            const count = countOf(selections, section.id);
            const optional = section.limits.min === 0;
            const done = count >= section.limits.min && count > 0;
            setAttr(el, 'data-step-done', done);
            counter.classList.toggle('vnc-step__counter--done', done);
            setText(
                counter,
                optional && count === 0
                    ? text(content, 'stepOptional')
                    : optional && section.limits.max === Number.POSITIVE_INFINITY
                      ? text(content, 'stepCount', { count })
                      : text(content, 'stepCountRange', { count, range: optional ? `0–${section.limits.max}` : rangeText(section) }),
            );
        }
        for (const { section, card } of cards) {
            show(card.el, visibleProducts(section, snapshot.conditions.hiddenProducts).includes(card.product));
            card.update();
        }
        rail.update();
        bar.update();
        dialog.update();
        autoAdvance(shown);
    }

    /** "Advance when this step is done" is the merchant's setting, per step: mirror it, never assume it. */
    function autoAdvance(shown: ViewSection[]) {
        shown.forEach((section, index) => {
            const before = previousCounts.get(section.id) ?? 0;
            const now = countOf(snapshot.selections, section.id);
            previousCounts.set(section.id, now);
            const full = (count: number) => (section.limits.max !== Number.POSITIVE_INFINITY ? count >= section.limits.max : count >= section.limits.min && section.limits.min > 0);
            const next = shown[index + 1];
            if (section.autoNext && full(now) && !full(before) && now > before && next) {
                root.querySelector(`#${idPrefix}-step-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    // A case restored from the cart is not the shopper filling a step: no scrolling on arrival.
    for (const section of model.sections) previousCounts.set(section.id, countOf(snapshot.selections, section.id));
    const unsubscribe = builder.subscribe(render);
    render();

    return {
        el: root,
        destroy: () => {
            unsubscribe();
            window.clearTimeout(nudgeTimer);
            window.clearTimeout(stayTimer);
            for (const pick of picks.values()) pick.dispose();
            dialog.close();
        },
    };
}
