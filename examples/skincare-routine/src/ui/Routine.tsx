/*
 * One routine: the builder, seeded at creation, and the two ways of looking at it (the review and
 * the wizard), the summary, and the add to cart.
 *
 * Mounted by Builder.tsx once there is a seed (the quiz's routine, a basket Edit, or nothing after
 * "Skip"), and keyed, so a retaken quiz is a new builder rather than a rewrite of this one.
 */
import { useEffect, useId, useRef, useState } from 'react';

import { AjaxCartError } from '@kitenzo/core';
import { useBundleAjaxCart, type ShopSettings } from '@kitenzo/react';

import { cartUrl, routePrefix, type MountConfig } from '../config';
import { text } from '../content';
import type { ViewModel, ViewSection } from '../model';
import { useMoney } from '../money';
import { countOf, isStepFull, isStepMet, missingPicks, useSelection, type Missing } from '../selection';
import type { EditState, Stage } from './Builder';
import { BuilderContext, type BuilderContextValue } from './context';
import { ProductDialog, type OpenProduct } from './ProductDialog';
import { Review } from './Review';
import { Shell } from './Shell';
import { MobileBar, SummaryRail, type BuyState } from './Summary';
import { Wizard } from './Wizard';

interface RoutineProps {
    model: ViewModel;
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

export function Routine({ model, settings, config, editor, edit, stage, onRetake }: RoutineProps) {
    const { content } = config;
    const selection = useSelection(model, stage.seed);
    const money = useMoney(model.bundle, settings);
    // Ids unique per widget: the same bundle can be mounted twice on one page.
    const idPrefix = `skr${useId().replace(/:/g, '')}`;
    const [view, setView] = useState(stage.view);
    const [stepId, setStepId] = useState<number | null>(null);
    const [open, setOpen] = useState<OpenProduct | null>(null);
    const [nudged, setNudged] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const advance = useRef<number>();
    useEffect(() => () => window.clearTimeout(advance.current), []);

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
    const index = Math.max(
        0,
        sections.findIndex((section) => section.id === stepId),
    );
    const current = sections[index];
    const missing = missingPicks(model, selection.selections, hiddenSections);
    const blockingProblem = model.problems.some((problem) => problem.blocking);
    // A draft previews in the theme editor, and the API refuses to configure it.
    const draft = !model.bundle.published;
    const canAdd = selection.isSatisfied && !selection.conditions.hideCartButton && !blockingProblem && !draft && !cart.isAdded;
    // A connection that dropped mid-add leaves the lines' fate unknown. The cart hook keeps that add
    // and finishes it on the next press (reading the cart back first, so nothing doubles), with the
    // selection it was started with. So the selection is held until it completes: letting the
    // shopper change it would add the old routine while showing them the new one.
    const unconfirmed = cart.failureReason === 'cart-error' && cart.error !== null && !(cart.error instanceof AjaxCartError);
    const count = countOf(selection.selections);

    // A step can be opened once every step before it has what it needs.
    const firstUnmet = sections.findIndex((section) => !isStepMet(section, selection.selections));
    const reachable = (position: number) => firstUnmet === -1 || position <= firstUnmet;

    const nudge = () => {
        setNudged(true);
        window.setTimeout(() => setNudged(false), 1200);
    };

    const showStep = (sectionId: number) => {
        window.clearTimeout(advance.current);
        setView('wizard');
        setStepId(sectionId);
    };

    const goToStep = (sectionId: number) => {
        const position = sections.findIndex((section) => section.id === sectionId);
        if (position < 0) return;
        if (!reachable(position)) {
            // Open the step that is holding things up, so its status says what it needs.
            showStep(sections[firstUnmet]!.id);
            nudge();
            return;
        }
        showStep(sectionId);
    };

    // "Advance when this step is done" is the merchant's setting, per step: mirror it, never assume
    // it. It answers the shopper's own pick (called from the card), never a seed or a size change.
    const onPicked = (section: ViewSection) => {
        const now = countOf(selection.builder.getState().selections, section.id);
        const position = sections.findIndex((entry) => entry.id === section.id);
        const next = sections[position + 1];
        if (!section.autoNext || !next || !isStepFull(section, now)) return;
        window.clearTimeout(advance.current);
        advance.current = window.setTimeout(() => {
            setOpen(null);
            setStepId(next.id);
        }, ADVANCE_MS);
    };

    // A conditions-engine "go to step" is the merchant's too.
    const gotoSectionId = selection.conditions.gotoSectionId;
    useEffect(() => {
        if (gotoSectionId !== undefined && sections.some((section) => section.id === gotoSectionId)) showStep(gotoSectionId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gotoSectionId]);

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
    }, [view, current?.id]);

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
        // A rule other than a count (one per product, multiples of, a price or weight limit) refuses
        // this selection. The SDK names it only once every step has a pick, and in its own words, so
        // the merchant's sentence always comes first and the SDK's detail goes to the theme editor.
        status = editor && selection.errors[0] ? `${text(content, 'notAllowed')} (${selection.errors[0].message})` : text(content, 'notAllowed');
    }

    const onAdd = () => {
        if (cart.isAdding) return;
        if (!canAdd && !unconfirmed) {
            nudge();
            return;
        }
        void cart.addToCart(model.bundle, selection.selections);
    };

    const onContinue = () => {
        if (!current) return;
        if (!isStepMet(current, selection.selections)) {
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
    const context: BuilderContextValue = {
        model,
        selection,
        money,
        content,
        editor,
        locked: cart.isAdding || unconfirmed,
        idPrefix,
        answers: stage.answers,
        recommended: stage.plan?.picks ?? [],
        openDetails: (productId, sectionId) => setOpen({ productId, sectionId }),
        onPicked,
        goToStep,
    };

    return (
        <BuilderContext.Provider value={context}>
            <Shell model={model} content={content} editor={editor} complete={selection.isSatisfied} count={count} nudged={nudged} stage={view} rootRef={rootRef}>
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
                            <Review ref={headingRef} sections={sections} onAdjust={() => goToStep(sections[0]?.id ?? -1)} onRetake={context.locked ? null : onRetake} />
                        ) : (
                            <Wizard
                                ref={headingRef}
                                sections={sections}
                                index={index}
                                heading={content.heading || model.bundle.name}
                                intro={content.intro || model.bundle.description}
                                status={stepShort ? missingText(content, stepShort) : ''}
                                reachable={reachable}
                                onStep={goToStep}
                                onBack={() => sections[index - 1] && showStep(sections[index - 1]!.id)}
                                onContinue={onContinue}
                            />
                        )}
                    </div>
                    <SummaryRail buy={buy} sections={sections} showLines={view === 'wizard'} />
                </div>
                <MobileBar buy={buy} />
                <ProductDialog open={open} onClose={() => setOpen(null)} />
            </Shell>
        </BuilderContext.Provider>
    );
}
