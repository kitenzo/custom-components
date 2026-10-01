/*
 * The builder: every step, what the shopper writes, the box preview, and the add to cart.
 *
 * Generic on purpose. It draws any bundle the headless API can describe: one step or several,
 * per-step and bundle-wide counts, required products, product options, sold-out and capped
 * stock, conditions that hide steps or products, and any text, dropdown or checkbox
 * personalisation the merchant defined. Restyle it in styles.css; reshape it here.
 *
 * The add is the SDK's (`useBundleAjaxCart`), with one addition: the shopper's answers ride on
 * the `/cart/add.js` lines through the hook's `fetchImpl` (personalisation.ts says why and how).
 * The buy button is gated on the SDK's `isSatisfied` AND on every required answer being there,
 * and says which one is missing.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { AjaxCartError } from '@kitenzo/core';
import { useBundleAjaxCart, type BundleEditTarget, type BundleVariant, type SavedBundleItem, type SectionSelections, type ShopSettings } from '@kitenzo/react';

import { cartUrl, routePrefix, type MountConfig } from '../config';
import { text } from '../content';
import type { ViewModel, ViewSection } from '../model';
import { visibleProducts } from '../model';
import { useMoney } from '../money';
import { fieldIssues, linePlan, type Answers, type FieldIssue, type LinePlan, personalisedFetch } from '../personalisation';
import { countOf, missingPicks, useSelection, type Missing } from '../selection';
import { BuilderContext, fieldElementId, useBuilder, type BuilderContextValue } from './context';
import { EditorPanel } from './Notice';
import { Personalise } from './Personalise';
import { FeaturedProduct, ProductCard } from './ProductCard';
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

function Step({ section, index, total }: { section: ViewSection; index: number; total: number }) {
    const { selection, content, idPrefix } = useBuilder();
    const count = countOf(selection.selections, section.id);
    const products = visibleProducts(section, selection.conditions.hiddenProducts);
    const optional = section.limits.min === 0;
    const counter =
        optional && section.limits.max === Number.POSITIVE_INFINITY
            ? text(content, 'stepCount', { count })
            : text(content, 'stepCountRange', { count, range: optional ? `0–${section.limits.max}` : rangeText(section) });
    const done = count >= section.limits.min && count > 0;
    const featured = products.length === 1;

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
                <FeaturedProduct product={products[0]!} section={section} />
            ) : (
                <div className="gft-grid">
                    {products.map((product) => (
                        <ProductCard key={product.id} product={product} section={section} />
                    ))}
                </div>
            )}
            <Personalise entries={chosenIn(section, selection.selections)} />
        </section>
    );
}

export function Builder({ model, settings, config, editor, edit }: BuilderProps) {
    const { content } = config;
    const selection = useSelection(model, edit.selections);
    const money = useMoney(model.bundle, settings);
    const [open, setOpen] = useState<OpenProduct | null>(null);
    const [nudged, setNudged] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const idPrefix = `gft${useId().replace(/[^\w-]/g, '')}`;

    // Answers start empty, even on a basket Edit: the SDK restores the box, not what was typed for
    // it (see the edit notice below, and README).
    const [answers, setAnswers] = useState<Answers>({});
    const [showMissing, setShowMissing] = useState(false);
    const setAnswer = useCallback((productId: string, fieldId: string, value: string) => {
        setAnswers((current) => ({ ...current, [productId]: { ...current[productId], [fieldId]: value } }));
    }, []);
    const issues = fieldIssues(model.bundle, selection.selections, answers);

    // The plan is fixed at the moment of the add and read when the request goes out. One fetch for
    // the hook's lifetime: a new function every render would rebuild the hook's cart operations.
    const plan = useRef<LinePlan>(new Map());
    const fetchImpl = useMemo(() => personalisedFetch(() => plan.current), []);

    const cart = useBundleAjaxCart({
        routePrefix: routePrefix(config.rootUrl),
        replace: edit.replace,
        fetchImpl,
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
    const canAdd = selection.isSatisfied && issues.length === 0 && !selection.conditions.hideCartButton && !blockingProblem && !draft && !cart.isAdded;
    // A connection that dropped mid-add leaves the lines' fate unknown. The cart hook keeps that add
    // and finishes it on the next press (reading the cart back first, so nothing doubles), with the
    // selection it was started with. So the selection, and what was typed for it, is held until it
    // completes: letting the shopper change either would add the old box while showing them the new one.
    const unconfirmed = cart.failureReason === 'cart-error' && cart.error !== null && !(cart.error instanceof AjaxCartError);
    const count = countOf(selection.selections);

    // "Advance when this step is done" is the merchant's setting, per step: mirror it, never assume it.
    // The counts start from the first render, so a bundle that opens already filled (a basket Edit)
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
                document.getElementById(stepElementId(idPrefix, next.id))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    } else if (issues[0] && selection.isSatisfied) {
        status = issueText(content, issues[0]);
    } else if (!selection.isSatisfied) {
        // A rule other than a count (one per product, multiples of, a price or weight limit, one of
        // several allowed sizes) refuses this selection. The SDK names it only once every step has a
        // pick, and in its own words, so the merchant's sentence always comes first and the SDK's
        // detail goes to the theme editor.
        status = editor && selection.errors[0] ? `${text(content, 'notAllowed')} (${selection.errors[0].message})` : text(content, 'notAllowed');
    }

    const onAdd = useCallback(() => {
        if (cart.isAdding) return;
        if (!canAdd && !unconfirmed) {
            setNudged(true);
            window.setTimeout(() => setNudged(false), 1200);
            // The box is complete and only an answer is missing: take the shopper to it.
            const first = selection.isSatisfied && missing.length === 0 ? issues[0] : undefined;
            if (first) {
                setShowMissing(true);
                const input = document.getElementById(fieldElementId(idPrefix, first.productId, first.field.id));
                input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                input?.focus({ preventScroll: true });
            }
            return;
        }
        // A retry finishes the add already started, so it keeps that add's answers too.
        if (!unconfirmed) plan.current = linePlan(model.bundle, selection.selections, answers);
        void cart.addToCart(model.bundle, selection.selections);
    }, [canAdd, unconfirmed, cart, model.bundle, selection.selections, selection.isSatisfied, missing.length, issues, idPrefix, answers]);

    const buy: BuyState = { canAdd: canAdd || unconfirmed, status, statusIsError, onAdd, cart };
    const context = useMemo<BuilderContextValue>(
        () => ({
            model,
            selection,
            money,
            content,
            editor,
            locked: cart.isAdding || unconfirmed,
            openDetails: (productId, sectionId) => setOpen({ productId, sectionId }),
            answers,
            setAnswer,
            issues,
            showMissing,
            idPrefix,
        }),
        // `issues` is derived from the three above it, so it is new exactly when they are.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [model, selection, money, content, editor, cart.isAdding, unconfirmed, answers, setAnswer, showMissing, idPrefix],
    );

    // A basket Edit restores the box but not what was typed for it. Say so where it applies.
    const editNeedsRetyping =
        edit.isEditing &&
        edit.replace !== null &&
        (model.required.some((entry) => entry.product.fields.length > 0) ||
            model.sections.some((section) => chosenIn(section, edit.selections ?? {}).some((entry) => entry.product.fields.length > 0)));
    const requiredEntries = model.required.map((entry) => ({ product: entry.product, variant: undefined as BundleVariant | undefined }));

    const heading = content.heading || model.bundle.name;
    const intro = content.intro || model.bundle.description;

    return (
        <BuilderContext.Provider value={context}>
            <div
                ref={rootRef}
                className={`gft-root${nudged ? ' gft-root--nudged' : ''}`}
                data-testid="cc-root"
                data-complete={selection.isSatisfied ? 'true' : 'false'}
                data-qa-count={count}
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
                        {editNeedsRetyping ? <p className="gft-notice__strong">{text(content, 'editPersonalisation')}</p> : null}
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
        </BuilderContext.Provider>
    );
}
