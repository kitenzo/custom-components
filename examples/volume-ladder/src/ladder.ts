/*
 * The ladder: the bundle's discount tiers as rungs a shopper climbs by adding products.
 *
 * The rungs, and where a count stands on them, are the SDK's (`getDiscountLadder`,
 * `getDiscountLadderProgress`): read off the same tier evaluation the price engine uses, so a
 * ladder can never promise a discount the Cart Transform will not give. This file holds only what
 * the design adds: which rungs are rows, which selection a row's price is quoted for (the SDK's
 * `getBundlePrice` then prices it, in Ladder.tsx), when that price can be called the price of each
 * product, and a sentence for the merchant about each tier the ladder leaves out.
 *
 * Pure functions, no React, so test/ladder.test.ts can pin each one down.
 */
import { getDiscountLadder, isVariantBuyable, type BundleDetail, type DiscountRung, type DiscountTier, type MoneyFormatter, type SectionSelections } from '@kitenzo/react';

import type { ViewSection } from './model';

/**
 * The rungs the ladder draws: one row per tier. The count just past an "exactly N" tier, where its
 * discount stops, is a rung of the ladder too, but not a row.
 */
export function ladderRungs(bundle: BundleDetail): DiscountRung[] {
    return getDiscountLadder(bundle).filter((rung) => rung.tier !== null);
}

const OPERATION_WORDS: Record<DiscountTier['operation'], string> = { gte: 'at least', gt: 'more than', eq: 'exactly', lte: 'at most', lt: 'fewer than' };

/**
 * Why the ladder is missing, or missing a tier: one sentence each, for the theme editor.
 *
 * The SDK decides what is a rung and does not say why a tier is not one, so these name the tier
 * and the reasons there can be, without working any of them out again.
 */
export function ladderNotes(bundle: BundleDetail, rungs: DiscountRung[]): string[] {
    const discount = bundle.discount;
    if (!discount?.type) return [];
    const tiers = discount.flatOrTiered === 'tiered' ? (discount.tiers ?? []) : [];
    if (tiers.length === 0) {
        return ['This bundle has one discount for every selection, not tiers by quantity, so the "buy more, save more" ladder is hidden. Add tiers on the number of products in Kitenzo to show it.'];
    }
    const notes: string[] = [];
    for (const tier of tiers) {
        if (tier.type !== 'total_products') {
            notes.push(`A tier on ${tier.type === 'total_price' ? 'the bundle\'s value' : 'one product\'s quantity'} cannot be drawn as a count of products, so the ladder leaves it out. Checkout still applies it.`);
        } else if (!rungs.some((rung) => rung.tier === tier)) {
            notes.push(
                `The tier for ${OPERATION_WORDS[tier.operation]} ${Number.parseFloat(tier.value)} products is not on the ladder: it is not a step up from the tiers around it, or no shopper can reach it within the bundle's limits. Checkout still applies it.`,
            );
        }
    }
    return notes;
}

export interface ReferencePick {
    sectionId: number;
    variantId: string;
}

export interface Candidate extends ReferencePick {
    /** One of this variant before any discount, in display currency: its price and what picking it adds to the bundle. */
    price: number;
}

/**
 * Every variant a shopper can buy, with what one of it costs before any discount.
 *
 * A variant's surcharge is part of that: the SDK adds it to the bundle on top of the discounted
 * price, so two variants at the same price and different surcharges do not cost the same.
 */
export function candidatesOf(sections: ViewSection[], money: Pick<MoneyFormatter, 'unitPrice' | 'surcharge'>): Candidate[] {
    return sections.flatMap((section) =>
        section.products
            .flatMap((product) => product.variants.filter(isVariantBuyable))
            .map((variant) => ({ sectionId: section.id, variantId: variant.id, price: money.unitPrice(variant) + money.surcharge(variant) })),
    );
}

/**
 * The product a row's price is quoted for: the cheapest one the shopper can buy.
 *
 * A row says "4 pouches, £7.99 each". When every product costs the same that is exact; when
 * they differ, the cheapest is the honest floor (`variesInPrice` tells the UI not to say
 * "each" as though it were exact).
 */
export function referencePick(candidates: Candidate[]): { pick: ReferencePick | null; variesInPrice: boolean } {
    if (candidates.length === 0) return { pick: null, variesInPrice: false };
    const cheapest = candidates.reduce((best, candidate) => (candidate.price < best.price ? candidate : best));
    const variesInPrice = candidates.some((candidate) => Math.abs(candidate.price - cheapest.price) > 0.004);
    return { pick: { sectionId: cheapest.sectionId, variantId: cheapest.variantId }, variesInPrice };
}

/**
 * The bundle has a tier that does not go by the number of products: one on the bundle's value, or
 * on one product's quantity.
 *
 * A row is priced for that many of ONE product, and such a tier can answer differently for the mix
 * a shopper really picks: four of one pouch reach a "4 of the same product" tier that four
 * flavours do not. So with one of these the row's price is not the price of each product.
 */
export function hasOtherTiers(bundle: BundleDetail): boolean {
    const discount = bundle.discount;
    if (!discount?.type || discount.flatOrTiered !== 'tiered') return false;
    return (discount.tiers ?? []).some((tier) => tier.type !== 'total_products');
}

/** The selection a row stands for: `count` of the reference product. Fed to the SDK's `getBundlePrice`. */
export function rungSelection(pick: ReferencePick, count: number): SectionSelections {
    return { [pick.sectionId]: [{ variantId: pick.variantId, quantity: count }] };
}
