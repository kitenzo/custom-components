/*
 * The ladder: one row per discount tier, the tier the shopper is on highlighted, and a progress
 * line saying what the next one takes.
 *
 * The rows and the shopper's place on them are the SDK's (`getDiscountLadder`,
 * `getDiscountLadderProgress`), and every amount is the SDK's price for that many of the cheapest
 * product (`getBundlePrice` on ladder.ts `rungSelection`), in the shopper's currency. A rung is
 * information, not a control: it is a list item, never a button that looks like a radio, because
 * tapping "4 pouches" cannot choose four flavours for the shopper.
 */
import { memo, useMemo } from 'react';

import { getBundlePrice, getDiscountLadderProgress, getDiscountTierText, useSettings, type DiscountLadderProgress, type DiscountRung } from '@kitenzo/react';

import { text, type Content } from '../content';
import { candidatesOf, hasOtherTiers, ladderRungs, referencePick, rungSelection } from '../ladder';
import { pickedCount } from '../selection';
import { useBuilder, useSelection } from './context';
import { CheckIcon } from './Icons';

export interface PricedRung {
    rung: DiscountRung;
    /** "15%" or a money amount: what this rung saves, in words the shopper reads. Null if unknown. */
    discount: string | null;
    /** The price of one product at this rung, display currency. Null when it is not one number. */
    each: number | null;
}

export interface LadderView {
    /** One per tier (`ladderRungs`). */
    rows: PricedRung[];
    /** The count of the row whose discount is in force, or null below the first. */
    inForce: number | null;
    /** 0 to 1, for the bar: how far up the ladder the bundle is. */
    fraction: number;
    /** The progress line, or '' when the bundle has no ladder. */
    message: string;
}

function percentText(percent: number): string {
    const locale = typeof document !== 'undefined' ? document.documentElement.lang || undefined : undefined;
    return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(percent / 100);
}

/** The widget's own progress line, for a tier the merchant gave no sentence of their own. */
function progressMessage(content: Content, progress: DiscountLadderProgress, picked: number, discountOf: (rung: DiscountRung) => string | null): string {
    const { next } = progress;
    if (next) {
        const discount = discountOf(next);
        if (!discount) return '';
        return text(content, picked === 0 ? 'progressStart' : 'progressNext', { count: progress.missing, discount });
    }
    const discount = progress.current ? discountOf(progress.current) : null;
    return discount ? text(content, 'progressTop', { discount }) : '';
}

/**
 * The row to highlight: the rung the count stands on. Past the end of an "exactly N" tier the
 * count stands on a rung that is no row, and the row to highlight is the one whose discount
 * applies again.
 */
function rowInForce(rows: PricedRung[], current: DiscountRung | null): number | null {
    if (!current) return null;
    if (current.tier) return current.count;
    const again = rows.filter(({ rung }) => !rung.exact && rung.count < current.count && rung.discount === current.discount).pop();
    return again?.rung.count ?? null;
}

