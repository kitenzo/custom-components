/*
 * The builder: filters, the cans, the case, and the add to cart.
 *
 * Laid out for a mix-a-case bundle (one step, a bundle-wide count, tiers on the number of cans),
 * but nothing in it assumes that shape: several steps render as several grids under one set of
 * filters, and a bundle without tiers simply has no ladder. Restyle it in styles.css; reshape it
 * here.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { AjaxCartError } from '@kitenzo/core';
import { useBundleAjaxCart, useRecurringPlan, type BundleEditTarget, type SavedBundleItem, type SectionSelections, type ShopSettings } from '@kitenzo/react';

import { cartUrl, routePrefix, type MountConfig } from '../config';
import { text } from '../content';
import { applyFacets, isFiltering, parseFacetDefs, type ActiveFacets } from '../facets';
import type { ViewModel, ViewSection } from '../model';
import { visibleProducts } from '../model';
import { useMoney } from '../money';
import { frequencyText, lineLabels, planProblem, reorderExpired } from '../recurring';
import { countOf, missingPicks, useSelection, type Missing } from '../selection';
import { tierLadder } from '../tiers';
import { BuilderContext, useBuilder, type BuilderContextValue } from './context';
import { FacetBar } from './FacetBar';
import { EditorPanel } from './Notice';
import { ProductCard } from './ProductCard';
import { ProductDialog, type OpenProduct } from './ProductDialog';
import { MobileBar, SummaryRail, type BuyState } from './Summary';

export interface EditState {
    isEditing: boolean;
    selections: SectionSelections | null;
    missing: SavedBundleItem[];
    replace: BundleEditTarget | null;
}

interface BuilderProps {
    model: ViewModel;
    settings: ShopSettings;
    config: MountConfig;
    editor: boolean;
    edit: EditState;
    /** `?subscription=` from a reminder email's reorder link, or null. */
    subscriptionId: string | null;
}

function rangeText(section: ViewSection): string {
    const { min, max } = section.limits;
    if (max === Number.POSITIVE_INFINITY) return `${min}+`;
    return min === max ? String(min) : `${min}–${max}`;
}

function missingText(content: MountConfig['content'], missing: Missing): string {
    return missing.section
        ? text(content, 'chooseMoreStep', { count: missing.count, step: missing.section.name })
        : text(content, 'chooseMore', { count: missing.count });
}

/** Product ids with at least one can in the case, in any step. */
function idsInCase(model: ViewModel, selections: SectionSelections): Set<string> {
    const ids = new Set<string>();
    for (const section of model.sections) {
        for (const pick of selections[section.id] ?? []) {
            const product = section.products.find((candidate) => candidate.variants.some((variant) => variant.id === pick.variantId));
            if (product && pick.quantity > 0) ids.add(product.id);
        }
    }
    return ids;
}

function Step({ section, index, total, inCase }: { section: ViewSection; index: number; total: number; inCase: Set<string> }) {
    const { selection, content, facetDefs, activeFacets, setActiveFacets, idPrefix } = useBuilder();
    const count = countOf(selection.selections, section.id);
    const products = visibleProducts(section, selection.conditions.hiddenProducts);
    const shown = applyFacets(products, facetDefs, activeFacets, inCase);
    const hasRule = section.limits.min > 0 || section.limits.max !== Number.POSITIVE_INFINITY;
    const optional = section.limits.min === 0;
    const counter =
        optional && section.limits.max === Number.POSITIVE_INFINITY
            ? text(content, 'stepCount', { count })
            : text(content, 'stepCountRange', { count, range: optional ? `0–${section.limits.max}` : rangeText(section) });
    const done = count >= section.limits.min && count > 0;
    const nothingMatches = isFiltering(facetDefs, activeFacets) && !shown.some((entry) => entry.matches);

    return (
        <section className="ckc-step" id={`${idPrefix}-step-${section.id}`} aria-labelledby={`${idPrefix}-step-title-${section.id}`} data-step-done={done || undefined}>
            {/* One step is the case itself: its name would only repeat the heading above it. */}
            <header className={`ckc-step__header${total === 1 ? ' ckc-visually-hidden' : ''}`}>
                {total > 1 ? <span className="ckc-step__index">{index + 1}</span> : null}
                <div className="ckc-step__titles">
                    <h3 className="ckc-step__title" id={`${idPrefix}-step-title-${section.id}`}>
                        {section.name}
                    </h3>
                    {section.description ? <p className="ckc-step__description">{section.description}</p> : null}
                </div>
                {/* A step with no rule of its own is counted bundle-wide, in the case rail. */}
                {hasRule ? (
                    <span className={`ckc-step__counter${done ? ' ckc-step__counter--done' : ''}`}>
                        {optional && count === 0 ? text(content, 'stepOptional') : counter}
                    </span>
                ) : null}
            </header>
            {nothingMatches ? (
                <div className="ckc-empty" role="status">
                    <p>{text(content, 'noMatches')}</p>
                    <button type="button" className="ckc-link" onClick={() => setActiveFacets({})}>
                        {text(content, 'clearFilters')}
                    </button>
                </div>
            ) : null}
            <div className="ckc-grid">
                {shown.map(({ product, matches }) => (
                    <ProductCard key={product.id} product={product} section={section} outsideFilter={!matches} />
                ))}
            </div>
        </section>
    );
}

