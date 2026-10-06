/*
 * The builder: choose a box, fill it flavour by flavour, buy it.
 *
 * The box is the interface. Its sizes are the exact counts the bundle's rules allow (box.ts), its
 * slots fill in the order the shopper picks, and the add to cart waits for the box the shopper
 * chose to be full as well as for the SDK to accept the selection. A bundle with no sizes to choose still
 * renders: no size chooser, and a tray as big as the step allows.
 *
 * Any other steps the bundle has render as plain flavour grids after the box, so a merchant who
 * adds, say, a gift card step does not lose it.
 */
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useBundleAjaxCart, useBundleBuilder, useMoney, type BundleDetail, type SelectionProgress, type ShopSettings, type UseBundleEditResult } from '@kitenzo/react';

import { planFill, seededRandom } from '../autofill';
import { boxOffers, boxSection, boxSizes, flavourPricing, sizeFor } from '../box';
import { cartUrl, routePrefix, type MountConfig } from '../config';
import { cartMessages, text } from '../content';
import { toViewModel, type ViewSection } from '../model';
import { isStepDone, isStepFinished, missingPicks, pickedCount, usePickOrder, type Missing } from '../selection';
import { BuilderContext, SelectionContext, useBuilder, useSelection, type Box, type BuilderContextValue, type SelectionContextValue } from './context';
import { EditorPanel } from './Notice';
import { ProductCard } from './ProductCard';
import { ProductDialog, type OpenProduct } from './ProductDialog';
import { SizeChooser } from './SizeChooser';
import { MobileBar, SummaryRail, type BuyState } from './Summary';
import { SwitchDialog } from './SwitchDialog';

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

/** A numbered heading, the way a printed menu sets its courses. */
function StepHeading({ index, title, description, aside, id }: { index: number; title: string; description?: string; aside?: React.ReactNode; id: string }) {
    return (
        <header className="mcb-step__header">
            <span className="mcb-step__index" aria-hidden="true">
                {String(index).padStart(2, '0')}
            </span>
            <div className="mcb-step__titles">
                <h3 className="mcb-step__title" id={id}>
                    {title}
                </h3>
                {description ? <p className="mcb-step__description">{description}</p> : null}
            </div>
            {aside}
        </header>
    );
}

/*
 * Memoised on its step, which the model keeps between picks: the step is drawn again by a change
 * to either context, never by the Builder alone.
 */
const FlavourStep = memo(function FlavourStep({ section, index }: { section: ViewSection; index: number }) {
    const { content, box, idPrefix } = useBuilder();
    const { progress, size } = useSelection();
    const count = progress.sections[section.id]?.quantity ?? 0;
    const isBox = box?.section.id === section.id;
    const optional = section.limits.min === 0;
    const counter = isBox
        ? null
        : optional && section.limits.max === null
          ? text(content, 'stepCount', { count })
          : text(content, 'stepCountRange', { count, range: optional ? `0–${section.limits.max}` : rangeText(section) });
    // The box step is done when the box the shopper chose is full, which only the widget knows.
    const done = isBox && size !== null ? count === size : isStepDone(section, progress);

    return (
        <section className="mcb-step" id={`${idPrefix}-step-${section.id}`} aria-labelledby={`${idPrefix}-step-title-${section.id}`} data-step-done={done || undefined}>
            <StepHeading
                index={index}
                id={`${idPrefix}-step-title-${section.id}`}
                title={section.name}
                description={section.description}
                aside={counter ? <span className="mcb-step__counter">{optional && count === 0 ? text(content, 'stepOptional') : counter}</span> : null}
            />
            <div className="mcb-grid">
                {section.products.map((product) => (
                    <ProductCard key={product.id} product={product} section={section} />
                ))}
            </div>
        </section>
    );
});