/** Everything the ladder draws, recomputed when the selection, the market or the stock changes. */
function useLadderView(): LadderView {
    const { model, money, content } = useBuilder();
    const { selections, progress } = useSelection();
    const { bundle, sections } = model;
    const settings = useSettings();
    // The page's language, as for the total, so a rung's saving is written the way the total is.
    const locale = document.documentElement.lang || undefined;
    // A rung's count is the bundle's, included products and all: the shopper picks the rest.
    const { requiredQuantity } = progress;

    const priceOf = useMemo(() => {
        const { pick, variesInPrice } = referencePick(candidatesOf(sections, money));
        // "£7.99 each" only when it is true of every product in any mix; with mixed prices, a tier
        // that does not go by the count, or a product included on top, it would be a guess.
        const exactEach = !variesInPrice && !hasOtherTiers(bundle) && requiredQuantity === 0;
        return (rung: DiscountRung): PricedRung => {
            const picks = rung.count - requiredQuantity;
            // The SDK's price for a selection the shopper has not made: the one call the total is made of.
            const price = pick && picks > 0 ? getBundlePrice(bundle, rungSelection(pick, picks), { settings, locale }) : null;
            const saving = price?.amounts?.saved ?? 0;
            // A bundle's minimum spend can hold a tier back, so a row claims only what its price shows.
            const saves = !price || saving > 0;
            const discount = !saves ? null : rung.discountType === 'percentage' ? percentText(rung.discount) : saving > 0 ? (price?.formattedSavedAmount ?? null) : null;
            const each = price?.amounts && exactEach ? price.amounts.discounted / rung.count : null;
            return { rung, discount, each };
        };
    }, [bundle, sections, money, settings, locale, requiredQuantity]);
    const rows = useMemo(() => ladderRungs(bundle).map(priceOf), [bundle, priceOf]);

    // The count the engine sees: the shopper's picks and the products every bundle includes.
    const place = getDiscountLadderProgress(bundle, progress.quantity);
    const top = rows[rows.length - 1]?.rung;
    // The count can stand on a rung that is no row (just past an "exactly N" tier), priced the same way.
    const discountOf = (rung: DiscountRung) => (rows.find((row) => row.rung.count === rung.count) ?? priceOf(rung)).discount;
    // The merchant's own "reach the next tier" sentence, written on the tier in Kitenzo, comes first.
    const message = getDiscountTierText(bundle, selections, { money }) ?? progressMessage(content, place, pickedCount(progress), discountOf);
    return {
        rows,
        inForce: rowInForce(rows, place.current),
        fraction: top ? Math.min(1, Math.max(0, progress.quantity / top.count)) : 0,
        message,
    };
}

/*
 * Memoised, with no props: the ladder is drawn again by a pick or a change to what is offered,
 * never by the Builder alone.
 */
export const Ladder = memo(function Ladder() {
    const { content, money, layout, idPrefix } = useBuilder();
    const view = useLadderView();
    if (view.rows.length === 0) return null;
    const top = view.rows[view.rows.length - 1]!.rung;
    const { inForce } = view;

    return (
        <section className={`vol-ladder vol-ladder--${layout}`} aria-labelledby={`${idPrefix}-ladder-heading`}>
            <h3 className="vol-ladder__heading" id={`${idPrefix}-ladder-heading`}>
                {text(content, 'ladderHeading')}
            </h3>
            <ol className="vol-ladder__rungs">
                {view.rows.map(({ rung, discount, each }) => {
                    const isCurrent = inForce === rung.count;
                    const reached = inForce !== null && !rung.exact && rung.count < inForce;
                    const state = isCurrent ? 'current' : reached ? 'reached' : 'ahead';
                    const amount = each !== null && !content.hidePrices ? money.format(each) : null;
                    return (
                        <li key={rung.count} className="vol-rung" data-state={state} data-vol-rung={rung.count} aria-current={isCurrent ? 'step' : undefined}>
                            <span className="vol-rung__marker" aria-hidden="true">
                                {state === 'ahead' ? null : <CheckIcon />}
                            </span>
                            <span className="vol-rung__count">
                                {text(content, rung.count === 1 ? 'tierRowOne' : 'tierRow', { count: rung.count })}
                                {rung === top && view.rows.length > 1 ? <span className="vol-rung__badge">{text(content, 'tierBest')}</span> : null}
                            </span>
                            {amount ? (
                                <span className="vol-rung__each" data-vol-amount="">
                                    {text(content, 'tierEach', { amount })}
                                </span>
                            ) : null}
                            {discount && !(content.hidePrices && rung.discountType !== 'percentage') ? (
                                <span className="vol-rung__save" data-vol-amount={rung.discountType === 'percentage' ? undefined : ''}>
                                    {text(content, 'tierSave', { discount })}
                                </span>
                            ) : null}
                        </li>
                    );
                })}
            </ol>
            <div className="vol-progress">
                <span className="vol-progress__track" aria-hidden="true">
                    <span className="vol-progress__fill" style={{ transform: `scaleX(${view.fraction})` }} />
                    {view.rows.map(({ rung }) => (
                        <span
                            key={rung.count}
                            className="vol-progress__tick"
                            data-reached={view.fraction * top.count >= rung.count || undefined}
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
});