export function Builder({ model, settings, config, editor, edit, subscriptionId }: BuilderProps) {
    const { content } = config;
    const selection = useSelection(model, edit.selections);
    const money = useMoney(model.bundle, settings);
    const plan = useRecurringPlan(model.bundle);
    const [open, setOpen] = useState<OpenProduct | null>(null);
    const [nudged, setNudged] = useState(false);
    const [activeFacets, setActiveFacets] = useState<ActiveFacets>({});
    // Plan errors show once the shopper has tried to add (or left the email field), not while
    // they are still typing their address.
    const [planTouched, setPlanTouched] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    // Ids unique per widget: the same bundle can be mounted twice on one page.
    const idPrefix = `ckc-${useId().replace(/:/g, '')}`;

    const facetDefs = useMemo(() => (content.showFacets ? parseFacetDefs(content.facets) : []), [content.showFacets, content.facets]);
    const labels = useMemo(() => lineLabels(content), [content]);

    const cart = useBundleAjaxCart({
        routePrefix: routePrefix(config.rootUrl),
        replace: edit.replace,
        onAdded: (result) => {
            // Themes with a cart drawer listen for this and refresh; the rest follow the redirect.
            rootRef.current?.dispatchEvent(new CustomEvent('kitenzo:bundle-added', { bubbles: true, detail: { bundleId: model.bundle.id, result } }));
            if (content.afterAdd === 'cart') window.location.assign(cartUrl(config.rootUrl));
        },
    });

    const hiddenSections = selection.conditions.hiddenSectionIds;
    const sections = model.sections.filter((section) => !hiddenSections.includes(section.id) && section.products.length > 0);
    const missing = missingPicks(model, selection.selections, hiddenSections);
    const blockingProblem = model.problems.some((problem) => problem.blocking);
    // A draft previews in the theme editor, and the API refuses to configure it.
    const draft = !model.bundle.published;
    const planIssue = planProblem(content, plan.errors, plan.choice);
    const canAdd = selection.isSatisfied && !planIssue && !selection.conditions.hideCartButton && !blockingProblem && !draft && !cart.isAdded;
    // A connection that dropped mid-add leaves the lines' fate unknown. The cart hook keeps that add
    // and finishes it on the next press (reading the cart back first, so nothing doubles), with the
    // selection it was started with. So the selection is held until it completes: letting the
    // shopper change it would add the old bundle while showing them the new one.
    const unconfirmed = cart.failureReason === 'cart-error' && cart.error !== null && !(cart.error instanceof AjaxCartError);
    const count = countOf(selection.selections);
    // The engine counts required products into the case (and into the tiers), so the ladder does too.
    const caseCount = count + model.requiredCount;
    const ladder = useMemo(() => tierLadder(model.bundle.discount, caseCount), [model.bundle.discount, caseCount]);
    const inCase = useMemo(() => idsInCase(model, selection.selections), [model, selection.selections]);

    // "Advance when this step is done" is the merchant's setting, per step: mirror it, never assume it.
    // The counts start from the first render, so a case that opens already filled (a basket Edit)
    // does not scroll the page on load.
    const previousCounts = useRef<Map<number, number> | null>(null);
    useEffect(() => {
        if (!previousCounts.current) {
            previousCounts.current = new Map(sections.map((section) => [section.id, countOf(selection.selections, section.id)]));
            return;
        }
        const counts = previousCounts.current;
        sections.forEach((section, index) => {
            const before = counts.get(section.id) ?? 0;
            const now = countOf(selection.selections, section.id);
            counts.set(section.id, now);
            const full = section.limits.max !== Number.POSITIVE_INFINITY ? now >= section.limits.max : now >= section.limits.min && section.limits.min > 0;
            const wasFull = section.limits.max !== Number.POSITIVE_INFINITY ? before >= section.limits.max : before >= section.limits.min && section.limits.min > 0;
            const next = sections[index + 1];
            if (section.autoNext && full && !wasFull && now > before && next) {
                document.getElementById(`${idPrefix}-step-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }, [selection.selections, sections, idPrefix]);

    // When the shopper stays on the page, "Added" shows for a moment, then the builder can add again.
    const { isAdded, reset } = cart;
    useEffect(() => {
        if (isAdded && content.afterAdd === 'stay') {
            const timer = window.setTimeout(reset, 4000);
            return () => window.clearTimeout(timer);
        }
        return undefined;
    }, [isAdded, reset, content.afterAdd]);

    let status = '';
    let statusIsError = false;
    if (cart.shopperMessage) {
        status = unconfirmed ? `${cart.shopperMessage} ${text(content, 'retryAdd')}` : cart.shopperMessage;
        statusIsError = true;
    } else if (cart.isAdded) {
        status = text(content, 'added');
    } else if (draft && editor) {
        status = 'This bundle is a draft, so it previews here but cannot be added to a cart until you publish it in Kitenzo.';
    } else if (blockingProblem) {
        status = text(content, 'unavailable');
    } else if (missing[0]) {
        status = missingText(content, missing[0]);
    } else if (!selection.isSatisfied) {
        // A rule other than a count (one per product, multiples of, a price or weight limit, one of
        // several allowed sizes) refuses this selection. The SDK names it only in its own words, so
        // the merchant's sentence always comes first and the SDK's detail goes to the theme editor.
        status = editor && selection.errors[0] ? `${text(content, 'notAllowed')} (${selection.errors[0].message})` : text(content, 'notAllowed');
    } else if (planIssue) {
        status = planIssue;
    }

    const onAdd = useCallback(() => {
        if (cart.isAdding) return;
        if (!canAdd && !unconfirmed) {
            setNudged(true);
            window.setTimeout(() => setNudged(false), 1200);
            if (selection.isSatisfied && planIssue) {
                // The case is ready and only the plan is not: take the shopper to what is missing.
                setPlanTouched(true);
                const field = rootRef.current?.querySelector<HTMLInputElement>('[data-ckc-email]');
                field?.focus({ preventScroll: true });
                field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }
        void cart.addToCart(model.bundle, selection.selections, { recurring: plan.choice, recurringLabels: labels });
    }, [canAdd, unconfirmed, cart, model.bundle, selection.selections, selection.isSatisfied, planIssue, plan.choice, labels]);

    const buy: BuyState = {
        canAdd: canAdd || unconfirmed,
        status,
        statusIsError,
        onAdd,
        cart,
        label: plan.choice?.type === 'reorder' ? text(content, 'addToCartReorder') : plan.choice ? text(content, 'addToCartSubscribe') : text(content, 'addToCart'),
        planTouched,
        touchPlan: () => setPlanTouched(true),
    };
    const context = useMemo<BuilderContextValue>(
        () => ({
            model,
            selection,
            money,
            content,
            editor,
            locked: cart.isAdding || unconfirmed,
            idPrefix,
            openDetails: (productId, sectionId) => setOpen({ productId, sectionId }),
            facetDefs,
            activeFacets,
            setActiveFacets,
            ladder,
            plan,
        }),
        [model, selection, money, content, editor, cart.isAdding, unconfirmed, idPrefix, facetDefs, activeFacets, ladder, plan],
    );

    const heading = content.heading || model.bundle.name;
    const intro = content.intro || model.bundle.description;
    const pool = sections.flatMap((section) => visibleProducts(section, selection.conditions.hiddenProducts));

    return (
        <BuilderContext.Provider value={context}>
            <div
                ref={rootRef}
                className={`ckc-root${nudged ? ' ckc-root--nudged' : ''}`}
                data-testid="cc-root"
                data-complete={selection.isSatisfied ? 'true' : 'false'}
                data-qa-count={count}
            >
                {editor && model.problems.length > 0 ? (
                    <EditorPanel>
                        <ul className="ckc-editor-panel__list">
                            {model.problems.map((problem) => (
                                <li key={problem.detail}>{problem.detail}</li>
                            ))}
                        </ul>
                    </EditorPanel>
                ) : null}
                {!editor && blockingProblem ? (
                    <div className="ckc-error" data-testid="cc-error" role="alert">
                        <p>{text(content, 'unavailable')}</p>
                    </div>
                ) : null}
                <div className="ckc-layout">
                    <div className="ckc-shop">
                        <header className="ckc-header">
                            <p className="ckc-header__eyebrow">{text(content, 'eyebrow')}</p>
                            <h2 className="ckc-header__title">{heading}</h2>
                            {intro ? <p className="ckc-header__intro">{intro}</p> : null}
                        </header>
                        {/* Only an edit that will really replace the cart line says so. When the saved case
                            could not be restored, `replace` is null and the add creates a new one. */}
                        {edit.isEditing && edit.replace ? (
                            <div className="ckc-notice" role="status">
                                <p>{text(content, 'editNotice')}</p>
                                {edit.missing.length > 0 ? <p>{text(content, 'editMissing')}</p> : null}
                            </div>
                        ) : null}
                        {plan.subscription ? (
                            <div className="ckc-notice ckc-notice--club" role="status" data-testid="ckc-reorder-notice">
                                <p>{text(content, 'reorderNotice', { frequency: frequencyText(content, plan.subscription.frequency, plan.subscription.unit) })}</p>
                            </div>
                        ) : reorderExpired(subscriptionId, model.bundle) ? (
                            <div className="ckc-notice" role="status" data-testid="ckc-reorder-notice">
                                <p>{text(content, 'reorderExpired')}</p>
                            </div>
                        ) : null}
                        <FacetBar products={pool} />
                        <div className="ckc-steps">
                            {sections.map((section, index) => (
                                <Step key={section.id} section={section} index={index} total={sections.length} inCase={inCase} />
                            ))}
                        </div>
                    </div>
                    <SummaryRail buy={buy} />
                </div>
                <MobileBar buy={buy} />
                <ProductDialog open={open} onClose={() => setOpen(null)} />
            </div>
        </BuilderContext.Provider>
    );
}
