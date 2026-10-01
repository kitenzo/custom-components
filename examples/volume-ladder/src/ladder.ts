/*
 * The ladder: the bundle's discount tiers as rungs a shopper climbs by adding products.
 *
 * Everything here is read off the bundle. The widget never writes "2 for 10%" anywhere; it
 * reads the merchant's tiers, so a merchant who changes them in Kitenzo changes the ladder, and a
 * ladder can never promise a discount the Cart Transform will not give.
 *
 * Pure functions, no React, so test/ladder.test.ts can pin each rule down. Pricing a rung is the
 * SDK's (money.ts `priceOf`): this file decides only WHICH selection a rung stands for.
 */
import type { BundleDetail, DiscountTier, SectionSelections } from '@kitenzo/react';

export interface Rung {
    /** How many products reach this tier. */
    count: number;
    /** An `eq` tier: only exactly `count` gets it, not `count` or more. */
    exact: boolean;
    /**
     * The percentage off, when it can be said as one: a percentage discount whose tiers are not
     * cumulative. Otherwise null, and the rung shows the money saved, priced by the SDK.
     */
    percent: number | null;
    tier: DiscountTier;
}

export interface Ladder {
    rungs: Rung[];
    /** Tiers the ladder could not draw, each a sentence for the merchant (theme editor only). */
    notes: string[];
}

/**
 * The rungs, lowest first.
 *
 * Only tiers on the number of products can be a ladder of counts: a tier on the cart's value or
 * on one product's quantity says nothing a "3 pouches" row could promise, so it is left out and
 * the merchant is told why. So is a tier the bundle's own maximum makes unreachable, and an
 * "at most" tier (a discount for buying fewer is not a ladder).
 */
export function tierLadder(bundle: BundleDetail, bundleMax: number = Number.POSITIVE_INFINITY): Ladder {
    const discount = bundle.discount;
    const notes: string[] = [];
    if (!discount || discount.flatOrTiered !== 'tiered' || !discount.tiers?.length) {
        if (discount?.type) {
            notes.push('This bundle has one discount for every selection, not tiers by quantity, so the "buy more, save more" ladder is hidden. Add tiers on the number of products in Kitenzo to show it.');
        }
        return { rungs: [], notes };
    }

    const byCount = new Map<number, Rung>();
    for (const tier of discount.tiers) {
        const value = Number.parseFloat(tier.value);
        if (tier.type !== 'total_products') {
            notes.push(`A tier on ${tier.type === 'total_price' ? 'the bundle\'s value' : 'one product\'s quantity'} cannot be drawn as a count of products, so the ladder leaves it out. Checkout still applies it.`);
            continue;
        }
        if (!Number.isFinite(value)) continue;
        let count: number;
        if (tier.operation === 'gte') count = Math.ceil(value);
        else if (tier.operation === 'gt') count = Math.floor(value) + 1;
        else if (tier.operation === 'eq') count = value;
        else {
            notes.push(`A tier for ${tier.operation === 'lt' ? 'fewer than' : 'at most'} ${value} products is not a step up, so the ladder leaves it out.`);
            continue;
        }
        if (!Number.isInteger(count) || count < 1) continue;
        if (count > bundleMax) {
            notes.push(`The tier at ${count} products is above the bundle's maximum of ${bundleMax}, so no shopper can reach it and the ladder leaves it out.`);
            continue;
        }
        const percent = discount.type === 'percentage' && discount.operator !== 'cumulative' ? Number.parseFloat(tier.discount) : null;
        const rung: Rung = { count, exact: tier.operation === 'eq', percent: percent !== null && Number.isFinite(percent) ? percent : null, tier };
        const existing = byCount.get(count);
        // Two tiers at one count: the engine applies the better one ("max"), so the ladder shows it.
        if (!existing || Number.parseFloat(tier.discount) > Number.parseFloat(existing.tier.discount)) byCount.set(count, rung);
    }
    return { rungs: [...byCount.values()].sort((a, b) => a.count - b.count), notes };
}

function reaches(rung: Rung, count: number): boolean {
    return rung.exact ? count === rung.count : count >= rung.count;
}

export interface Progress {
    /** The rung the current count earns, or null below the first. */
    current: Rung | null;
    /** The next rung up, or null at the top. */
    next: Rung | null;
    /** Products still to add to reach `next`. */
    needed: number;
    /** 0 to 1, for the bar: how far up the ladder this count is. */
    fraction: number;
}

/**
 * Where `count` stands on the ladder.
 *
 * The current rung is the best one the count reaches, which is what the engine applies when
 * tiers combine by "max" (the default). Rungs are compared by their discount, not their count,
 * so a ladder a merchant typed out of order still highlights the tier checkout will honour.
 */
export function ladderProgress(rungs: Rung[], count: number): Progress {
    const reached = rungs.filter((rung) => reaches(rung, count));
    const current = reached.reduce<Rung | null>(
        (best, rung) =>
            !best || Number.parseFloat(rung.tier.discount) > Number.parseFloat(best.tier.discount) ||
            (Number.parseFloat(rung.tier.discount) === Number.parseFloat(best.tier.discount) && rung.count > best.count)
                ? rung
                : best,
        null,
    );
    const next = rungs.find((rung) => rung.count > count) ?? null;
    const top = rungs[rungs.length - 1];
    return {
        current,
        next,
        needed: next ? next.count - count : 0,
        fraction: top ? Math.min(1, Math.max(0, count / top.count)) : 0,
    };
}

export interface ReferencePick {
    sectionId: number;
    variantId: string;
}

export interface Candidate extends ReferencePick {
    /** One of this variant, in display currency. */
    unitPrice: number;
}

/**
 * The product a rung's price is quoted for: the cheapest one the shopper can buy.
 *
 * A rung says "4 pouches, £7.99 each". When every product costs the same that is exact; when
 * they differ, the cheapest is the honest floor (`variesInPrice` tells the UI not to say
 * "each" as though it were exact).
 */
export function referencePick(candidates: Candidate[]): { pick: ReferencePick | null; variesInPrice: boolean } {
    if (candidates.length === 0) return { pick: null, variesInPrice: false };
    const cheapest = candidates.reduce((best, candidate) => (candidate.unitPrice < best.unitPrice ? candidate : best));
    const variesInPrice = candidates.some((candidate) => Math.abs(candidate.unitPrice - cheapest.unitPrice) > 0.004);
    return { pick: { sectionId: cheapest.sectionId, variantId: cheapest.variantId }, variesInPrice };
}

/** The selection a rung stands for: `count` of the reference product. Fed to the SDK's pricing. */
export function rungSelection(pick: ReferencePick, count: number): SectionSelections {
    return { [pick.sectionId]: [{ variantId: pick.variantId, quantity: count }] };
}
