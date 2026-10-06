/*
 * The builder: the shelf of wines, the case, and the add to cart.
 *
 * Generic underneath the wine styling: it draws any bundle the headless API can describe (several
 * steps, per-step and bundle-wide counts, required products, product options, sold-out and capped
 * stock, conditions that hide steps or products). The case graphic draws itself from the limits
 * and steps aside for a list when the bundle has no single size.
 *
 * How it stays in step without a framework: one `render()` updates every region in place from
 * the engine's snapshot and the cart flow's state, and runs when either notifies (`subscribe`).
 * A change that is one wine's alone (an option, a refusal) updates that wine's card and nothing
 * else (`src/ui/pick.ts`). Every region is built once and only patched afterwards, so nothing the
 * shopper is touching is ever replaced under their finger.
 *
 * The builder is created WITH its opening selection (a basket Edit), never filled after the first
 * paint: that paints an empty case for one frame, and a shopper who taps in that frame adds to the
 * wrong state.
 */
import {
    createBundleBuilder,
    createBundleCartFlow,
    createMoneyFormatter,
    type BundleBuilderSnapshot,
    type BundleDetail,
    type BundleEdit,
    type KitenzoClient,
    type SelectionProgress,
    type ShopSettings,
} from '@kitenzo/core';

import { cartUrl, routePrefix, type MountConfig } from '../config';
import { cartMessages, text } from '../content';
import { h, setAttr, setText, show } from '../dom';
import { toViewModel, type ViewModel, type ViewSection } from '../model';
import { nextId } from '../registry';
import { isStepDone, isStepFinished, missingPicks, pickedCount, type Missing } from '../selection';
import { createCard, type Card } from './card';
import type { Ctx } from './context';
import { createDialog } from './dialog';
import { editorPanel } from './notice';
import { createPick, type Pick as WinePick } from './pick';
import { createMobileBar, createRail, type BuyState } from './summary';

export interface BuilderOptions {
    bundle: BundleDetail;
    settings: ShopSettings;
    client: KitenzoClient;
    config: MountConfig;
    editor: boolean;
    edit: Pick<BundleEdit, 'isEditing' | 'selections' | 'missing' | 'replace'>;
}

/** How many bottle capsule colours styles.css defines (`--vnc-capsule-1` and on). */
const CAPSULES = 8;

function rangeText(section: ViewSection): string {
    const { min, max } = section.limits;
    if (max === null) return `${min}+`;
    return min === max ? String(min) : `${min}–${max}`;
}

