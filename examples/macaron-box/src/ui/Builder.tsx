/*
 * The builder: choose a box, fill it flavour by flavour, buy it.
 *
 * The box is the interface. Its sizes come from the bundle's `eq` rules (box.ts), its slots fill
 * in the order the shopper picks, and the add to cart waits for the box the shopper chose to be
 * full as well as for the SDK to accept the selection. A bundle with no sizes to choose still
 * renders: no size chooser, and a tray as big as the step allows.
 *
 * Any other steps the bundle has render as plain flavour grids after the box, so a merchant who
 * adds, say, a gift card step does not lose it.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { AjaxCartError } from '@kitenzo/core';
import { useBundleAjaxCart, type BundleEditTarget, type SavedBundleItem, type SectionSelections, type ShopSettings } from '@kitenzo/react';

import { planFill, seededRandom } from '../autofill';
import { boxOffers, boxSection, boxSizes, overflowOf, sizeFor } from '../box';
import { cartUrl, routePrefix, type MountConfig } from '../config';
import { text } from '../content';
import type { ViewModel, ViewSection } from '../model';
import { visibleProducts } from '../model';
import { useMoney } from '../money';
import { countOf, fillCandidates, missingPicks, useSelection, type Missing } from '../selection';
import { BuilderContext, useBuilder, type BoxState, type BuilderContextValue } from './context';
import { EditorPanel } from './Notice';
import { ProductCard } from './ProductCard';
import { ProductDialog, type OpenProduct } from './ProductDialog';
import { SizeChooser } from './SizeChooser';
import { MobileBar, SummaryRail, type BuyState } from './Summary';
import { SwitchDialog } from './SwitchDialog';

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

function FlavourStep({ section, index }: { section: ViewSection; index: number }) {
    const { selection, content, box, idPrefix } = useBuilder();
    const count = countOf(selection.selections, section.id);
    const products = visibleProducts(section, selection.conditions.hiddenProducts);
    const isBox = box?.section.id === section.id;
    const optional = section.limits.min === 0;
    const counter = isBox
        ? null
        : optional && section.limits.max === Number.POSITIVE_INFINITY
          ? text(content, 'stepCount', { count })
          : text(content, 'stepCountRange', { count, range: optional ? `0–${section.limits.max}` : rangeText(section) });

    return (
        <section className="mcb-step" id={`${idPrefix}-step-${section.id}`} aria-labelledby={`${idPrefix}-step-title-${section.id}`}>
            <StepHeading
                index={index}
                id={`${idPrefix}-step-title-${section.id}`}
                title={section.name}
                description={section.description}
                aside={counter ? <span className="mcb-step__counter">{optional && count === 0 ? text(content, 'stepOptional') : counter}</span> : null}
            />
            <div className="mcb-grid">
                {products.map((product) => (
                    <ProductCard key={product.id} product={product} section={section} />
                ))}
            </div>
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
    // Ids unique per widget: the same bundle can be mounted twice on one page.
    const idPrefix = `mcb${useId().replace(/:/g, '')}`;
    const trayId = `${idPrefix}-tray`;

    // ----- The box ---------------------------------------------------------------------------
    const section = useMemo(() => boxSection(model), [model]);
    const sizes = useMemo(() => (section ? boxSizes(model.bundle, section.id) : []), [model.bundle, section]);
    const offers = useMemo(() => (section ? boxOffers(model.bundle, section, sizes) : []), [model.bundle, section, sizes]);
    const inBox = section ? countOf(selection.selections, section.id) : 0;
    // A restored bundle (basket Edit) opens in the box it was bought in.
    const [size, setSize] = useState<number | null>(() => (inBox > 0 ? sizeFor(sizes, inBox) : null));
    const [pendingSize, setPendingSize] = useState<number | null>(null);
    const [fillNote, setFillNote] = useState<string | null>(null);
    const finiteMax = section && section.limits.max !== Number.POSITIVE_INFINITY ? section.limits.max : null;
    const slots = sizes.length > 0 ? size : finiteMax;

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
        // Most recent first, highest slot first, so each removal leaves the others' places alone.
        for (const { index } of overflowOf(selection.order.get(), section.id, pendingSize)) selection.order.removeAt(index);
        setSize(pendingSize);
        setPendingSize(null);
    }, [pendingSize, section, selection.order]);

    const fillRest = useCallback(() => {
        if (!section || slots === null) return;
        const hidden = selection.conditions.hiddenProducts.filter((entry) => entry.sectionId === null || entry.sectionId === section.id).map((entry) => entry.productId);
        const empty = slots - countOf(selection.selections, section.id);
        const plan = planFill(fillCandidates(section, selection.selections, hidden), empty, seededRandom(Math.floor(Math.random() * 2 ** 32)));
        // Through the builder, one macaron at a time, exactly as if the shopper had tapped each.
        for (const variantId of plan.picks) selection.builder.addItem(section.id, variantId, 1);
        setFillNote(plan.unfilled > 0 ? text(content, 'fillShort', { count: plan.picks.length }) : null);
    }, [content, section, selection, slots]);

    const setPriced = sizes.length > 0 && (offers.length > 0 ? offers.every((offer) => offer.exact) : model.bundle.discount?.type === 'price');
    const box: BoxState | null = section ? { section, sizes, offers, setPriced, size, slots, choose, fillRest, fillNote } : null;

    // ----- The cart --------------------------------------------------------------------------
    const cart = useBundleAjaxCart({
        routePrefix: routePrefix(config.rootUrl),
        replace: edit.replace,
        onAdded: (result) => {
            // Themes with a cart drawer listen for this and refresh; the rest follow the redirect.
            rootRef.current?.dispatchEvent(new CustomEvent('kitenzo:bundle-added', { bubbles: true, detail: { bundleId: model.bundle.id, result } }));
            if (content.afterAdd === 'cart') window.location.assign(cartUrl(config.rootUrl));
        },
    });

    // A connection that dropped mid-add leaves the lines' fate unknown. The cart hook keeps that add
    // and finishes it on the next press (reading the cart back first, so nothing doubles), with the
    // selection it was started with. So the selection is held until it completes: letting the
    // shopper change it would add the old box while showing them the new one.
    const unconfirmed = cart.failureReason === 'cart-error' && cart.error !== null && !(cart.error instanceof AjaxCartError);

    const hiddenSections = selection.conditions.hiddenSectionIds;
    const sections = model.sections.filter((candidate) => !hiddenSections.includes(candidate.id) && candidate.products.length > 0);
    const missing = missingPicks(model, selection.selections, hiddenSections);
    const blockingProblem = model.problems.some((problem) => problem.blocking);
    // A draft previews in the theme editor, and the API refuses to configure it.
    const draft = !model.bundle.published;
    // The SDK says whether the selection is a box it will sell; the box the shopper chose has to
    // be full too, or six macarons in a box of twelve would quietly be sold as a box of six.
    const boxFilled = sizes.length === 0 || (size !== null && inBox === size);
    const complete = selection.isSatisfied && boxFilled;
    const canAdd = complete && !selection.conditions.hideCartButton && !blockingProblem && !draft && !cart.isAdded;
    const count = countOf(selection.selections);

    // "Advance when this step is done" is the merchant's setting, per step: mirror it, never
    // assume it. The box step is done when the chosen box is full, not when the SDK's window is.
    // The counts start from the first render, so a box that opens already filled (a basket Edit)
    // does not scroll the page on load.
    const previousCounts = useRef<Map<number, number> | null>(null);
    useEffect(() => {
        if (!previousCounts.current) {
            previousCounts.current = new Map(sections.map((candidate) => [candidate.id, countOf(selection.selections, candidate.id)]));
            return;
        }
        const counts = previousCounts.current;
        const isFull = (candidate: ViewSection, quantity: number) => {
            if (candidate.id === section?.id && slots !== null) return quantity >= slots;
            if (candidate.limits.max !== Number.POSITIVE_INFINITY) return quantity >= candidate.limits.max;
            return candidate.limits.min > 0 && quantity >= candidate.limits.min;
        };
        sections.forEach((candidate, index) => {
            const before = counts.get(candidate.id) ?? 0;
            const now = countOf(selection.selections, candidate.id);
            counts.set(candidate.id, now);
            const next = sections[index + 1];
            if (candidate.autoNext && isFull(candidate, now) && !isFull(candidate, before) && now > before && next) {
                document.getElementById(`${idPrefix}-step-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }, [selection.selections, sections, section, slots, idPrefix]);

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
    } else if (!selection.isSatisfied) {
        // A rule other than a count (one per product, a price or weight limit) refuses this
        // selection. The SDK names it only once every step has a pick, and in its own words, so the
        // merchant's sentence always comes first and the SDK's detail goes to the theme editor.
        status = editor && selection.errors[0] ? `${text(content, 'notAllowed')} (${selection.errors[0].message})` : text(content, 'notAllowed');
    }

    const onAdd = useCallback(() => {
        if (cart.isAdding) return;
        if (!canAdd && !unconfirmed) {
            setNudged(true);
            window.setTimeout(() => setNudged(false), 1200);
            return;
        }
        void cart.addToCart(model.bundle, selection.selections);
    }, [canAdd, unconfirmed, cart, model.bundle, selection.selections]);

    // While an add is unconfirmed the button stays pressable: pressing it finishes that add.
    const buy: BuyState = { canAdd: canAdd || unconfirmed, complete, status, statusIsError, onAdd, cart };
    const context = useMemo<BuilderContextValue>(
        () => ({
            model,
            selection,
            money,
            content,
            editor,
            locked: cart.isAdding || unconfirmed,
            idPrefix,
            box,
            openDetails: (productId, sectionId) => setOpen({ productId, sectionId }),
        }),
        // `box` is rebuilt every render from the values below; listing them keeps the memo honest.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [model, selection, money, content, editor, cart.isAdding, unconfirmed, idPrefix, section, sizes, offers, setPriced, size, slots, choose, fillRest, fillNote],
    );

    const heading = content.heading || model.bundle.name;
    const intro = content.intro || model.bundle.description;
    const hasSizes = sizes.length > 0;

    return (
        <BuilderContext.Provider value={context}>
            <div
                ref={rootRef}
                className={`mcb-root${nudged ? ' mcb-root--nudged' : ''}`}
                data-testid="cc-root"
                data-complete={complete ? 'true' : 'false'}
                data-qa-count={count}
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
        </BuilderContext.Provider>
    );
}
