/*
 * The widget's half of the ladder: which rungs are rows, the notes for the merchant, which product
 * a row is priced for, and when that price can be called the price of each product. The rungs and
 * the prices themselves are the SDK's (test/sdk-contract.test.ts holds what is taken on trust).
 */
import { createMoneyFormatter, getBundlePrice, getDiscountLadder, type BundleDetail, type DiscountTier } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { candidatesOf, hasOtherTiers, ladderNotes, ladderRungs, referencePick, rungSelection } from '../src/ladder';
import { toViewModel } from '../src/model';
import { load, soldOut, withProduct } from './support';

type Change = NonNullable<Parameters<typeof load>[0]>;

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

const withMaximum =
    (maximum: number): Change =>
    (fixture) => ({
        ...fixture,
        bundle: { ...fixture.bundle, limitRules: [...fixture.bundle.limitRules, { operation: 'lte', sectionId: null, type: 'total-number-of-products', value: maximum.toFixed(2) }] },
    });

/** The demo bundle applying surcharges, with one on a single flavour. */
const withSurcharge =
    (handle: string, surcharge: string): Change =>
    (fixture) => ({
        ...withProduct(fixture, handle, (product) => ({ ...product, variants: product.variants.map((variant) => ({ ...variant, surcharge })) })),
        bundle: { ...fixture.bundle, applyVariantSurcharges: true },
    });

/** What Ladder.tsx asks: the product a row is priced for, and whether prices differ. */
async function reference(change?: Change) {
    const { bundle, settings } = await load(change);
    const model = toViewModel(bundle, settings);
    const candidates = candidatesOf(model.sections, createMoneyFormatter(bundle, settings));
    const variantOf = (handle: string) => model.sections[0]!.products.find((product) => product.handle === handle)!.variants[0]!.id;
    return { bundle, settings, model, candidates, variantOf, ...referencePick(candidates) };
}

describe('ladderRungs', () => {
    it('are one row per tier, in order, whatever order the merchant typed them in', async () => {
        const { bundle } = await load();
        expect(ladderRungs(bundle).map((rung) => [rung.count, rung.discount])).toEqual([
            [2, 10],
            [3, 15],
            [4, 20],
            [6, 25],
        ]);
        expect(ladderRungs(withDiscount(bundle, { tiers: [tier('gte', 10, 30), tier('gte', 5, 12)] })).map((rung) => rung.count)).toEqual([5, 10]);
    });

    it('leave out the count just past an "exactly 6" tier: a rung of the ladder, but not a row', async () => {
        const { bundle } = await load();
        const changed = withDiscount(bundle, { tiers: [tier('gte', 2, 10), tier('eq', 6, 25)] });
        expect(getDiscountLadder(changed).map((rung) => rung.count)).toEqual([2, 6, 7]);
        expect(ladderRungs(changed).map((rung) => rung.count)).toEqual([2, 6]);
    });
});

