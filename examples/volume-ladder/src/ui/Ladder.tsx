/*
 * The ladder: one row per discount tier, the tier the shopper is on highlighted, and a progress
 * line saying what the next one takes.
 *
 * The rows are the bundle's tiers (ladder.ts), and every amount on them is the SDK's price for
 * that many of the cheapest product (money.ts `priceOf`), in the shopper's currency. A rung is
 * information, not a control: it is a list item, never a button that looks like a radio, because
 * tapping "4 pouches" cannot choose four flavours for the shopper.
 */
import { useMemo } from 'react';

import { text, type Content } from '../content';
import { ladderProgress, referencePick, rungSelection, type Candidate, type Progress, type Rung } from '../ladder';
import type { ViewModel } from '../model';
import { priceOf, type Money } from '../money';
import { visibleProducts } from '../model';
import type { Selection } from '../selection';
import { countOf } from '../selection';
import { useBuilder } from './context';
import { CheckIcon } from './Icons';

export interface PricedRung {
    rung: Rung;
    /** "15%" or a money amount: what this rung saves, in words the shopper reads. Null if unknown. */
    discount: string | null;
    /** The price of one product at this rung, display currency. Null when it is not one number. */
    each: number | null;
}

export interface LadderView {
    rungs: PricedRung[];
    progress: Progress;
    /** The progress line, or '' when the bundle has no ladder. */
    message: string;
}

function percentText(percent: number): string {
    const locale = typeof document !== 'undefined' ? document.documentElement.lang || undefined : undefined;
    return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(percent / 100);
}

function progressMessage(content: Content, progress: Progress, count: number, discountOf: (rung: Rung) => string | null): string {
    const { next, current, needed } = progress;
    if (next) {
        const discount = discountOf(next);
        if (!discount) return '';
        return count === 0 ? text(content, 'progressStart', { count: next.count, discount }) : text(content, 'progressNext', { count: needed, discount });
    }
    const discount = current ? discountOf(current) : null;
    return discount ? text(content, 'progressTop', { discount }) : '';
}

/** Everything the ladder draws, recomputed when the selection, the market or the stock changes. */
export function useLadderView(model: ViewModel, selection: Selection, money: Money, content: Content): LadderView {
    const count = countOf(selection.selections);
    const hidden = selection.conditions.hiddenProducts;
    const priced = useMemo(() => {
        const candidates: Candidate[] = model.sections.flatMap((section) =>
            visibleProducts(section, hidden)
                .filter((product) => !product.soldOut)
                .flatMap((product) => product.variants.filter((variant) => variant.available))
                .map((variant) => ({ sectionId: section.id, variantId: variant.id, unitPrice: money.unitPrice(variant) })),
        );
        const { pick, variesInPrice } = referencePick(candidates);
        return model.ladder.rungs.map<PricedRung>((rung) => {
            const price = pick ? priceOf(model.bundle, rungSelection(pick, rung.count)) : null;
            const saving = price ? price.original - price.discounted : 0;
            const discount = rung.percent !== null ? percentText(rung.percent) : saving > 0 ? money.format(saving) : null;
            // "£7.99 each" only when it is true of every product; with mixed prices it would be a guess.
            const each = price && !variesInPrice ? price.discounted / rung.count : null;
            return { rung, discount, each };
        });
    }, [model, hidden, money]);

    const progress = ladderProgress(model.ladder.rungs, count);
    const discountOf = (rung: Rung) => priced.find((entry) => entry.rung === rung)?.discount ?? null;
    return { rungs: priced, progress, message: progressMessage(content, progress, count, discountOf) };
}

export function Ladder({ view }: { view: LadderView }) {
    const { content, money, layout, idPrefix } = useBuilder();
    if (view.rungs.length === 0) return null;
    const top = view.rungs[view.rungs.length - 1]!.rung;
    const { current } = view.progress;

    return (
        <section className={`vol-ladder vol-ladder--${layout}`} aria-labelledby={`${idPrefix}-ladder-heading`}>
            <h3 className="vol-ladder__heading" id={`${idPrefix}-ladder-heading`}>
                {text(content, 'ladderHeading')}
            </h3>
            <ol className="vol-ladder__rungs">
                {view.rungs.map(({ rung, discount, each }) => {
                    const isCurrent = current === rung;
                    const reached = current !== null && !isCurrent && (rung.exact ? false : rung.count < current.count);
                    const state = isCurrent ? 'current' : reached ? 'reached' : 'ahead';
                    const amount = each !== null && !content.hidePrices ? money.format(each) : null;
                    return (
                        <li key={rung.count} className="vol-rung" data-state={state} data-vol-rung={rung.count} aria-current={isCurrent ? 'step' : undefined}>
                            <span className="vol-rung__marker" aria-hidden="true">
                                {state === 'ahead' ? null : <CheckIcon />}
                            </span>
                            <span className="vol-rung__count">
                                {text(content, rung.count === 1 ? 'tierRowOne' : 'tierRow', { count: rung.count })}
                                {rung === top && view.rungs.length > 1 ? <span className="vol-rung__badge">{text(content, 'tierBest')}</span> : null}
                            </span>
                            {amount ? (
                                <span className="vol-rung__each" data-vol-amount="">
                                    {text(content, 'tierEach', { amount })}
                                </span>
                            ) : null}
                            {discount && !(content.hidePrices && rung.percent === null) ? (
                                <span className="vol-rung__save" data-vol-amount={rung.percent === null ? '' : undefined}>
                                    {text(content, 'tierSave', { discount })}
                                </span>
                            ) : null}
                        </li>
                    );
                })}
            </ol>
            <div className="vol-progress">
                <span className="vol-progress__track" aria-hidden="true">
                    <span className="vol-progress__fill" style={{ transform: `scaleX(${view.progress.fraction})` }} />
                    {view.rungs.map(({ rung }) => (
                        <span
                            key={rung.count}
                            className="vol-progress__tick"
                            data-reached={view.progress.fraction * top.count >= rung.count || undefined}
                            style={{ left: `${(rung.count / top.count) * 100}%` }}
                        />
                    ))}
                </span>
                <p className="vol-progress__text" role="status" data-testid="vol-progress">
                    {view.message}
                </p>
            </div>
        </section>
    );
}
