/*
 * The set builder: one column per step (Top, Bra, Leggings), "Match colours" across them, "Your
 * set" beside them, and the add to cart.
 *
 * Each step is a piece the shopper dresses: a colour, a size, then "Add to set". The set price
 * shows from the first paint, because a set price is known before anything is picked. Restyle it
 * in styles.css; reshape it here.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { AjaxCartError } from '@kitenzo/core';
import { useBundleAjaxCart, type BundleEditTarget, type SavedBundleItem, type SectionSelections, type ShopSettings } from '@kitenzo/react';

import { cartUrl, routePrefix, type MountConfig } from '../config';
import { text } from '../content';
import type { ViewModel, ViewSection } from '../model';
import { visibleProducts } from '../model';
import { useMoney } from '../money';
import { matchableValues, parseSwatchColours, planColourMatch, swatchFor, swatchOptionOf, type Piece as MatchPiece } from '../options';
import { countOf, missingPicks, useSelection, type Missing } from '../selection';
import { BuilderContext, useBuilder, type BuilderContextValue } from './context';
import { blockedText, unreachableText } from './copy';
import { CheckIcon } from './Icons';
import { EditorPanel } from './Notice';
import { PieceCard } from './PieceCard';
import { ProductDialog, type OpenProduct } from './ProductDialog';
import { MobileBar, SummaryRail, type BuyState } from './Summary';
import { pieceKey, usePieces } from './usePieces';

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

/** Every step still short, named together: "Still to choose: Bra, Leggings". */
function missingText(content: MountConfig['content'], missing: Missing[]): string {
    const steps = missing.filter((entry) => entry.section).map((entry) => entry.section!.name);
    if (steps.length > 0) return text(content, 'chooseMoreStep', { count: missing[0]!.count, step: steps.join(', ') });
    return text(content, 'chooseMore', { count: missing[0]!.count });
}

