/*
 * One routine: the builder, seeded at creation, and the two ways of looking at it (the review and
 * the wizard), the summary, and the add to cart.
 *
 * Mounted by Builder.tsx once there is a seed (the quiz's routine, a basket Edit, or nothing after
 * "Skip"), and keyed, so a retaken quiz is a new builder rather than a rewrite of this one.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useBundleAjaxCart, useBundleBuilder, useMoney, type BundleDetail, type SelectionProgress, type ShopSettings } from '@kitenzo/react';

import { cartUrl, routePrefix, type MountConfig } from '../config';
import { cartMessages, text } from '../content';
import { toViewModel, type ViewSection } from '../model';
import type { Recommendation } from '../quiz';
import { isStepFinished, missingPicks, nearestShownStep, nextShownStep, pickedCount, type Missing } from '../selection';
import type { EditState, Stage } from './Builder';
import { BuilderContext, SelectionContext, type BuilderContextValue, type SelectionContextValue } from './context';
import { ProductDialog, type OpenProduct } from './ProductDialog';
import { Review } from './Review';
import { Shell } from './Shell';
import { MobileBar, SummaryRail, type BuyState } from './Summary';
import { Wizard } from './Wizard';

interface RoutineProps {
    bundle: BundleDetail;
    /** Loaded before the builder renders: they decide what is offered. */
    settings: ShopSettings;
    config: MountConfig;
    editor: boolean;
    edit: EditState;
    stage: Extract<Stage, { kind: 'routine' }>;
    onRetake: (() => void) | null;
}

/** Long enough to see the pick land on its card before the next step replaces it. */
const ADVANCE_MS = 450;

function missingText(content: MountConfig['content'], missing: Missing): string {
    return missing.section
        ? text(content, 'chooseMoreStep', { count: missing.count, step: missing.section.name })
        : text(content, 'chooseMore', { count: missing.count });
}

/** One list for every routine the quiz did not build, so the context keeps its value. */
const NO_PICKS: Recommendation[] = [];

/** Where the first step that still owes a pick sits, or -1. No step after it can be opened yet. */
function firstShortStep(sections: ViewSection[], progress: SelectionProgress): number {
    const short = missingPicks(sections, progress)[0]?.section;
    return short ? sections.indexOf(short) : -1;
}

