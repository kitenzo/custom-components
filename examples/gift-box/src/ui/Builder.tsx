/*
 * The builder: every step, what the shopper writes, the box preview, and the add to cart.
 *
 * Generic on purpose. It draws any bundle the headless API can describe: one step or several,
 * per-step and bundle-wide counts, required products, product options, sold-out and capped
 * stock, conditions that hide steps or products, and any text, dropdown or checkbox
 * personalisation the merchant defined. Restyle it in styles.css; reshape it here.
 *
 * The add is the SDK's (`useBundleAjaxCart`), and so is the route the shopper's answers take into
 * the order: they are passed to it as `properties` (personalisation.ts says what that does). The
 * buy button is gated on the SDK's `isSatisfied` AND on every answer being ready to send, and
 * says which one is not.
 */
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useBundleAjaxCart, useBundleBuilder, useMoney, type BundleDetail, type BundleVariant, type SectionSelections, type ShopSettings, type UseBundleEditResult } from '@kitenzo/react';

import { cartUrl, routePrefix, type MountConfig } from '../config';
import { cartMessages, text } from '../content';
import { toViewModel, type ViewSection } from '../model';
import { answersFromProperties, fieldIssues, lineProperties, type Answers, type FieldIssue } from '../personalisation';
import { isStepDone, isStepFinished, missingPicks, pickedCount, type Missing } from '../selection';
import {
    AnswersContext,
    BuilderContext,
    SelectionContext,
    fieldElementId,
    useBuilder,
    useSelection,
    type AnswersContextValue,
    type BuilderContextValue,
    type SelectionContextValue,
} from './context';
import { EditorPanel } from './Notice';
import { Personalise } from './Personalise';
import { FeaturedProduct, ProductCard } from './ProductCard';
import { ProductDialog, type OpenProduct } from './ProductDialog';
import { MobileBar, SummaryRail, type BuyState } from './Summary';

