/*
 * The set builder: one column per step (Top, Bra, Leggings), "Match colours" across them, "Your
 * set" beside them, and the add to cart.
 *
 * Each step is a piece the shopper dresses: a colour, a size, then "Add to set". The set price
 * shows from the first paint, because a set price is known before anything is picked. Restyle it
 * in styles.css; reshape it here.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { resolveUpfrontPrice, useBundleAjaxCart, useBundleBuilder, useMoney, type BundleDetail, type ShopSettings, type UseBundleEditResult } from '@kitenzo/react';

import { cartUrl, routePrefix, type MountConfig } from '../config';
import { cartMessages, text } from '../content';
import { toViewModel, type ViewSection } from '../model';
import { matchableValues, parseNameList, parseSwatchColours, planColourMatch, swatchFor, swatchOptionOf, type Piece as MatchPiece } from '../options';
import { isStepDone, isStepFinished, missingPicks, pickedCount, type Missing } from '../selection';
import { BuilderContext, SelectionContext, useBuilder, useSelection, type BuilderContextValue, type SelectionContextValue } from './context';
import { blockedText, unreachableText } from './copy';
import { CheckIcon } from './Icons';
import { EditorPanel } from './Notice';
import { PieceCard } from './PieceCard';
import { ProductDialog, type OpenProduct } from './ProductDialog';
import { MobileBar, SummaryRail, type BuyState } from './Summary';
import { pieceKey, usePieces } from './usePieces';

interface BuilderProps {
    bundle: BundleDetail;
    /** Loaded before the builder renders: they decide what is offered. */
    settings: ShopSettings;
    config: MountConfig;
    editor: boolean;
    edit: Pick<UseBundleEditResult, 'isEditing' | 'selections' | 'missing' | 'replace'>;
}

/** Every step still short, named together: "Still to choose: Bra, Leggings". */
function missingText(content: MountConfig['content'], missing: Missing[]): string {
    const steps = missing.filter((entry) => entry.section).map((entry) => entry.section!.name);
    if (steps.length > 0) return text(content, 'chooseMoreStep', { count: missing[0]!.count, step: steps.join(', ') });
    return text(content, 'chooseMore', { count: missing[0]!.count });
}

