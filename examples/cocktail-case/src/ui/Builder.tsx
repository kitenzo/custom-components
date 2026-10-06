/*
 * The builder: filters, the cans, the case, and the add to cart.
 *
 * Laid out for a mix-a-case bundle (one step, a bundle-wide count, tiers on the number of cans),
 * but nothing in it assumes that shape: several steps render as several grids under one set of
 * filters, and a bundle without tiers simply has no ladder. Restyle it in styles.css; reshape it
 * here.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useBundleAjaxCart, useBundleBuilder, useMoney, useRecurringPlan, type BundleDetail, type SectionSelections, type ShopSettings, type UseBundleEditResult } from '@kitenzo/react';

import { cartUrl, routePrefix, type MountConfig } from '../config';
import { cartMessages, text } from '../content';
import { applyFacets, indexFacets, isFiltering, parseFacetDefs, type ActiveFacets } from '../facets';
import { toViewModel, type ViewModel, type ViewSection } from '../model';
import { frequencyText, lineLabels, planMessages } from '../recurring';
import { isStepDone, isStepFinished, missingPicks, pickedCount, type Missing } from '../selection';
import { readLadder } from '../tiers';
import { BuilderContext, SelectionContext, useBuilder, useSelection, type BuilderContextValue, type SelectionContextValue } from './context';
import { FacetBar } from './FacetBar';
import { EditorPanel } from './Notice';
import { ProductCard } from './ProductCard';
import { ProductDialog, type OpenProduct } from './ProductDialog';
import { MobileBar, SummaryRail, type BuyState } from './Summary';

interface BuilderProps {
    bundle: BundleDetail;
    /** Loaded before the builder renders: they decide what is offered. */
    settings: ShopSettings;
    config: MountConfig;
    editor: boolean;
    edit: Pick<UseBundleEditResult, 'isEditing' | 'selections' | 'missing' | 'replace'>;
    /** `?subscription=` from a reminder email's reorder link, or null. */
    subscriptionId: string | null;
}

function rangeText(section: ViewSection): string {
    const { min, max } = section.limits;
    if (max === null) return `${min}+`;
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
            const offered = section.byVariantId.get(pick.variantId);
            if (offered && pick.quantity > 0) ids.add(offered.product.id);
        }
    }
    return ids;
}

