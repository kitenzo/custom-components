/*
 * The builder: every step, the summary, and the add to cart.
 *
 * Generic on purpose. It draws any bundle the headless API can describe: one step or several,
 * per-step and bundle-wide counts, required products, product options, sold-out and capped
 * stock, conditions that hide steps or products. Restyle it in styles.css; reshape it here.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { AjaxCartError } from '@kitenzo/core';
import { useBundleAjaxCart, type BundleEditTarget, type SavedBundleItem, type SectionSelections, type ShopSettings } from '@kitenzo/react';

import { cartUrl, routePrefix, type MountConfig } from '../config';
import { text } from '../content';
import type { ViewModel, ViewSection } from '../model';
import { visibleProducts } from '../model';
import { useMoney } from '../money';
import { countOf, missingPicks, useSelection, type Missing } from '../selection';
import { BuilderContext, useBuilder, type BuilderContextValue } from './context';
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
    const idPrefix = `kst-${useId().replace(/:/g, '')}`;

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
    const canAdd = selection.isSatisfied && !selection.conditions.hideCartButton && !blockingProblem && !draft && !cart.isAdded;
    // A connection that dropped mid-add leaves the lines' fate unknown. The cart hook keeps that add
    // and finishes it on the next press (reading the cart back first, so nothing doubles), with the
    // selection it was started with. So the selection is held until it completes: letting the
    // shopper change it would add the old bundle while showing them the new one.
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
            return;
        }
        void cart.addToCart(model.bundle, selection.selections);
    }, [canAdd, unconfirmed, cart, model.bundle, selection.selections]);

    const buy: BuyState = { canAdd: canAdd || unconfirmed, status, statusIsError, onAdd, cart };
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
        }),
        [model, selection, money, content, editor, cart.isAdding, unconfirmed, idPrefix],
    );

    const heading = content.heading || model.bundle.name;
    const intro = content.intro || model.bundle.description;

    return (
        <BuilderContext.Provider value={context}>
            <div
                ref={rootRef}
                className={`kst-root${nudged ? ' kst-root--nudged' : ''}`}
                data-testid="cc-root"
                data-complete={selection.isSatisfied ? 'true' : 'false'}
                data-qa-count={count}
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
        </BuilderContext.Provider>
    );
}