function Step({ section, index }: { section: ViewSection; index: number }) {
    const { content, idPrefix } = useBuilder();
    const { progress } = useSelection();
    const done = isStepDone(section, progress);

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
                {section.products.map((product) => (
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
function MatchColours() {
    const { model, content, swatchNames, swatchColours, idPrefix } = useBuilder();
    const { pieces, locked } = useSelection();
    const [result, setResult] = useState<MatchResult | null>(null);
    const timer = useRef<number>();
    useEffect(() => () => window.clearTimeout(timer.current), []);

    const entries = model.sections.flatMap((section) =>
        section.products
            .filter((product) => !product.soldOut && swatchOptionOf(product.product, swatchNames))
            .map((product) => ({ section, product, piece: { key: pieceKey(section, product), product: product.product, values: pieces.valuesOf(section, product) } satisfies MatchPiece })),
    );
    // Matching one piece to itself is not a feature.
    if (entries.length < 2) return null;

    const values = matchableValues(
        entries.map((entry) => entry.piece),
        swatchNames,
    );
    const current = (value: string) => entries.every((entry) => entry.piece.values[swatchOptionOf(entry.product.product, swatchNames)!.name] === value);

    const match = (value: string) => {
        if (locked) return;
        const plan = planColourMatch(
            entries.map((entry) => entry.piece),
            swatchNames,
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
                    const owner = entries.find((entry) => swatchOptionOf(entry.product.product, swatchNames)!.values.includes(value))!;
                    const swatch = swatchFor(owner.product.product, swatchOptionOf(owner.product.product, swatchNames)!, value, swatchColours);
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

export function Builder({ bundle, settings, config, editor, edit }: BuilderProps) {
    const { content } = config;
    // Created WITH its opening selection (a basket Edit), never filled from an effect after the
    // first paint: an effect paints an empty set for one frame, and a shopper who taps in that
    // frame adds to the wrong state.
    const builder = useBundleBuilder(bundle, { initialSelections: edit.selections });
    const { selections, progress, conditions, addItem, removeItem, blockedReason, swapItem, swapBlockedReason } = builder;
    // The builder keeps `conditions` until something in it changes, so the model is rebuilt only
    // when what is offered changes, and every piece and step in it keeps its identity between picks.
    const model = useMemo(() => toViewModel(bundle, settings, conditions), [bundle, settings, conditions]);
    const { sections } = model;
    // The page's language, not the browser's: a market amount reads as the storefront writes it.
    const money = useMoney(bundle, { locale: document.documentElement.lang || undefined });
    // The SDK's own quote for a bundle nobody has picked from yet: a flat set price, in the
    // shopper's currency. Null for a bundle whose price depends on what is picked.
    const setPrice = useMemo(() => {
        const upfront = resolveUpfrontPrice(bundle);
        return upfront ? Number(upfront.amount) : null;
    }, [bundle]);
    // The merchant's swatch settings are text. Read once here, not by every swatch row on every render.
    const swatchNames = useMemo(() => parseNameList(content.swatchOptions), [content.swatchOptions]);
    const swatchColours = useMemo(() => parseSwatchColours(content.swatchColours), [content.swatchColours]);
    const [open, setOpen] = useState<OpenProduct | null>(null);
    const [nudged, setNudged] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    // Ids unique per widget: the same bundle can be mounted twice on one page.
    const idPrefix = `aws${useId().replace(/:/g, '')}`;

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
    // shopper change it would add the old set while showing them the new one.
    const unconfirmed = cart.isResumable;
    const locked = cart.isAdding || unconfirmed;
    const pieces = usePieces(model, selections, { swapItem, swapBlockedReason }, swatchNames, locked);

    const missing = missingPicks(sections, progress);
    const blockingProblem = model.problems.some((problem) => problem.blocking);
    // A draft previews in the theme editor, and the API refuses to configure it.
    const draft = !bundle.published;
    const canAdd = builder.isSatisfied && !conditions.hideCartButton && !blockingProblem && !draft && !cart.isAdded;

    // "Advance when this step is done" is the merchant's setting, per step: mirror it, never assume it.
    // Only a pick that finishes a step advances, so a set that opens already filled (a basket
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
        status = missingText(content, missing);
    } else if (!builder.isSatisfied) {
        // A rule other than a count (a price or weight limit, say) refuses this selection. The
        // SDK names it in `problems`, in its own words, so the merchant's sentence always comes
        // first and the SDK's detail goes to the theme editor.
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
    // details dialog) draws no piece again; see ./context.
    const context = useMemo<BuilderContextValue>(
        () => ({ model, money, setPrice, content, swatchNames, swatchColours, editor, idPrefix, openDetails, addItem, removeItem, blockedReason }),
        [model, money, setPrice, content, swatchNames, swatchColours, editor, idPrefix, openDetails, addItem, removeItem, blockedReason],
    );
    const selection = useMemo<SelectionContextValue>(() => ({ selections, progress, locked, pieces }), [selections, progress, locked, pieces]);

    const heading = content.heading || bundle.name;
    const intro = content.intro || bundle.description;

    return (
        <BuilderContext.Provider value={context}>
            <SelectionContext.Provider value={selection}>
                <div
                    ref={rootRef}
                    className={`aws-root${nudged ? ' aws-root--nudged' : ''}`}
                    data-testid="cc-root"
                    data-complete={builder.isSatisfied ? 'true' : 'false'}
                    data-qa-count={pickedCount(progress)}
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
                        {setPrice !== null && !content.hidePrices ? (
                            <p className="aws-header__price">
                                <span className="aws-header__price-label">{text(content, 'setPrice')}</span>
                                <span className="aws-header__price-amount">{money.format(setPrice)}</span>
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
                    <MatchColours />
                    <div className="aws-layout">
                        <div className="aws-steps" style={{ ['--aws-columns' as string]: Math.min(Math.max(sections.length, 1), 3) }}>
                            {sections.map((section, index) => (
                                <Step key={section.id} section={section} index={index} />
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