interface BuilderProps {
    bundle: BundleDetail;
    /** Loaded before the builder renders: they decide what is offered. */
    settings: ShopSettings;
    config: MountConfig;
    editor: boolean;
    /** `properties` is what the edited box was added with, as the cart recorded it. */
    edit: Pick<UseBundleEditResult, 'isEditing' | 'selections' | 'missing' | 'replace' | 'properties'>;
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

function issueText(content: MountConfig['content'], issue: FieldIssue): string {
    return issue.kind === 'missing'
        ? text(content, 'fieldMissing', { field: issue.field.label, product: issue.productTitle })
        : text(content, 'fieldTooLong', { field: issue.field.label, product: issue.productTitle, count: issue.over });
}

/** The products chosen in a step, once each, with the variant to draw them in. */
function chosenIn(section: ViewSection, selections: SectionSelections) {
    const picks = (selections[section.id] ?? []).filter((pick) => pick.quantity > 0);
    return section.products.flatMap((product) => {
        const variant = product.variants.find((candidate) => picks.some((pick) => pick.variantId === candidate.id));
        return variant ? [{ product, variant: variant as BundleVariant | undefined }] : [];
    });
}

/** A step's element id, unique per widget so a second section on the page has its own. */
function stepElementId(idPrefix: string, sectionId: number): string {
    return `${idPrefix}-step-${sectionId}`;
}

/*
 * Memoised on the step, which the model keeps between picks. A step is drawn again by a pick,
 * never by a letter typed into a field below it: the form reads what was typed for itself.
 */
const Step = memo(function Step({ section, index, total }: { section: ViewSection; index: number; total: number }) {
    const { content, idPrefix } = useBuilder();
    const { selections, progress } = useSelection();
    const count = progress.sections[section.id]?.quantity ?? 0;
    const optional = section.limits.min === 0;
    const counter =
        optional && section.limits.max === null
            ? text(content, 'stepCount', { count })
            : text(content, 'stepCountRange', { count, range: optional ? `0–${section.limits.max}` : rangeText(section) });
    const done = isStepDone(section, progress);
    const featured = section.products.length === 1;

    return (
        <section className="gft-step" id={stepElementId(idPrefix, section.id)} aria-labelledby={`${stepElementId(idPrefix, section.id)}-title`} data-step-done={done || undefined}>
            <header className="gft-step__header">
                {total > 1 ? <span className="gft-step__index">{String(index + 1).padStart(2, '0')}</span> : null}
                <div className="gft-step__titles">
                    <h3 className="gft-step__title" id={`${stepElementId(idPrefix, section.id)}-title`}>
                        {section.name}
                    </h3>
                    {section.description ? <p className="gft-step__description">{section.description}</p> : null}
                </div>
                <span className={`gft-step__counter${done ? ' gft-step__counter--done' : ''}`}>
                    {optional && count === 0 ? text(content, 'stepOptional') : counter}
                </span>
            </header>
            {featured ? (
                <FeaturedProduct product={section.products[0]!} section={section} />
            ) : (
                <div className="gft-grid">
                    {section.products.map((product) => (
                        <ProductCard key={product.id} product={product} section={section} />
                    ))}
                </div>
            )}
            <Personalise entries={chosenIn(section, selections)} />
        </section>
    );
});

export function Builder({ bundle, settings, config, editor, edit }: BuilderProps) {
    const { content } = config;
    // Created WITH its opening selection (a basket Edit), never filled from an effect after the
    // first paint: an effect paints an empty bundle for one frame, and a shopper who taps in that
    // frame adds to the wrong state.
    const builder = useBundleBuilder(bundle, { initialSelections: edit.selections });
    const { selections, progress, conditions, addItem, removeItem, updateQuantity, swapItem, blockedReason, swapBlockedReason } = builder;
    // The builder keeps `conditions` until something in it changes, so the model is rebuilt only
    // when what is offered changes, and every product and step in it keeps its identity between picks.
    const model = useMemo(() => toViewModel(bundle, settings, conditions), [bundle, settings, conditions]);
    const { sections } = model;
    // The page's language, not the browser's: a market amount reads as the storefront writes it.
    const money = useMoney(bundle, { locale: document.documentElement.lang || undefined });
    const [open, setOpen] = useState<OpenProduct | null>(null);
    const [nudged, setNudged] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const idPrefix = `gft${useId().replace(/[^\w-]/g, '')}`;

    // A basket Edit opens with what the box was added with already in the form, so the shopper
    // changes an engraving rather than typing it again. Like the selection, it is there from the
    // first render.
    const [answers, setAnswers] = useState<Answers>(() => answersFromProperties(bundle, edit.properties));
    const [showMissing, setShowMissing] = useState(false);
    const setAnswer = useCallback((productId: string, fieldId: string, value: string) => {
        setAnswers((current) => ({ ...current, [productId]: { ...current[productId], [fieldId]: value } }));
    }, []);

    // The products in the box, in the order the shopper meets them: each step's picks, then what
    // every box includes. Only these are asked about.
    const requiredEntries = useMemo(() => model.required.map((entry) => ({ product: entry.product, variant: undefined as BundleVariant | undefined })), [model]);
    const boxed = useMemo(
        () => [...sections.flatMap((section) => chosenIn(section, selections)), ...requiredEntries].map((entry) => entry.product),
        [sections, selections, requiredEntries],
    );
    const properties = useMemo(() => lineProperties(bundle, answers), [bundle, answers]);
    // The SDK's check reads the whole bundle, so it is asked again only when its answer can differ.
    const issues = useMemo(() => fieldIssues(bundle, selections, boxed, answers), [bundle, selections, boxed, answers]);

    // The button never adds while an answer is missing, so the personalisation sentence is only
    // ever a backstop; it is still the merchant's.
    const cartWording = useMemo(() => ({ ...cartMessages(content), 'personalisation-required': text(content, 'fieldNeeded') }), [content]);
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
    const canAdd = builder.isSatisfied && issues.length === 0 && !conditions.hideCartButton && !blockingProblem && !draft && !cart.isAdded;
    // A connection that dropped mid-add leaves the lines' fate unknown. The cart hook keeps that add
    // and finishes it on the next press (reading the cart back first, so nothing doubles), with the
    // selection it was started with. So the selection, and what was typed for it, is held until it
    // completes: letting the shopper change either would add the old box while showing them the new one.
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
                document.getElementById(stepElementId(idPrefix, next.id))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    } else if (issues[0] && builder.isSatisfied) {
        status = issueText(content, issues[0]);
    } else if (!builder.isSatisfied) {
        // A rule other than a count (multiples of, a price or weight limit, at least N of each)
        // refuses this selection. The SDK names it in `problems`, in its own words, so the
        // merchant's sentence always comes first and the SDK's detail goes to the theme editor.
        status = editor && builder.problems[0] ? `${text(content, 'notAllowed')} (${builder.problems[0].message})` : text(content, 'notAllowed');
    }