export function createBuilder(options: BuilderOptions): { el: HTMLElement; destroy: () => void } {
    const { bundle, config, editor, edit, settings } = options;
    const { content } = config;
    // What React's `useSyncExternalStore` does for the starter, `builder.subscribe` does here.
    const builder = createBundleBuilder(bundle, { initialSelections: edit.selections });
    let snapshot: BundleBuilderSnapshot = builder.getState();
    let nudgeTimer: number | undefined;
    let stayTimer: number | undefined;
    // Ids are per widget: the same bundle can be mounted twice on one page.
    const idPrefix = `vnc${nextId()}`;

    // Every step and wine the bundle can offer. The regions are built from it, once, so a wine a
    // condition hides and then shows again comes back as the same card, with its options as the
    // shopper left them.
    const shelf = toViewModel(bundle, settings);
    // What is offered at this moment, which is what the page shows: the SDK's offer under the
    // builder's conditions. The builder keeps `conditions` until something in it changes.
    let model: ViewModel = shelf;
    let offered = new Set<string>();
    const offer = (conditions: BundleBuilderSnapshot['conditions']) => {
        model = toViewModel(bundle, settings, conditions);
        offered = new Set(model.sections.flatMap((section) => section.products.map((product) => `${section.id}:${product.id}`)));
    };
    offer(snapshot.conditions);

    // Required products get a capsule too: they stand in the case beside the shopper's picks.
    const products = [...shelf.sections.flatMap((section) => section.products), ...shelf.required.map((entry) => entry.product)];
    const capsuleOf = new Map(products.map((product, index) => [product.id, `var(--vnc-capsule-${(index % CAPSULES) + 1})`]));

    // The whole add is the SDK's: `/configure`, the lines, the `_bundles` merge, one add at a time,
    // finishing an add whose answer was lost, and replacing the case a basket Edit came from.
    const cart = createBundleCartFlow({
        client: options.client,
        settings,
        routePrefix: routePrefix(config.rootUrl),
        replace: edit.replace,
        messages: cartMessages(content),
        onAdded: () => {
            // Themes with a cart drawer listen for this and refresh; the rest follow the redirect.
            root.dispatchEvent(new CustomEvent('kitenzo:bundle-added', { bubbles: true, detail: { bundleId: bundle.id } }));
            if (content.afterAdd === 'cart') window.location.assign(cartUrl(config.rootUrl));
            // When the shopper stays on the page, "Added" shows for a moment, then the case can go in again.
            else stayTimer = window.setTimeout(() => cart.reset(), 4000);
        },
    });

    const ctx: Ctx = {
        bundle,
        model: () => model,
        content,
        settings,
        // The page's language, not the browser's: a market amount reads as the storefront writes it.
        money: createMoneyFormatter(bundle, settings, { locale: document.documentElement.lang || undefined }),
        builder,
        state: () => snapshot,
        cart: () => cart.getState(),
        // Held while an add is in flight, and while one whose answer was lost waits to be finished: that add
        // goes in with the selection it started with, so changing the case now would show the
        // shopper one case and put another in their cart.
        locked: () => cart.getState().isAdding || cart.getState().isResumable,
        openDetails: (productId, sectionId) => {
            const pick = picks.get(`${sectionId}:${productId}`);
            if (pick) dialog.open(pick);
        },
        capsule: (productId) => capsuleOf.get(productId) ?? 'var(--vnc-capsule-1)',
    };

    // ----- The status line and the buy button's rules ----------------------------------------

    // The merchant's to fix, whatever the shopper picks.
    const blockingProblem = shelf.problems.some((problem) => problem.blocking);
    // A draft previews in the theme editor, and the API refuses to configure it.
    const draft = !bundle.published;

    const missingText = (missing: Missing): string =>
        // With one step, naming it adds nothing: "6 more to fill the case" says it all.
        missing.section && model.sections.length > 1
            ? text(content, 'chooseMoreStep', { count: missing.count, step: missing.section.name })
            : text(content, 'chooseMore', { count: missing.count });

    const canAdd = () => snapshot.isSatisfied && !snapshot.conditions.hideCartButton && !blockingProblem && !draft && !cart.getState().isAdded;
    // An add whose answer was lost is finished by pressing again, whatever the selection's state says.
    const resumable = () => cart.getState().isResumable;

    const buy = (): BuyState => {
        const { shopperMessage, isAdded } = cart.getState();
        const missing = missingPicks(model.sections, snapshot.progress);
        let status = '';
        let statusIsError = false;
        if (shopperMessage) {
            // The cart's own sentence. Never `error.message`: that one carries the route and status.
            status = resumable() ? `${shopperMessage} ${text(content, 'retryAdd')}` : shopperMessage;
            statusIsError = true;
        } else if (isAdded) status = text(content, 'added');
        else if (draft && editor) status = 'This bundle is a draft, so it previews here but cannot be added to a cart until you publish it in Kitenzo.';
        else if (blockingProblem) status = text(content, 'unavailable');
        else if (missing[0]) status = missingText(missing[0]);
        // A rule other than a count (sold in multiples, a price or weight limit, at least N of each)
        // refuses this selection. The SDK names it in `problems`, in its own words, so the
        // merchant's sentence always comes first and the SDK's detail goes to the theme editor.
        else if (!snapshot.isSatisfied) status = editor && snapshot.problems[0] ? `${text(content, 'notAllowed')} (${snapshot.problems[0].message})` : text(content, 'notAllowed');
        return { canAdd: canAdd() || resumable(), status, statusIsError, onAdd };
    };

    const onAdd = () => {
        if (cart.getState().isAdding) return;
        if (!canAdd() && !resumable()) {
            root.classList.add('vnc-root--nudged');
            window.clearTimeout(nudgeTimer);
            nudgeTimer = window.setTimeout(() => root.classList.remove('vnc-root--nudged'), 1200);
            return;
        }
        // Gated on `isSatisfied` above, so this is a selection `/configure` accepts. A resumed add
        // ignores the selection passed here and finishes the one it holds.
        void cart.addToCart(bundle, snapshot.selections);
    };

    // ----- The regions -------------------------------------------------------------------------

    const picks = new Map<string, WinePick>();
    const cards: { key: string; card: Card }[] = [];
    const steps = shelf.sections.map((section) => {
        const sectionCards = section.products.map((product) => {
            const key = `${section.id}:${product.id}`;
            const pick = createPick(ctx, product, section);
            picks.set(key, pick);
            const card = createCard(ctx, pick, section);
            cards.push({ key, card });
            return card;
        });
        const number = h('span', { class: 'vnc-step__index' });
        const counter = h('span', { class: 'vnc-step__counter' });
        const el = h(
            'section',
            { class: 'vnc-step', id: `${idPrefix}-step-${section.id}`, 'aria-labelledby': `${idPrefix}-step-title-${section.id}` },
            h(
                'header',
                { class: 'vnc-step__header' },
                number,
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
        return { id: section.id, el, number, counter };
    });

    const rail = createRail(ctx, buy);
    const bar = createMobileBar(ctx, buy);
    const dialog = createDialog(ctx);
    const heading = content.heading || bundle.name;
    const intro = content.intro || bundle.description;

    const root = h(
        'div',
        { class: 'vnc-root', 'data-testid': 'cc-root' },
        editor && shelf.problems.length > 0 ? editorPanel(h('ul', { class: 'vnc-editor-panel__list' }, ...shelf.problems.map((problem) => h('li', {}, problem.detail)))) : null,
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

    function render() {
        const before = snapshot;
        snapshot = builder.getState();
        if (snapshot.conditions !== before.conditions) offer(snapshot.conditions);
        const { progress } = snapshot;
        setAttr(root, 'data-complete', snapshot.isSatisfied ? 'true' : 'false');
        setAttr(root, 'data-qa-count', pickedCount(progress));

        for (const { id, el, number, counter } of steps) {
            const position = model.sections.findIndex((candidate) => candidate.id === id);
            const section = model.sections[position];
            show(el, section !== undefined);
            if (!section) continue;
            // Numbered as the shopper sees them: a hidden step does not leave a gap.
            show(number, model.sections.length > 1);
            setText(number, String(position + 1));
            const count = progress.sections[id]?.quantity ?? 0;
            const optional = section.limits.min === 0;
            const done = isStepDone(section, progress);
            setAttr(el, 'data-step-done', done);
            counter.classList.toggle('vnc-step__counter--done', done);
            setText(
                counter,
                optional && count === 0
                    ? text(content, 'stepOptional')
                    : optional && section.limits.max === null
                      ? text(content, 'stepCount', { count })
                      : text(content, 'stepCountRange', { count, range: optional ? `0–${section.limits.max}` : rangeText(section) }),
            );
        }
        for (const { key, card } of cards) {
            const shown = offered.has(key);
            show(card.el, shown);
            if (shown) card.update();
        }
        rail.update();
        bar.update();
        dialog.update();
        autoAdvance(before.progress);
    }

    /**
     * "Advance when this step is done" is the merchant's setting, per step: mirror it, never assume it.
     * Only a pick that finishes a step advances, so a case that opens already filled (a basket
     * Edit) does not scroll the page on load.
     */
    function autoAdvance(before: SelectionProgress) {
        const { progress } = snapshot;
        if (before === progress) return;
        model.sections.forEach((section, index) => {
            const next = model.sections[index + 1];
            const grew = (progress.sections[section.id]?.quantity ?? 0) > (before.sections[section.id]?.quantity ?? 0);
            if (section.autoNext && next && grew && isStepFinished(section, progress) && !isStepFinished(section, before)) {
                steps.find((step) => step.id === next.id)?.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    const unsubscribe = [builder.subscribe(render), cart.subscribe(render)];
    render();

    return {
        el: root,
        destroy: () => {
            for (const stop of unsubscribe) stop();
            window.clearTimeout(nudgeTimer);
            window.clearTimeout(stayTimer);
            for (const pick of picks.values()) pick.dispose();
            dialog.close();
        },
    };
}
