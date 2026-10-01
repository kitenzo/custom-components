/*
 * The ladder is read off the bundle's tiers and priced by the SDK. These pin down both halves:
 * which rungs a discount becomes (and which it cannot), where a count stands on them, and that a
 * rung's price is the engine's, not the widget's arithmetic.
 */
import type { BundleDetail, DiscountTier } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { ladderProgress, referencePick, rungSelection, tierLadder } from '../src/ladder';
import { toViewModel } from '../src/model';
import { priceOf } from '../src/money';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { load } from './support';

const tier = (operation: DiscountTier['operation'], value: number, discount: number, type: DiscountTier['type'] = 'total_products'): DiscountTier => ({
    type,
    operation,
    value: value.toFixed(2),
    discount: discount.toFixed(2),
    customText: null,
});

function withDiscount(bundle: BundleDetail, discount: Partial<NonNullable<BundleDetail['discount']>>): BundleDetail {
    return { ...bundle, discount: { type: 'percentage', value: null, flatOrTiered: 'tiered', operator: 'max', tiers: [], ...discount } };
}

describe('tierLadder', () => {
    it('reads the rungs from the bundle: 2, 3, 4 and 6 pouches at 10, 15, 20 and 25%', async () => {
        const { bundle } = await load();
        const { rungs, notes } = tierLadder(bundle);
        expect(rungs.map((rung) => [rung.count, rung.percent])).toEqual([
            [2, 10],
            [3, 15],
            [4, 20],
            [6, 25],
        ]);
        expect(notes).toEqual([]);
    });

    it('follows the merchant: different tiers, typed out of order, are a different ladder', async () => {
        const { bundle } = await load();
        const changed = withDiscount(bundle, { tiers: [tier('gte', 10, 30), tier('gte', 5, 12)] });
        expect(tierLadder(changed).rungs.map((rung) => [rung.count, rung.percent])).toEqual([
            [5, 12],
            [10, 30],
        ]);
    });

    it('turns "more than 2" into 3, and keeps "exactly 6" exact', async () => {
        const { bundle } = await load();
        const { rungs } = tierLadder(withDiscount(bundle, { tiers: [tier('gt', 2, 10), tier('eq', 6, 25)] }));
        expect(rungs.map((rung) => [rung.count, rung.exact])).toEqual([
            [3, false],
            [6, true],
        ]);
    });

    it('leaves out what a ladder of counts cannot promise, and tells the merchant why', async () => {
        const { bundle } = await load();
        const { rungs, notes } = tierLadder(
            withDiscount(bundle, { tiers: [tier('gte', 2, 10), tier('gte', 50, 5, 'total_price'), tier('lte', 1, 5), tier('gte', 8, 30)] }),
            6,
        );
        expect(rungs.map((rung) => rung.count)).toEqual([2]);
        expect(notes).toHaveLength(3);
        expect(notes.join(' ')).toMatch(/value/);
        expect(notes.join(' ')).toMatch(/maximum of 6/);
    });

    it('has no rungs for a flat discount, and says so; none and silent for no discount', async () => {
        const { bundle } = await load();
        const flat = tierLadder({ ...bundle, discount: { type: 'percentage', value: '10.00', flatOrTiered: 'flat', operator: 'max', tiers: [] } });
        expect(flat.rungs).toEqual([]);
        expect(flat.notes).toHaveLength(1);
        expect(tierLadder({ ...bundle, discount: null } as unknown as BundleDetail)).toEqual({ rungs: [], notes: [] });
    });

    it('does not claim a percentage for cumulative tiers or money-off tiers: those show the SDK\'s amount', async () => {
        const { bundle } = await load();
        expect(tierLadder(withDiscount(bundle, { operator: 'cumulative', tiers: [tier('gte', 2, 10)] })).rungs[0]!.percent).toBeNull();
        expect(tierLadder(withDiscount(bundle, { type: 'fixed', tiers: [tier('gte', 2, 5)] })).rungs[0]!.percent).toBeNull();
    });
});