function Step({ section, index }: { section: ViewSection; index: number }) {
    const { selection, content, idPrefix } = useBuilder();
    const count = countOf(selection.selections, section.id);
    const products = visibleProducts(section, selection.conditions.hiddenProducts);
    const done = count > 0 && count >= section.limits.min;

    return (
        <section className="aws-step" id={`${idPrefix}-step-${section.id}`} aria-labelledby={`${idPrefix}-step-title-${section.id}`} data-step-done={done || undefined}>
            <header className="aws-step__header">
                <span className="aws-step__index" aria-hidden="true">
                    {done ? <CheckIcon /> : String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="aws-step__title" id={`${idPrefix}-step-title-${section.id}`}>
                    {section.name}
                </h3>
                {section.limits.min === 0 ? <span className="aws-step__optional">{text(content, 'stepOptional')}</span> : null}
            </header>
            {section.description ? <p className="aws-step__description">{section.description}</p> : null}
            <div className="aws-step__pieces">
                {products.map((product) => (
                    <PieceCard key={product.id} product={product} section={section} index={index} />
                ))}
            </div>
        </section>
    );
}

interface MatchResult {
    value: string;
    blocked: { step: string; reason: string }[];
}

/**
 * "Match colours": one press puts every piece in one colour where that colour can be had, and
 * names the pieces where it cannot. Each piece goes through the same `selectOptionValue` as its
 * own swatches (options.ts, planColourMatch), so a chosen size is never moved to reach a colour.
 */
function MatchColours({ sections }: { sections: ViewSection[] }) {
    const { selection, content, pieces, locked, idPrefix } = useBuilder();
    const [result, setResult] = useState<MatchResult | null>(null);
    const timer = useRef<number>();
    useEffect(() => () => window.clearTimeout(timer.current), []);

    const entries = sections.flatMap((section) =>
        visibleProducts(section, selection.conditions.hiddenProducts)
            .filter((product) => !product.soldOut && swatchOptionOf(product.product, pieces.swatchNames))
            .map((product) => ({ section, product, piece: { key: pieceKey(section, product), product: product.product, values: pieces.valuesOf(section, product) } satisfies MatchPiece })),
    );
    // Matching one piece to itself is not a feature.
    if (entries.length < 2) return null;

    const colours = parseSwatchColours(content.swatchColours);
    const values = matchableValues(
        entries.map((entry) => entry.piece),
        pieces.swatchNames,
    );
    const current = (value: string) => entries.every((entry) => entry.piece.values[swatchOptionOf(entry.product.product, pieces.swatchNames)!.name] === value);

    const match = (value: string) => {
        if (locked) return;
        const plan = planColourMatch(
            entries.map((entry) => entry.piece),
            pieces.swatchNames,
            value,
        );
        const blocked = plan.blocked.map(({ key, why }) => ({ step: entries.find((entry) => entry.piece.key === key)!.section.name, reason: unreachableText(content, value, why) }));
        for (const { key, values: next } of plan.apply) {
            const entry = entries.find((candidate) => candidate.piece.key === key)!;
            const outcome = pieces.apply(entry.section, entry.product, next);
            if (outcome.kind === 'blocked') blocked.push({ step: entry.section.name, reason: blockedText(content, outcome.reason, entry.section) });
        }
        setResult({ value, blocked });
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setResult(null), 12000);
    };

    return (
        <div className="aws-match" role="group" aria-labelledby={`${idPrefix}-match-label`}>
            <p className="aws-match__label" id={`${idPrefix}-match-label`}>
                {text(content, 'matchHeading')}
            </p>
            <div className="aws-match__swatches">
                {values.map((value) => {
                    const owner = entries.find((entry) => swatchOptionOf(entry.product.product, pieces.swatchNames)!.values.includes(value))!;
                    const swatch = swatchFor(owner.product.product, swatchOptionOf(owner.product.product, pieces.swatchNames)!, value, colours);
                    return (
                        <button
                            key={value}
                            type="button"
                            className="aws-match__button"
                            data-match={value}
                            aria-pressed={current(value)}
                            aria-disabled={locked || undefined}
                            onClick={() => match(value)}
                        >
                            <span
                                className={`aws-swatch__chip${swatch.color || swatch.image ? '' : ' aws-swatch__chip--blank'}`}
                                aria-hidden="true"
                                style={{ ['--aws-swatch' as string]: swatch.color ?? undefined, backgroundImage: swatch.image ? `url("${swatch.image.replace(/"/g, '%22')}")` : undefined }}
                            />
                            <span className="aws-match__name">{value}</span>
                        </button>
                    );
                })}
            </div>
            <div className="aws-match__result" role="status" data-testid="aws-match-result">
                {result ? (
                    result.blocked.length === 0 ? (
                        <p>{text(content, 'matchDone', { value: result.value })}</p>
                    ) : (
                        <>
                            <p>{text(content, 'matchBlocked', { value: result.value })}</p>
                            <ul className="aws-match__blocked">
                                {result.blocked.map((entry) => (
                                    <li key={entry.step}>
                                        <strong>{entry.step}</strong> {entry.reason}
                                    </li>
                                ))}
                            </ul>
                        </>
                    )
                ) : null}
            </div>
        </div>
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
    const idPrefix = `aws${useId().replace(/:/g, '')}`;

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
    // shopper change it would add the old set while showing them the new one.
    const unconfirmed = cart.failureReason === 'cart-error' && cart.error !== null && !(cart.error instanceof AjaxCartError);
    const locked = cart.isAdding || unconfirmed;
    const pieces = usePieces(model, selection, content.swatchOptions, locked);

    const hiddenSections = selection.conditions.hiddenSectionIds;
    const sections = model.sections.filter((section) => !hiddenSections.includes(section.id) && section.products.length > 0);
    const missing = missingPicks(model, selection.selections, hiddenSections);
    const blockingProblem = model.problems.some((problem) => problem.blocking);
    // A draft previews in the theme editor, and the API refuses to configure it.
    const draft = !model.bundle.published;
    const canAdd = selection.isSatisfied && !selection.conditions.hideCartButton && !blockingProblem && !draft && !cart.isAdded;
    const count = countOf(selection.selections);

    // "Advance when this step is done" is the merchant's setting, per step: mirror it, never assume it.
    // The counts start from the first render, so a set that opens already filled (a basket Edit)
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
        status = missingText(content, missing);
    } else if (!selection.isSatisfied) {
        // A rule other than a count refuses this selection. The SDK names it only once every step
        // has a pick, and in its own words, so the merchant's sentence always comes first and the
        // SDK's detail goes to the theme editor.
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
            pieces,
            editor,
            locked,
            idPrefix,
            openDetails: (productId, sectionId) => setOpen({ productId, sectionId }),
        }),
        [model, selection, money, content, pieces, editor, locked, idPrefix],
    );

    const heading = content.heading || model.bundle.name;
    const intro = content.intro || model.bundle.description;

    return (
        <BuilderContext.Provider value={context}>
            <div
                ref={rootRef}
                className={`aws-root${nudged ? ' aws-root--nudged' : ''}`}
                data-testid="cc-root"
                data-complete={selection.isSatisfied ? 'true' : 'false'}
                data-qa-count={count}
            >
                {editor && model.problems.length > 0 ? (
                    <EditorPanel>
                        <ul className="aws-editor-panel__list">
                            {model.problems.map((problem) => (
                                <li key={problem.detail}>{problem.detail}</li>
                            ))}
                        </ul>
                    </EditorPanel>
                ) : null}
                {!editor && blockingProblem ? (
                    <div className="aws-error" data-testid="cc-error" role="alert">
                        <p>{text(content, 'unavailable')}</p>
                    </div>
                ) : null}
                <header className="aws-header">
                    <div className="aws-header__titles">
                        <h2 className="aws-header__title">{heading}</h2>
                        {intro ? <p className="aws-header__intro">{intro}</p> : null}
                    </div>
                    {money.setPrice !== null && !content.hidePrices ? (
                        <p className="aws-header__price">
                            <span className="aws-header__price-label">{text(content, 'setPrice')}</span>
                            <span className="aws-header__price-amount">{money.format(money.setPrice)}</span>
                        </p>
                    ) : null}
                </header>
                {/* Only an edit that will really replace the cart line says so. When the saved set
                    could not be restored, `replace` is null and the add creates a new bundle. */}
                {edit.isEditing && edit.replace ? (
                    <div className="aws-notice" role="status">
                        <p>{text(content, 'editNotice')}</p>
                        {edit.missing.length > 0 ? <p>{text(content, 'editMissing')}</p> : null}
                    </div>
                ) : null}
                <MatchColours sections={sections} />
                <div className="aws-layout">
                    <div className="aws-steps" style={{ ['--aws-columns' as string]: Math.min(Math.max(sections.length, 1), 3) }}>
                        {sections.map((section, index) => (
                            <Step key={section.id} section={section} index={index} />
                        ))}
                    </div>
                    <SummaryRail buy={buy} sections={sections} />
                </div>
                <MobileBar buy={buy} sections={sections} />
                <ProductDialog open={open} onClose={() => setOpen(null)} />
            </div>
        </BuilderContext.Provider>
    );
}