describe('ladderNotes', () => {
    it('say nothing when every tier is a row', async () => {
        const { bundle } = await load();
        expect(ladderNotes(bundle, ladderRungs(bundle))).toEqual([]);
    });

    it('tell the merchant about each tier the ladder leaves out', async () => {
        const { bundle } = await load(withMaximum(6));
        const changed = withDiscount(bundle, { tiers: [tier('gte', 2, 10), tier('gte', 50, 5, 'total_price'), tier('gte', 3, 5, 'bulk_buy'), tier('gte', 8, 30)] });
        const rungs = ladderRungs(changed);
        expect(rungs.map((rung) => rung.count)).toEqual([2]);
        const notes = ladderNotes(changed, rungs);
        expect(notes).toHaveLength(3);
        expect(notes[0]).toMatch(/bundle's value/);
        expect(notes[1]).toMatch(/one product's quantity/);
        expect(notes[2]).toMatch(/at least 8 products is not on the ladder/);
    });

    it('say the ladder is hidden for a flat discount, and nothing for no discount', async () => {
        const { bundle } = await load();
        const flat: BundleDetail = { ...bundle, discount: { type: 'percentage', value: '10.00', flatOrTiered: 'flat', operator: 'max', tiers: [] } };
        expect(ladderNotes(flat, ladderRungs(flat))).toEqual([expect.stringMatching(/ladder is hidden/)]);
        expect(ladderNotes({ ...bundle, discount: null } as unknown as BundleDetail, [])).toEqual([]);
    });
});

describe('the product a row is priced for', () => {
    it('is the cheapest, and prices do not vary, when every flavour costs the same', async () => {
        const { candidates, pick, variesInPrice, variantOf, model } = await reference();
        expect(candidates.map((candidate) => candidate.price)).toEqual([9.99, 9.99, 9.99, 9.99]);
        expect(pick).toEqual({ sectionId: model.sections[0]!.id, variantId: variantOf('chocolate-whey-protein') });
        expect(variesInPrice).toBe(false);
        expect(referencePick([])).toEqual({ pick: null, variesInPrice: false });
    });

    it('is never a flavour the shopper cannot buy', async () => {
        const { candidates, pick, variantOf } = await reference((fixture) => withProduct(fixture, 'chocolate-whey-protein', soldOut));
        expect(candidates).toHaveLength(3);
        expect(pick?.variantId).toBe(variantOf('vanilla-whey-protein'));
    });

    it('goes by what a pouch really costs: a cheaper flavour is the reference, and prices vary', async () => {
        const { pick, variesInPrice, variantOf } = await reference((fixture) =>
            withProduct(fixture, 'vanilla-whey-protein', (product) => ({ ...product, variants: product.variants.map((variant) => ({ ...variant, price: '7.50' })) })),
        );
        expect(pick?.variantId).toBe(variantOf('vanilla-whey-protein'));
        expect(variesInPrice).toBe(true);
    });

    it('counts a variant\'s surcharge: same price, one flavour dearer, so prices vary and the reference is not that flavour', async () => {
        const { bundle, settings, candidates, pick, variesInPrice, variantOf } = await reference(withSurcharge('chocolate-whey-protein', '2.00'));
        expect(candidates.map((candidate) => candidate.price)).toEqual([11.99, 9.99, 9.99, 9.99]);
        expect(variesInPrice).toBe(true);
        expect(pick?.variantId).toBe(variantOf('vanilla-whey-protein'));
        // Why it matters: the SDK adds the surcharge on top of the discount, so two of the dearer
        // flavour do not cost what two of the reference do.
        const two = (handle: string) => getBundlePrice(bundle, rungSelection({ sectionId: pick!.sectionId, variantId: variantOf(handle) }, 2), { settings }).amounts!.discounted;
        expect(two('chocolate-whey-protein')).toBeGreaterThan(two('vanilla-whey-protein'));
    });
});

describe('hasOtherTiers', () => {
    it('is false for tiers on the number of products, a flat discount and no discount', async () => {
        const { bundle } = await load();
        expect(hasOtherTiers(bundle)).toBe(false);
        expect(hasOtherTiers({ ...bundle, discount: { type: 'percentage', value: '10.00', flatOrTiered: 'flat', operator: 'max', tiers: [tier('gte', 2, 30, 'bulk_buy')] } })).toBe(false);
        expect(hasOtherTiers({ ...bundle, discount: null } as unknown as BundleDetail)).toBe(false);
    });

    it('is true for a tier on one product\'s quantity or on the bundle\'s value, which a row of one product can reach and a mix cannot', async () => {
        const { bundle, settings, pick, variantOf } = await reference();
        const bulk = withDiscount(bundle, { tiers: [tier('gte', 2, 10), tier('gte', 2, 30, 'bulk_buy')] });
        expect(hasOtherTiers(bulk)).toBe(true);
        expect(hasOtherTiers(withDiscount(bundle, { tiers: [tier('gte', 2, 10), tier('gte', 50, 30, 'total_price')] }))).toBe(true);

        // Why it matters: two of one flavour are quoted at the bulk tier, two flavours are not.
        const saved = (selections: Parameters<typeof getBundlePrice>[1]) => {
            const { original, discounted } = getBundlePrice(bulk, selections, { settings }).amounts!;
            return Math.round((1 - discounted / original) * 100);
        };
        expect(saved(rungSelection(pick!, 2))).toBe(30);
        expect(saved({ [pick!.sectionId]: [{ variantId: variantOf('chocolate-whey-protein'), quantity: 1 }, { variantId: variantOf('vanilla-whey-protein'), quantity: 1 }] })).toBe(10);
    });
});

describe('rungSelection', () => {
    it('is that many of the reference product, which the engine prices at exactly the row\'s tier', async () => {
        const { bundle, settings, pick } = await reference();
        expect(rungSelection(pick!, 4)).toEqual({ [pick!.sectionId]: [{ variantId: pick!.variantId, quantity: 4 }] });
        const savings = ladderRungs(bundle).map((rung) => {
            const price = getBundlePrice(bundle, rungSelection(pick!, rung.count), { settings }).amounts!;
            return Math.round((1 - price.discounted / price.original) * 100);
        });
        expect(savings).toEqual([10, 15, 20, 25]);
    });
});
