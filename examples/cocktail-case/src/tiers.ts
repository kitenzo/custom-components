/*
 * The discount ladder, in the shop's words.
 *
 * The ladder itself is the SDK's. `getDiscountLadder` makes rungs of the bundle's tiers,
 * `getDiscountLadderProgress` says where a count stands on them, and `getDiscountTierText` fills
 * the merchant's own "reach the next tier" sentence. All three read the tier evaluation the price
 * uses, so the ladder cannot promise a discount checkout will not give, and a merchant who changes
 * "12 cans, 10% off" to "10 cans, 12% off" in Kitenzo sees it move on the next page load.
 *
 * This file adds only words: what a shopper reads, from the theme's settings (how a discount is
 * worded, "10% off", "£5 off", "£40 a case", and the sentence under the meter), and a sentence for
 * the merchant about each tier the ladder leaves out.
 *
 *   - the next tier's `customText` speaks when it has one, filled by the SDK;
 *   - with none, the theme's own default copy speaks instead;
 *   - once every rung is reached, the theme's "top tier" copy speaks.
 */
import {
    getDiscountLadder,
    getDiscountLadderProgress,
    getDiscountTierText,
    type BundleDetail,
    type DiscountLadderProgress,
    type DiscountRung,
    type DiscountTier,
    type DiscountType,
    type MoneyFormatter,
    type SectionSelections,
} from '@kitenzo/react';

import { text, type Content } from './content';

/** What words an amount of money: the bundle's own formatter (`useMoney`). */
export type TierMoney = Pick<MoneyFormatter, 'format' | 'fromShopCurrency'>;

export interface Ladder extends DiscountLadderProgress {
    /** The rungs the meter draws, lowest count first. */
    rungs: DiscountRung[];
    type: DiscountType;
    /** The count the case stands at, as the engine counts it (required products included). */
    count: number;
}

/**
 * The rungs the meter draws: one per tier. The count just past an "exactly N" tier, where its
 * discount stops, is a rung of the ladder too, but nothing to aim for.
 */
export function ladderRungs(bundle: BundleDetail): DiscountRung[] {
    return getDiscountLadder(bundle).filter((rung) => rung.tier !== null);
}

const OPERATION_WORDS: Record<DiscountTier['operation'], string> = { gte: 'at least', gt: 'more than', eq: 'exactly', lte: 'at most', lt: 'fewer than' };

/**
 * Why the ladder is missing a tier: one sentence each, for the theme editor.
 *
 * The SDK decides what is a rung and does not say why a tier is not one, so these name the tier
 * and the reasons there can be, without working any of them out again. A bundle with one discount
 * for every case has no tiers to leave out, and simply has no ladder.
 */
export function ladderNotes(bundle: BundleDetail, rungs: DiscountRung[]): string[] {
    const discount = bundle.discount;
    const tiers = discount?.type && discount.flatOrTiered === 'tiered' ? (discount.tiers ?? []) : [];
    const notes: string[] = [];
    for (const tier of tiers) {
        if (tier.type !== 'total_products') {
            notes.push(`A tier on ${tier.type === 'total_price' ? 'the case\'s value' : 'one drink\'s quantity'} cannot be drawn as a count of cans, so the ladder leaves it out. Checkout still applies it.`);
        } else if (!rungs.some((rung) => rung.tier === tier)) {
            notes.push(
                `The tier for ${OPERATION_WORDS[tier.operation]} ${Number.parseFloat(tier.value)} cans is not on the ladder: it is not a step up from the tiers around it, or no shopper can reach it within the case's limits. Checkout still applies it.`,
            );
        }
    }
    return notes;
}

/** The ladder for `count` cans, or null when the bundle has no tiers a count can climb. */
export function readLadder(bundle: BundleDetail, count: number): Ladder | null {
    const rungs = ladderRungs(bundle);
    if (rungs.length === 0) return null;
    return { ...getDiscountLadderProgress(bundle, count), rungs, type: rungs[0]!.discountType, count };
}

/** `10` reads as "10", `7.5` as "7.5": the way a merchant writes a percentage. */
function bareNumber(value: number): string {
    return String(Math.round(value * 100) / 100);
}

/**
 * A discount as the shopper reads it in the theme's copy: "10% off", "£5 off", "£40 a case".
 * A money discount is stored in the shop's currency, so it is converted for the shopper's market.
 */
export function discountLabel(content: Content, type: DiscountType, value: number, money: TierMoney): string {
    if (type === 'percentage') return text(content, 'discountPercent', { value: bareNumber(value) });
    const amount = money.format(money.fromShopCurrency(value));
    return text(content, type === 'price' ? 'discountPrice' : 'discountAmount', { amount });
}

export interface LadderMessage {
    text: string;
    /** True when the words are the merchant's tier `customText`, not the theme's default. */
    custom: boolean;
}

/** What the ladder says right now. See the file comment for whose words speak when. */
export function ladderMessage(ladder: Ladder, bundle: BundleDetail, selections: SectionSelections, content: Content, money: TierMoney): LadderMessage {
    const custom = getDiscountTierText(bundle, selections, { money });
    if (custom !== null) return { text: custom, custom: true };
    const label = (value: number) => discountLabel(content, ladder.type, value, money);
    if (ladder.next) {
        return { text: text(content, ladder.missing === 1 ? 'tierNextOne' : 'tierNext', { count: ladder.missing, discount: label(ladder.next.discount) }), custom: false };
    }
    return { text: ladder.discount ? text(content, 'tierMax', { discount: label(ladder.discount) }) : '', custom: false };
}