describe('ladderProgress', () => {
    it('says where a count stands: the rung it earns, the next one, and how many more', async () => {
        const { bundle } = await load();
        const { rungs } = tierLadder(bundle);
        const at = (count: number) => {
            const progress = ladderProgress(rungs, count);
            return [progress.current?.count ?? null, progress.next?.count ?? null, progress.needed];
        };
        expect(at(0)).toEqual([null, 2, 2]);
        expect(at(1)).toEqual([null, 2, 1]);
        expect(at(2)).toEqual([2, 3, 1]);
        expect(at(3)).toEqual([3, 4, 1]);
        // The gap: there is no tier at 5, so 4 needs two more and 5 earns nothing new.
        expect(at(4)).toEqual([4, 6, 2]);
        expect(at(5)).toEqual([4, 6, 1]);
        expect(at(6)).toEqual([6, null, 0]);
        expect(at(9)).toEqual([6, null, 0]);
        expect(ladderProgress(rungs, 3).fraction).toBeCloseTo(0.5);
        expect(ladderProgress(rungs, 12).fraction).toBe(1);
    });

    it('highlights the tier checkout honours, even when a merchant\'s tiers do not climb', async () => {
        const { bundle } = await load();
        const { rungs } = tierLadder(withDiscount(bundle, { tiers: [tier('gte', 2, 20), tier('gte', 4, 10)] }));
        expect(ladderProgress(rungs, 5).current?.count).toBe(2);
    });

    it('an exact tier is earned at its count only', async () => {
        const { bundle } = await load();
        const { rungs } = tierLadder(withDiscount(bundle, { tiers: [tier('gte', 2, 10), tier('eq', 6, 25)] }));
        expect(ladderProgress(rungs, 6).current?.count).toBe(6);
        expect(ladderProgress(rungs, 7).current?.count).toBe(2);
    });
});

describe('rung prices', () => {
    it('quote the cheapest product, and know when prices differ', () => {
        expect(referencePick([])).toEqual({ pick: null, variesInPrice: false });
        const same = referencePick([
            { sectionId: 1, variantId: 'a', unitPrice: 9.99 },
            { sectionId: 1, variantId: 'b', unitPrice: 9.99 },
        ]);
        expect(same).toEqual({ pick: { sectionId: 1, variantId: 'a' }, variesInPrice: false });
        const mixed = referencePick([
            { sectionId: 1, variantId: 'a', unitPrice: 12 },
            { sectionId: 2, variantId: 'b', unitPrice: 9.5 },
        ]);
        expect(mixed).toEqual({ pick: { sectionId: 2, variantId: 'b' }, variesInPrice: true });
    });

    it('are the engine\'s price for that many: each rung saves exactly its tier', async () => {
        const { bundle, settings } = await load();
        const model = toViewModel(withRequiredVariantIds(bundle), { settings });
        const section = model.sections[0]!;
        const pick = { sectionId: section.id, variantId: section.products[0]!.variants[0]!.id };
        const savings = model.ladder.rungs.map((rung) => {
            const price = priceOf(model.bundle, rungSelection(pick, rung.count));
            return Math.round((1 - price.discounted / price.original) * 100);
        });
        expect(savings).toEqual([10, 15, 20, 25]);
        // One below the first tier: full price.
        const one = priceOf(model.bundle, rungSelection(pick, 1));
        expect(one.discounted).toBe(one.original);
    });

    it('are in the shopper\'s currency in a market, with its decimals', async () => {
        const { bundle } = await load(undefined, { market: { countryCode: 'JP', currency: 'JPY', rate: 190, decimals: 0 } }, 'JP');
        const section = bundle.sections[0]!;
        const pick = { sectionId: section.id, variantId: section.products[0]!.variants[0]!.id };
        const price = priceOf(bundle, rungSelection(pick, 2));
        // 9.99 is ¥1898 in this market; two at 10% off.
        expect(price.original).toBeCloseTo(3796, 0);
        expect(price.discounted).toBeLessThan(price.original);
        expect(price.discounted).toBeGreaterThan(3000);
    });
});
