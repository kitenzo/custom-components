/*
 * The discount ladder: what the case saves now, what the next tier is worth, and how many more
 * cans reach it.
 *
 * Read from the bundle's own tiered discount, never typed into the widget: a merchant who
 * changes "12 cans, 10% off" to "10 cans, 12% off" in Kitenzo sees the ladder move on the next
 * page load. The price itself is still the SDK's (`useBundlePrice`); this only describes the
 * tiers so a shopper can see where they stand.
 *
 * A rung is a tier the shopper climbs by adding cans: a `total_products` tier with `gte` (or
 * `gt`, which is `gte` one higher). Tiers on spend (`total_price`), on one product's quantity
 * (`bulk_buy`), or with `lt` / `lte` / `eq` are not a ladder a count can climb, so they are left
 * off it (and counted in `skipped`, which the theme editor reports). Pricing still honours them.
 *
 * The message follows Kitenzo's own widget, so a tier's `customText` reads the same here as on a
 * store using the standard builder:
 *
 *   - the NEXT tier's `customText` speaks, with `{{ amount }}` = cans still needed,
 *     `{{ discount }}` = that tier's discount and `{{ currentDiscount }}` = the discount in force
 *     now. Percentages are bare numbers (the merchant writes the `%`), money is formatted;
 *   - with no `customText` (`null` or blank), the theme's own default copy speaks instead;
 *   - once every rung is reached, the theme's "top tier" copy speaks.
 */
import type { BundleDiscount, DiscountType } from '@kitenzo/react';

import { fillTierText, text, type Content } from './content';

export interface Rung {
    /** Cans needed to reach this rung. */
    threshold: number;
    /** The tier's own discount value, as the API sent it. */
    discount: number;
    /** What the bundle is discounted by on this rung: the tiers combined by the bundle's operator. */
    effective: number;
    customText: string | null;
    reached: boolean;
}

export interface Ladder {
    type: DiscountType;
    rungs: Rung[];
    count: number;
    /** The highest rung reached, or null below the first. */
    current: Rung | null;
    /** The first rung not yet reached, or null at the top. */
    next: Rung | null;
    /** Cans still needed to reach `next`. 0 at the top. */
    remaining: number;
    /** The discount in force now (0 below the first rung). */
    inForce: number;
    /** 0 to 1 along the ladder, where 1 is the top rung. */
    progress: number;
    /** Tiers the ladder cannot draw (see above). */
    skipped: number;
}

function threshold(operation: string, value: number): number | null {
    if (operation === 'gte') return Math.ceil(value);
    if (operation === 'gt') return Math.floor(value) + 1;
    return null;
}

/** The ladder for `count` cans, or null when the bundle has no tiered discount to climb. */
export function tierLadder(discount: BundleDiscount | null | undefined, count: number): Ladder | null {
    if (!discount || discount.flatOrTiered !== 'tiered' || !discount.type) return null;
    const type = discount.type;
    const tiers = discount.tiers ?? [];
    const climbable = tiers.flatMap((tier) => {
        const value = Number.parseFloat(tier.value);
        const amount = Number.parseFloat(tier.discount);
        const at = tier.type === 'total_products' && Number.isFinite(value) ? threshold(tier.operation, value) : null;
        // A tier worth nothing is not a rung: the standard widget skips it too.
        return at !== null && at > 0 && Number.isFinite(amount) && amount > 0
            ? [{ threshold: at, discount: amount, customText: tier.customText?.trim() ? tier.customText : null }]
            : [];
    });
    if (climbable.length === 0) return null;
    climbable.sort((a, b) => a.threshold - b.threshold);

    // Mirrors the SDK's getTieredDiscount: every active tier, combined by the bundle's operator.
    const combine = (values: number[]) => (discount.operator === 'cumulative' ? values.reduce((sum, value) => sum + value, 0) : Math.max(...values));
    const rungs: Rung[] = climbable.map((tier) => ({
        ...tier,
        effective: combine(climbable.filter((other) => other.threshold <= tier.threshold).map((other) => other.discount)),
        reached: count >= tier.threshold,
    }));

    const reached = rungs.filter((rung) => rung.reached);
    const current = reached[reached.length - 1] ?? null;
    const next = rungs.find((rung) => !rung.reached) ?? null;
    const top = rungs[rungs.length - 1]!.threshold;
    return {
        type,
        rungs,
        count,
        current,
        next,
        remaining: next ? next.threshold - count : 0,
        inForce: reached.length > 0 ? combine(reached.map((rung) => rung.discount)) : 0,
        progress: Math.max(0, Math.min(1, count / top)),
        skipped: tiers.length - climbable.length,
    };
}

/** `10` reads as "10", `7.5` as "7.5": the way a merchant writes a percentage. */
export function bareNumber(value: number): string {
    return String(Math.round(value * 100) / 100);
}

/**
 * A discount as the shopper reads it in our own copy: "10% off", "£5 off", "£40 a case".
 * `formatMoney` returns null while the shop's money format loads.
 */
export function discountLabel(content: Content, type: DiscountType, value: number, formatMoney: (amount: number) => string | null): string {
    if (type === 'percentage') return text(content, 'discountPercent', { value: bareNumber(value) });
    const amount = formatMoney(value) ?? '';
    return text(content, type === 'price' ? 'discountPrice' : 'discountAmount', { amount });
}

export interface LadderMessage {
    text: string;
    /** True when the words are the merchant's tier `customText`, not the theme's default. */
    custom: boolean;
}

/** What the ladder says right now. See the file comment for whose words speak when. */
export function ladderMessage(ladder: Ladder, content: Content, formatMoney: (amount: number) => string | null): LadderMessage {
    const label = (value: number) => discountLabel(content, ladder.type, value, formatMoney);
    if (!ladder.next) {
        return { text: text(content, 'tierMax', { discount: label(ladder.inForce) }), custom: false };
    }
    if (ladder.next.customText) {
        // The standard widget's {{ discount }} / {{ currentDiscount }}: bare for a percentage
        // (the % is in the merchant's copy), formatted money otherwise.
        const placeholder = (value: number) => (ladder.type === 'percentage' ? bareNumber(value) : (formatMoney(value) ?? ''));
        return {
            text: fillTierText(ladder.next.customText, {
                amount: ladder.remaining,
                discount: placeholder(ladder.next.discount),
                currentDiscount: placeholder(ladder.inForce),
            }),
            custom: true,
        };
    }
    return {
        text: text(content, ladder.remaining === 1 ? 'tierNextOne' : 'tierNext', { count: ladder.remaining, discount: label(ladder.next.effective) }),
        custom: false,
    };
}