export function Builder({ bundle, settings, config, editor, edit }: BuilderProps) {
    const { content } = config;
    // Created WITH its opening selection (a basket Edit), never filled from an effect after the
    // first paint: an effect paints an empty box for one frame, and a shopper who taps in that
    // frame adds to the wrong state.
    const builder = useBundleBuilder(bundle, { initialSelections: edit.selections });
    const { selections, progress, conditions, addItem, removeItem, updateQuantity, blockedReason } = builder;
    const { order, place, removeAt, shrinkTo } = usePickOrder(builder);
    // The builder keeps `conditions` until something in it changes, so the model is rebuilt only
    // when what is offered changes, and every product and step in it keeps its identity between picks.
    const model = useMemo(() => toViewModel(bundle, settings, conditions), [bundle, settings, conditions]);
    const { sections } = model;
    // The page's language, not the browser's: a market amount reads as the storefront writes it.
    const locale = document.documentElement.lang || undefined;
    const money = useMoney(bundle, { locale });
    const [open, setOpen] = useState<OpenProduct | null>(null);
    const [nudged, setNudged] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    // Ids unique per widget: the same bundle can be mounted twice on one page.
    const idPrefix = `mcb${useId().replace(/:/g, '')}`;
    const trayId = `${idPrefix}-tray`;

    // ----- The box ---------------------------------------------------------------------------
    const section = useMemo(() => boxSection(model), [model]);
    const sizes = useMemo(() => (section ? boxSizes(model, section) : []), [model, section]);
    const offers = useMemo(() => (section ? boxOffers(bundle, section, sizes, money, { settings, locale }) : []), [bundle, section, sizes, money, settings, locale]);
    const box = useMemo<Box | null>(() => (section ? { section, sizes, offers, flavourPricing: flavourPricing(bundle, sizes, offers) } : null), [bundle, section, sizes, offers]);
    const inBox = section ? (progress.sections[section.id]?.quantity ?? 0) : 0;
    // A restored bundle (basket Edit) opens in the box it was bought in.
    const [size, setSize] = useState<number | null>(() => (inBox > 0 ? sizeFor(sizes, inBox) : null));
    const [pendingSize, setPendingSize] = useState<number | null>(null);
    const [fillNote, setFillNote] = useState<string | null>(null);
    const slots = sizes.length > 0 ? size : (section?.limits.max ?? null);

    const choose = useCallback(
        (next: number) => {
            setFillNote(null);
            // Never drop a pick quietly: a smaller box than the tray holds asks which way to go.
            if (inBox > next) setPendingSize(next);
            else setSize(next);
        },
        [inBox],
    );

    const confirmSwitch = useCallback(() => {
        if (!section || pendingSize === null) return;
        shrinkTo(section.id, pendingSize);
        setSize(pendingSize);
        setPendingSize(null);
    }, [pendingSize, section, shrinkTo]);

    const fillRest = useCallback(() => {
        if (!section || slots === null) return;
        const empty = slots - inBox;
        // What the page shows in the step is what the fill may choose from; the plan's own
        // builder decides which of those go in.
        const plan = planFill(bundle, selections, section.id, [...section.byVariantId.keys()], empty, seededRandom(Math.floor(Math.random() * 2 ** 32)));
        // Through the builder, one macaron at a time, exactly as if the shopper had tapped each.
        const taken = place(section.id, plan);
        setFillNote(taken < empty ? text(content, 'fillShort', { count: taken }) : null);
    }, [bundle, content, inBox, place, section, selections, slots]);

    // ----- The cart --------------------------------------------------------------------------
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

    // A connection that dropped mid-add leaves the lines' fate unknown. The cart hook keeps that add
    // and finishes it on the next press (reading the cart back first, so nothing doubles), with the
    // selection it was started with. So the selection is held until it completes: letting the
    // shopper change it would add the old box while showing them the new one.
    const unconfirmed = cart.isResumable;

    const locked = cart.isAdding || unconfirmed;

    const missing = missingPicks(sections, progress);
    const blockingProblem = model.problems.some((problem) => problem.blocking);
    // A draft previews in the theme editor, and the API refuses to configure it.
    const draft = !bundle.published;
    // The SDK says whether the selection is a box it will sell; the box the shopper chose has to
    // be full too, or six macarons in a box of twelve would quietly be sold as a box of six.
    const boxFilled = sizes.length === 0 || (size !== null && inBox === size);
    const complete = builder.isSatisfied && boxFilled;
    const canAdd = complete && !conditions.hideCartButton && !blockingProblem && !draft && !cart.isAdded;

    // "Advance when this step is done" is the merchant's setting, per step: mirror it, never assume it.
    // Only a pick that finishes a step advances, so a box that opens already filled (a basket
    // Edit) does not scroll the page on load. The box step is finished when the chosen box is
    // full, not when the largest one is.
    const previousProgress = useRef(progress);
    useEffect(() => {
        const before = previousProgress.current;
        previousProgress.current = progress;
        if (before === progress) return;
        const finished = (candidate: ViewSection, at: SelectionProgress) =>
            candidate.id === section?.id && slots !== null ? (at.sections[candidate.id]?.quantity ?? 0) >= slots : isStepFinished(candidate, at);
        sections.forEach((candidate, index) => {
            const next = sections[index + 1];
            const grew = (progress.sections[candidate.id]?.quantity ?? 0) > (before.sections[candidate.id]?.quantity ?? 0);
            if (candidate.autoNext && next && grew && finished(candidate, progress) && !finished(candidate, before)) {
                document.getElementById(`${idPrefix}-step-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }, [progress, sections, section, slots, idPrefix]);

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
    } else if (sizes.length > 0 && size === null) {
        status = text(content, 'chooseSize');
    } else if (sizes.length > 0 && size !== null && inBox < size) {
        status = text(content, 'chooseMoreBox', { count: size - inBox, size });
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

    // While an add is unconfirmed the button stays pressable: pressing it finishes that add.
    const buy: BuyState = { canAdd: canAdd || unconfirmed, complete, status, statusIsError, onAdd, cart };
    const openDetails = useCallback((productId: string, sectionId: number) => setOpen({ productId, sectionId }), []);
    // Two values, each memoised on what it holds. A render that changes neither (the nudge, the
    // details dialog) draws no card again; see ./context.
    const context = useMemo<BuilderContextValue>(
        () => ({ model, money, content, editor, idPrefix, box, openDetails, addItem, removeItem, updateQuantity, blockedReason }),
        [model, money, content, editor, idPrefix, box, openDetails, addItem, removeItem, updateQuantity, blockedReason],
    );
    const selection = useMemo<SelectionContextValue>(
        () => ({ selections, progress, locked, order, removeAt, size, slots, choose, fillRest, fillNote }),
        [selections, progress, locked, order, removeAt, size, slots, choose, fillRest, fillNote],
    );

    const heading = content.heading || bundle.name;
    const intro = content.intro || bundle.description;
    const hasSizes = sizes.length > 0;

    return (
        <BuilderContext.Provider value={context}>
            <SelectionContext.Provider value={selection}>
                <div
                    ref={rootRef}
                    className={`mcb-root${nudged ? ' mcb-root--nudged' : ''}`}
                    data-testid="cc-root"
                    data-complete={complete ? 'true' : 'false'}
                    data-qa-count={pickedCount(progress)}
                >
                    {editor && model.problems.length > 0 ? (
                        <EditorPanel>
                            <ul className="mcb-editor-panel__list">
                                {model.problems.map((problem) => (
                                    <li key={problem.detail}>{problem.detail}</li>
                                ))}
                            </ul>
                        </EditorPanel>
                    ) : null}
                    {!editor && blockingProblem ? (
                        <div className="mcb-error" data-testid="cc-error" role="alert">
                            <p>{text(content, 'unavailable')}</p>
                        </div>
                    ) : null}
                    <header className="mcb-header">
                        <h2 className="mcb-header__title">{heading}</h2>
                        {intro ? <p className="mcb-header__intro">{intro}</p> : null}
                    </header>
                    {/* Only an edit that will really replace the cart line says so. When the saved box
                        could not be restored, `replace` is null and the add creates a new one. */}
                    {edit.isEditing && edit.replace ? (
                        <div className="mcb-notice" role="status">
                            <p>{text(content, 'editNotice')}</p>
                            {edit.missing.length > 0 ? <p>{text(content, 'editMissing')}</p> : null}
                        </div>
                    ) : null}
                    <div className="mcb-layout">
                        <div className="mcb-steps">
                            {hasSizes ? <SizeChooser /> : null}
                            {sections.map((candidate, index) => (
                                <FlavourStep key={candidate.id} section={candidate} index={index + (hasSizes ? 2 : 1)} />
                            ))}
                        </div>
                        <SummaryRail buy={buy} trayId={trayId} />
                    </div>
                    <MobileBar buy={buy} trayId={trayId} />
                    <ProductDialog open={open} onClose={() => setOpen(null)} />
                    <SwitchDialog
                        pending={pendingSize}
                        current={size}
                        count={inBox}
                        onConfirm={confirmSwitch}
                        onCancel={() => setPendingSize(null)}
                    />
                </div>
            </SelectionContext.Provider>
        </BuilderContext.Provider>
    );
}
