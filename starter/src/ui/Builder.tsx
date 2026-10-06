/*
 * The builder: every step, the summary, and the add to cart.
 *
 * Generic on purpose. It draws any bundle the headless API can describe: one step or several,
 * per-step and bundle-wide counts, required products, product options, sold-out and capped
 * stock, conditions that hide steps or products. Restyle it in styles.css; reshape it here.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useBundleAjaxCart, useBundleBuilder, useMoney, type BundleDetail, type ShopSettings, type UseBundleEditResult } from '@kitenzo/react';

import { cartUrl, routePrefix, type MountConfig } from '../config';
import { cartMessages, text } from '../content';
import { toViewModel, type ViewSection } from '../model';
import { isStepDone, isStepFinished, missingPicks, pickedCount, type Missing } from '../selection';
import { BuilderContext, SelectionContext, useBuilder, useSelection, type BuilderContextValue, type SelectionContextValue } from './context';
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

function Step({ section, index, total }: { section: ViewSection; index: number; total: number }) {
    const { content, idPrefix } = useBuilder();
    const { progress } = useSelection();
    const count = progress.sections[section.id]?.quantity ?? 0;
    const optional = section.limits.min === 0;
    const counter =
        optional && section.limits.max === null
            ? text(content, 'stepCount', { count })
            : text(content, 'stepCountRange', { count, range: optional ? `0–${section.limits.max}` : rangeText(section) });
    const done = isStepDone(section, progress);

    return (
        <section className="kst-step" id={`${idPrefix}-step-${section.id}`} aria-labelledby={`${idPrefix}-step-title-${section.id}`} data-step-done={done || undefined}>
            <header className="kst-step__header">
                {total > 1 ? <span className="kst-step__index">{index + 1}</span> : null}
                <div className="kst-step__titles">
                    <h3 className="kst-step__title" id={`${idPrefix}-step-title-${section.id}`}>
                        {section.name}
                    </h3>
                    {section.description ? <p className="kst-step__description">{section.description}</p> : null}
                </div>
                <span className={`kst-step__counter${done ? ' kst-step__counter--done' : ''}`}>
                    {optional && count === 0 ? text(content, 'stepOptional') : counter}
                </span>
            </header>
            <div className="kst-grid">
                {section.products.map((product) => (
                    <ProductCard key={product.id} product={product} section={section} />
                ))}
            </div>
        </section>
    );
}

export function Builder({ bundle, settings, config, editor, edit }: BuilderProps) {
    const { content } = config;
    // Created WITH its opening selection (a basket Edit), never filled from an effect after the
    // first paint: an effect paints an empty bundle for one frame, and a shopper who taps in that
    // frame adds to the wrong state.
    const builder = useBundleBuilder(bundle, { initialSelections: edit.selections });
    const { selections, progress, conditions, addItem, removeItem, updateQuantity, blockedReason } = builder;
    // The builder keeps `conditions` until something in it changes, so the model is rebuilt only
    // when what is offered changes, and every product and step in it keeps its identity between picks.
    const model = useMemo(() => toViewModel(bundle, settings, conditions), [bundle, settings, conditions]);
    const { sections } = model;
    // The page's language, not the browser's: a market amount reads as the storefront writes it.
    const money = useMoney(bundle, { locale: document.documentElement.lang || undefined });
    const [open, setOpen] = useState<OpenProduct | null>(null);
    const [nudged, setNudged] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    // Ids unique per widget: the same bundle can be mounted twice on one page.
    const idPrefix = `kst-${useId().replace(/:/g, '')}`;

    const cartWording = useMemo(() => cartMessages(content), [content]);
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
    const canAdd = builder.isSatisfied && !conditions.hideCartButton && !blockingProblem && !draft && !cart.isAdded;
    // A connection that dropped mid-add leaves the lines' fate unknown. The cart hook keeps that add
    // and finishes it on the next press (reading the cart back first, so nothing doubles), with the
    // selection it was started with. So the selection is held until it completes: letting the
    // shopper change it would add the old bundle while showing them the new one.
    const unconfirmed = cart.isResumable;
    const locked = cart.isAdding || unconfirmed;

    // "Advance when this step is done" is the merchant's setting, per step: mirror it, never assume it.
    // Only a pick that finishes a step advances, so a bundle that opens already filled (a basket
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
    }

    const onAdd = useCallback(() => {
        if (cart.isAdding) return;
        if (!canAdd && !unconfirmed) {
            setNudged(true);
            window.setTimeout(() => setNudged(false), 1200);
            return;
        }
        void cart.addToCart(bundle, selections);
    }, [canAdd, unconfirmed, cart, bundle, selections]);

    const buy: BuyState = { canAdd: canAdd || unconfirmed, status, statusIsError, onAdd, cart };
    const openDetails = useCallback((productId: string, sectionId: number) => setOpen({ productId, sectionId }), []);
    // Two values, each memoised on what it holds. A render that changes neither (the nudge, the
    // details dialog) draws no card again; see ./context.
    const context = useMemo<BuilderContextValue>(
        () => ({ model, money, content, editor, idPrefix, openDetails, addItem, removeItem, updateQuantity, blockedReason }),
        [model, money, content, editor, idPrefix, openDetails, addItem, removeItem, updateQuantity, blockedReason],
    );
    const selection = useMemo<SelectionContextValue>(() => ({ selections, progress, locked }), [selections, progress, locked]);

    const heading = content.heading || bundle.name;
    const intro = content.intro || bundle.description;

    return (
        <BuilderContext.Provider value={context}>
            <SelectionContext.Provider value={selection}>
                <div
                    ref={rootRef}
                    className={`kst-root${nudged ? ' kst-root--nudged' : ''}`}
                    data-testid="cc-root"
                    data-complete={builder.isSatisfied ? 'true' : 'false'}
                    data-qa-count={pickedCount(progress)}
                >
                    {editor && model.problems.length > 0 ? (
                        <EditorPanel>
                            <ul className="kst-editor-panel__list">
                                {model.problems.map((problem) => (
                                    <li key={problem.detail}>{problem.detail}</li>
                                ))}
                            </ul>
                        </EditorPanel>
                    ) : null}
                    {!editor && blockingProblem ? (
                        <div className="kst-error" data-testid="cc-error" role="alert">
                            <p>{text(content, 'unavailable')}</p>
                        </div>
                    ) : null}
                    <header className="kst-header">
                        <h2 className="kst-header__title">{heading}</h2>
                        {intro ? <p className="kst-header__intro">{intro}</p> : null}
                    </header>
                    {/* Only an edit that will really replace the cart line says so. When the saved bundle
                        could not be restored, `replace` is null and the add creates a new bundle. */}
                    {edit.isEditing && edit.replace ? (
                        <div className="kst-notice" role="status">
                            <p>{text(content, 'editNotice')}</p>
                            {edit.missing.length > 0 ? <p>{text(content, 'editMissing')}</p> : null}
                        </div>
                    ) : null}
                    <div className="kst-layout">
                        <div className="kst-steps">
                            {sections.map((section, index) => (
                                <Step key={section.id} section={section} index={index} total={sections.length} />
                            ))}
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