export function Routine({ bundle, settings, config, editor, edit, stage, onRetake }: RoutineProps) {
    const { content } = config;
    // Created WITH its opening selection (the quiz's routine, a basket Edit), never filled from an
    // effect after the first paint: an effect paints an empty bundle for one frame, and a shopper
    // who taps in that frame adds to the wrong state.
    const builder = useBundleBuilder(bundle, { initialSelections: stage.seed });
    const { selections, progress, conditions, addItem, updateQuantity, swapItem, blockedReason, swapBlockedReason, goToSection } = builder;
    // The builder keeps `conditions` until something in it changes, so the model is rebuilt only
    // when what is offered changes, and every product and step in it keeps its identity between picks.
    const model = useMemo(() => toViewModel(bundle, settings, conditions), [bundle, settings, conditions]);
    const { sections } = model;
    // The page's language, not the browser's: a market amount reads as the storefront writes it.
    const money = useMoney(bundle, { locale: document.documentElement.lang || undefined });
    // Ids unique per widget: the same bundle can be mounted twice on one page.
    const idPrefix = `skr${useId().replace(/:/g, '')}`;
    const [view, setView] = useState(stage.view);
    const [open, setOpen] = useState<OpenProduct | null>(null);
    const [nudged, setNudged] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const advance = useRef<number>();
    useEffect(() => () => window.clearTimeout(advance.current), []);
    // The steps on screen and the counts as last drawn, for what runs after a render: the
    // auto-advance timer, and the callbacks shared through a context that must not change on
    // every pick. Declared before the effects that read it, so it is up to date when they run.
    const drawn = useRef({ sections, progress });
    useEffect(() => {
        drawn.current = { sections, progress };
    }, [sections, progress]);

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

    // The step on screen is the builder's current section, so the builder's `isSectionValid` is
    // about the step the shopper is looking at. The builder can sit on a step the wizard does not
    // show (hidden by a condition, or with no products to offer): the wizard then shows the nearest
    // step after it, and until the builder has been moved there, Continue stays held.
    const current = nearestShownStep(bundle.sections, sections, builder.currentSection?.id);
    const currentId = current?.id;
    const index = current ? sections.indexOf(current) : 0;
    const openSection = useCallback((sectionId: number) => goToSection(bundle.sections.findIndex((section) => section.id === sectionId)), [goToSection, bundle]);
    const inStep = current !== null && builder.currentSection?.id === current.id;
    const stepValid = inStep && builder.isSectionValid;
    useEffect(() => {
        if (currentId !== undefined && !inStep) openSection(currentId);
    }, [currentId, inStep, openSection]);
    const missing = missingPicks(sections, progress);
    const blockingProblem = model.problems.some((problem) => problem.blocking);
    // A draft previews in the theme editor, and the API refuses to configure it.
    const draft = !bundle.published;
    const canAdd = builder.isSatisfied && !conditions.hideCartButton && !blockingProblem && !draft && !cart.isAdded;
    // A connection that dropped mid-add leaves the lines' fate unknown. The cart hook keeps that add
    // and finishes it on the next press (reading the cart back first, so nothing doubles), with the
    // selection it was started with. So the selection is held until it completes: letting the
    // shopper change it would add the old routine while showing them the new one.
    const unconfirmed = cart.isResumable;
    const locked = cart.isAdding || unconfirmed;

    // A step can be opened once every step before it has what it needs.
    const firstShort = firstShortStep(sections, progress);
    const reachable = (position: number) => firstShort === -1 || position <= firstShort;

    const nudge = useCallback(() => {
        setNudged(true);
        window.setTimeout(() => setNudged(false), 1200);
    }, []);

    const showStep = useCallback(
        (sectionId: number) => {
            window.clearTimeout(advance.current);
            setView('wizard');
            openSection(sectionId);
        },
        [openSection],
    );

    const goToStep = useCallback(
        (sectionId: number) => {
            const shown = drawn.current.sections;
            const position = shown.findIndex((section) => section.id === sectionId);
            if (position < 0) return;
            const short = firstShortStep(shown, drawn.current.progress);
            if (short !== -1 && position > short) {
                // Open the step that is holding things up, so its status says what it needs.
                showStep(shown[short]!.id);
                nudge();
                return;
            }
            showStep(sectionId);
        },
        [showStep, nudge],
    );

    // "Advance when this step is done" is the merchant's setting, per step: mirror it, never assume
    // it. It answers the shopper's own pick (called from the card), never a seed or a size change,
    // and a swap in a full step advances like a first pick does, which a change in the step's
    // count alone would miss. Where to go is decided when the moment comes, from what is on screen
    // then: the pick may have hidden the step that was next, or have been taken out again.
    const onPicked = useCallback(
        (section: ViewSection) => {
            if (!section.autoNext) return;
            window.clearTimeout(advance.current);
            advance.current = window.setTimeout(() => {
                const next = nextShownStep(bundle.sections, drawn.current.sections, section.id);
                if (!next || !isStepFinished(section, drawn.current.progress)) return;
                setOpen(null);
                openSection(next.id);
            }, ADVANCE_MS);
        },
        [bundle, openSection],
    );

    // A conditions-engine "go to step" is the merchant's too.
    const gotoSectionId = conditions.gotoSectionId;
    useEffect(() => {
        if (gotoSectionId !== undefined && drawn.current.sections.some((section) => section.id === gotoSectionId)) showStep(gotoSectionId);
    }, [gotoSectionId, showStep]);

    // A new step or view replaces what the shopper was looking at: bring the widget's top back on
    // screen if it scrolled away, and move focus to the new heading so a screen reader announces
    // it. Not on a basket Edit's first paint, where focus is the page's.
    const shopperOpened = useRef(stage.key !== 0);
    useEffect(() => {
        if (!shopperOpened.current) {
            shopperOpened.current = true;
            return;
        }
        const root = rootRef.current;
        if (root && root.getBoundingClientRect().top < 0) root.scrollIntoView({ block: 'start', behavior: 'smooth' });
        headingRef.current?.focus({ preventScroll: true });
    }, [view, currentId]);

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

    const onAdd = () => {
        if (cart.isAdding) return;
        if (!canAdd && !unconfirmed) {
            nudge();
            return;
        }
        void cart.addToCart(bundle, selections);
    };

    const onContinue = () => {
        if (!current) return;
        if (!stepValid) {
            nudge();
            return;
        }
        const next = sections[index + 1];
        if (next) showStep(next.id);
        else {
            window.clearTimeout(advance.current);
            setView('review');
        }
    };

    const stepShort = current ? missing.find((entry) => entry.section?.id === current.id) : undefined;
    const buy: BuyState = { canAdd: canAdd || unconfirmed, status, statusIsError, onAdd, cart };
    const openDetails = useCallback((productId: string, sectionId: number) => setOpen({ productId, sectionId }), []);
    const { answers } = stage;
    const recommended = stage.plan?.picks ?? NO_PICKS;
    // Two values, each memoised on what it holds. A render that changes neither (the nudge, the
    // details dialog) draws no card again; see ./context.
    const context = useMemo<BuilderContextValue>(
        () => ({ model, money, content, editor, idPrefix, answers, recommended, openDetails, onPicked, goToStep, addItem, updateQuantity, swapItem, blockedReason, swapBlockedReason }),
        [model, money, content, editor, idPrefix, answers, recommended, openDetails, onPicked, goToStep, addItem, updateQuantity, swapItem, blockedReason, swapBlockedReason],
    );
    const selection = useMemo<SelectionContextValue>(() => ({ selections, progress, locked }), [selections, progress, locked]);

    return (
        <BuilderContext.Provider value={context}>
            <SelectionContext.Provider value={selection}>
                <Shell model={model} content={content} editor={editor} complete={builder.isSatisfied} count={pickedCount(progress)} nudged={nudged} stage={view} rootRef={rootRef}>
                    {/* Only an edit that will really replace the cart line says so. When the saved bundle
                        could not be restored, `replace` is null and the add creates a new routine. */}
                    {edit.isEditing && edit.replace ? (
                        <div className="skr-notice" role="status">
                            <p>{text(content, 'editNotice')}</p>
                            {edit.missing.length > 0 ? <p>{text(content, 'editMissing')}</p> : null}
                        </div>
                    ) : null}
                    <div className={`skr-layout skr-layout--${view}`}>
                        <div className="skr-main">
                            {view === 'review' ? (
                                <Review ref={headingRef} onAdjust={() => goToStep(sections[0]?.id ?? -1)} onRetake={locked ? null : onRetake} />
                            ) : (
                                <Wizard
                                    ref={headingRef}
                                    index={index}
                                    heading={content.heading || bundle.name}
                                    intro={content.intro || bundle.description}
                                    status={stepShort ? missingText(content, stepShort) : ''}
                                    canContinue={stepValid}
                                    reachable={reachable}
                                    onStep={goToStep}
                                    onBack={() => sections[index - 1] && showStep(sections[index - 1]!.id)}
                                    onContinue={onContinue}
                                />
                            )}
                        </div>
                        <SummaryRail buy={buy} showLines={view === 'wizard'} />
                    </div>
                    <MobileBar buy={buy} />
                    <ProductDialog open={open} onClose={() => setOpen(null)} />
                </Shell>
            </SelectionContext.Provider>
        </BuilderContext.Provider>
    );
}