function Step({ section, index, total, inCase }: { section: ViewSection; index: number; total: number; inCase: Set<string> }) {
    const { content, facets, activeFacets, setActiveFacets, idPrefix } = useBuilder();
    const { progress } = useSelection();
    const count = progress.sections[section.id]?.quantity ?? 0;
    const shown = applyFacets(section.products, facets, activeFacets, inCase);
    const hasRule = section.limits.min > 0 || section.limits.max !== null;
    const optional = section.limits.min === 0;
    const counter =
        optional && section.limits.max === null
            ? text(content, 'stepCount', { count })
            : text(content, 'stepCountRange', { count, range: optional ? `0–${section.limits.max}` : rangeText(section) });
    const done = isStepDone(section, progress);
    const nothingMatches = isFiltering(facets, activeFacets) && !shown.some((entry) => entry.matches);

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

export function Builder({ bundle, settings, config, editor, edit, subscriptionId }: BuilderProps) {
    const { content } = config;
    // Created WITH its opening selection (a basket Edit), never filled from an effect after the
    // first paint: an effect paints an empty case for one frame, and a shopper who taps in that
    // frame adds to the wrong state.
    const builder = useBundleBuilder(bundle, { initialSelections: edit.selections });
    const { selections, progress, conditions, addItem, updateQuantity, blockedReason } = builder;
    // The builder keeps `conditions` until something in it changes, so the model is rebuilt only
    // when what is offered changes, and every product and step in it keeps its identity between picks.
    const model = useMemo(() => toViewModel(bundle, settings, conditions), [bundle, settings, conditions]);
    const { sections } = model;
    // The page's language, not the browser's: a market amount reads as the storefront writes it.
    const money = useMoney(bundle, { locale: document.documentElement.lang || undefined });
    // The theme's sentence for each reason a plan is refused, for the picker and the cart alike.
    const planWording = useMemo(() => planMessages(content), [content]);
    const plan = useRecurringPlan(bundle, { messages: planWording });
    const [open, setOpen] = useState<OpenProduct | null>(null);
    const [nudged, setNudged] = useState(false);
    const [activeFacets, setActiveFacets] = useState<ActiveFacets>({});
    // Plan errors show once the shopper has tried to add (or left the email field), not while
    // they are still typing their address.
    const [planTouched, setPlanTouched] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    // Ids unique per widget: the same bundle can be mounted twice on one page.
    const idPrefix = `ckc-${useId().replace(/:/g, '')}`;

    // The chips are made of what is offered and what the merchant configured, never of what is
    // picked: every product's tags are read once per model, and a pick reads none of them again.
    const facetDefs = useMemo(() => (content.showFacets ? parseFacetDefs(content.facets) : []), [content.showFacets, content.facets]);
    const pool = useMemo(() => model.sections.flatMap((section) => section.products), [model]);
    const facets = useMemo(() => indexFacets(pool, facetDefs), [pool, facetDefs]);
    const labels = useMemo(() => lineLabels(content), [content]);

    const cartWording = useMemo(() => ({ ...cartMessages(content), ...planWording }), [content, planWording]);
    const cart = useBundleAjaxCart({
        routePrefix: routePrefix(config.rootUrl),
        replace: edit.replace,
        messages: cartWording,
        onAdded: (result) => {
            // Themes with a cart drawer listen for this and refresh; the rest follow the redirect.
            rootRef.current?.dispatchEvent(new CustomEvent('kitenzo:bundle-added', { bubbles: true, detail: { bundleId: bundle.id, result } }));
            if (content.afterAdd === 'cart') window.location.assign(cartUrl(config.rootUrl));
        },
    });

    const missing = missingPicks(sections, progress);
    const blockingProblem = model.problems.some((problem) => problem.blocking);
    // A draft previews in the theme editor, and the API refuses to configure it.
    const draft = !bundle.published;
    const planIssue = plan.errors[0]?.message ?? null;
    const canAdd = builder.isSatisfied && !planIssue && !conditions.hideCartButton && !blockingProblem && !draft && !cart.isAdded;
    // A connection that dropped mid-add leaves the lines' fate unknown. The cart hook keeps that add
    // and finishes it on the next press (reading the cart back first, so nothing doubles), with the
    // selection it was started with. So the selection is held until it completes: letting the
    // shopper change it would add the old bundle while showing them the new one.
    const unconfirmed = cart.isResumable;
    const locked = cart.isAdding || unconfirmed;
    // The engine counts required products into the case (and into the tiers), so the ladder does too.
    const caseCount = progress.quantity;
    const ladder = useMemo(() => readLadder(bundle, caseCount), [bundle, caseCount]);
    const inCase = useMemo(() => idsInCase(model, selections), [model, selections]);

    // "Advance when this step is done" is the merchant's setting, per step: mirror it, never assume it.
    // Only a pick that finishes a step advances, so a case that opens already filled (a basket
    // Edit) does not scroll the page on load.
    const previousProgress = useRef(progress);
    useEffect(() => {
        const before = previousProgress.current;
        previousProgress.current = progress;
        if (before === progress) return;
        sections.forEach((section, index) => {
            const next = sections[index + 1];
            const grew = (progress.sections[section.id]?.quantity ?? 0) > (before.sections[section.id]?.quantity ?? 0);
            if (section.autoNext && next && grew && isStepFinished(section, progress) && !isStepFinished(section, before)) {
                document.getElementById(`${idPrefix}-step-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }, [progress, sections, idPrefix]);

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
    } else if (!builder.isSatisfied) {
        // A rule other than a count (multiples of, a price or weight limit, at least N of each)
        // refuses this selection. The SDK names it in `problems`, in its own words, so the
        // merchant's sentence always comes first and the SDK's detail goes to the theme editor.
        status = editor && builder.problems[0] ? `${text(content, 'notAllowed')} (${builder.problems[0].message})` : text(content, 'notAllowed');
    } else if (planIssue) {
        status = planIssue;
    }

    const onAdd = useCallback(() => {
        if (cart.isAdding) return;
        if (!canAdd && !unconfirmed) {
            setNudged(true);
            window.setTimeout(() => setNudged(false), 1200);
            if (builder.isSatisfied && planIssue) {
                // The case is ready and only the plan is not: take the shopper to what is missing.
                setPlanTouched(true);
                const field = rootRef.current?.querySelector<HTMLInputElement>('[data-ckc-email]');
                field?.focus({ preventScroll: true });
                field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }
        void cart.addToCart(bundle, selections, { recurring: plan.choice, recurringLabels: labels });
    }, [canAdd, unconfirmed, cart, bundle, selections, builder.isSatisfied, planIssue, plan.choice, labels]);

    const buy: BuyState = {
        canAdd: canAdd || unconfirmed,
        status,
        statusIsError,
        onAdd,
        cart,
        plan,
        label: plan.choice?.type === 'reorder' ? text(content, 'addToCartReorder') : plan.choice ? text(content, 'addToCartSubscribe') : text(content, 'addToCart'),
        planTouched,
        touchPlan: () => setPlanTouched(true),
    };
    const openDetails = useCallback((productId: string, sectionId: number) => setOpen({ productId, sectionId }), []);
    // Two values, each memoised on what it holds. A render that changes neither (the nudge, the
    // details dialog, the plan and its email field) draws no card again; see ./context.
    const context = useMemo<BuilderContextValue>(
        () => ({ model, money, content, editor, idPrefix, openDetails, addItem, updateQuantity, blockedReason, facets, activeFacets, setActiveFacets }),
        [model, money, content, editor, idPrefix, openDetails, addItem, updateQuantity, blockedReason, facets, activeFacets],
    );
    const selection = useMemo<SelectionContextValue>(() => ({ selections, progress, locked, ladder }), [selections, progress, locked, ladder]);

    const heading = content.heading || bundle.name;
    const intro = content.intro || bundle.description;

    return (
        <BuilderContext.Provider value={context}>
            <SelectionContext.Provider value={selection}>
                <div
                    ref={rootRef}
                    className={`ckc-root${nudged ? ' ckc-root--nudged' : ''}`}
                    data-testid="cc-root"
                    data-complete={builder.isSatisfied ? 'true' : 'false'}
                    data-qa-count={pickedCount(progress)}
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
                            {/* A reorder link whose subscription the bundle came back without (expired,
                                cancelled, another shop's) sells a one-time case and says so, never a
                                silent change of price. */}
                            {plan.subscription ? (
                                <div className="ckc-notice ckc-notice--club" role="status" data-testid="ckc-reorder-notice">
                                    <p>{text(content, 'reorderNotice', { frequency: frequencyText(content, plan.subscription.frequency, plan.subscription.unit) })}</p>
                                </div>
                            ) : subscriptionId !== null && !bundle.recurringSubscription ? (
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
            </SelectionContext.Provider>
        </BuilderContext.Provider>
    );
}