    // The box is complete and only an answer is missing: the buy button takes the shopper to it.
    const firstIssue = builder.isSatisfied && missing.length === 0 ? issues[0] : undefined;
    const onAdd = useCallback(() => {
        if (cart.isAdding) return;
        if (!canAdd && !unconfirmed) {
            setNudged(true);
            window.setTimeout(() => setNudged(false), 1200);
            if (firstIssue) {
                setShowMissing(true);
                const input = document.getElementById(fieldElementId(idPrefix, firstIssue.productId, firstIssue.field.id));
                input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                input?.focus({ preventScroll: true });
            }
            return;
        }
        void cart.addToCart(bundle, selections, { properties });
    }, [canAdd, unconfirmed, cart, bundle, selections, firstIssue, idPrefix, properties]);

    const buy: BuyState = { canAdd: canAdd || unconfirmed, status, statusIsError, onAdd, cart };
    const openDetails = useCallback((productId: string, sectionId: number) => setOpen({ productId, sectionId }), []);
    // Three values, each memoised on what it holds. A render that changes none of what a card
    // reads (the nudge, the details dialog, a letter typed) draws no card again; see ./context.
    const context = useMemo<BuilderContextValue>(
        () => ({ model, money, content, editor, idPrefix, openDetails, addItem, removeItem, updateQuantity, swapItem, blockedReason, swapBlockedReason }),
        [model, money, content, editor, idPrefix, openDetails, addItem, removeItem, updateQuantity, swapItem, blockedReason, swapBlockedReason],
    );
    const selection = useMemo<SelectionContextValue>(() => ({ selections, progress, locked }), [selections, progress, locked]);
    const typed = useMemo<AnswersContextValue>(() => ({ answers, setAnswer, properties, issues, showMissing }), [answers, setAnswer, properties, issues, showMissing]);

    const heading = content.heading || bundle.name;
    const intro = content.intro || bundle.description;

    return (
        <BuilderContext.Provider value={context}>
            <SelectionContext.Provider value={selection}>
                <AnswersContext.Provider value={typed}>
                    <div
                        ref={rootRef}
                        className={`gft-root${nudged ? ' gft-root--nudged' : ''}`}
                        data-testid="cc-root"
                        data-complete={builder.isSatisfied ? 'true' : 'false'}
                        data-qa-count={pickedCount(progress)}
                    >
                        {editor && model.problems.length > 0 ? (
                            <EditorPanel>
                                <ul className="gft-editor-panel__list">
                                    {model.problems.map((problem) => (
                                        <li key={problem.detail}>{problem.detail}</li>
                                    ))}
                                </ul>
                            </EditorPanel>
                        ) : null}
                        {!editor && blockingProblem ? (
                            <div className="gft-error" data-testid="cc-error" role="alert">
                                <p>{text(content, 'unavailable')}</p>
                            </div>
                        ) : null}
                        <header className="gft-header">
                            <h2 className="gft-header__title">{heading}</h2>
                            {intro ? <p className="gft-header__intro">{intro}</p> : null}
                        </header>
                        {/* Only an edit that will really replace the cart line says so. When the saved bundle
                            could not be restored, `replace` is null and the add creates a new bundle. */}
                        {edit.isEditing && edit.replace ? (
                            <div className="gft-notice" role="status">
                                <p>{text(content, 'editNotice')}</p>
                                {edit.missing.length > 0 ? <p>{text(content, 'editMissing')}</p> : null}
                            </div>
                        ) : null}
                        <div className="gft-layout">
                            <div className="gft-steps">
                                {sections.map((section, index) => (
                                    <Step key={section.id} section={section} index={index} total={sections.length} />
                                ))}
                                <Personalise entries={requiredEntries} />
                            </div>
                            <SummaryRail buy={buy} />
                        </div>
                        <MobileBar buy={buy} />
                        <ProductDialog open={open} onClose={() => setOpen(null)} />
                    </div>
                </AnswersContext.Provider>
            </SelectionContext.Provider>
        </BuilderContext.Provider>
    );
}
