import { describe, expect, it } from 'vitest';

import { createMoneyFormatter, type BundleDetail, type BundleDiscount, type SectionSelections } from '@kitenzo/core';

import { DEFAULT_CONTENT, text } from '../src/content';
import { discountLabel, ladderMessage, ladderNotes, ladderRungs, readLadder } from '../src/tiers';
import { load } from './support';

/** The case, its money format, and a selection of `count` cans of one drink. */
async function setUp(discount?: BundleDiscount) {
    const loaded = await load();
    const bundle: BundleDetail = discount ? { ...loaded.bundle, discount } : loaded.bundle;
    const money = createMoneyFormatter(bundle, loaded.settings);
    const section = bundle.sections[0]!;
    const cans = (count: number): SectionSelections => (count > 0 ? { [section.id]: [{ variantId: section.products[0]!.variants[0]!.id, quantity: count }] } : {});
    const say = (count: number) => {
        const ladder = readLadder(bundle, count);
        return ladder ? ladderMessage(ladder, bundle, cans(count), DEFAULT_CONTENT, money) : null;
    };
    return { bundle, money, say };
}

function tiers(type: BundleDiscount['type'], list: [operation: string, value: number, discount: number, customText?: string | null][], operator: 'max' | 'cumulative' = 'max'): BundleDiscount {
    return {
        type,
        value: null,
        flatOrTiered: 'tiered',
        minimum: null,
        operator,
        tiers: list.map(([operation, value, discount, customText = null]) => ({
            type: 'total_products',
            operation: operation as 'gte',
            value: value.toFixed(2),
            discount: discount.toFixed(2),
            customText,
        })),
    };
}

describe('readLadder', () => {
    it('draws the rungs the SDK makes of the bundle\'s tiers: 6, 12 and 24 cans at 5, 10 and 15%', async () => {
        const { bundle } = await setUp();
        const ladder = readLadder(bundle, 0)!;
        expect(ladder.rungs.map((rung) => [rung.count, rung.discount])).toEqual([
            [6, 5],
            [12, 10],
            [24, 15],
        ]);
        expect(ladder).toMatchObject({ type: 'percentage', count: 0, current: null, missing: 6, discount: null });
        expect(ladder.next?.count).toBe(6);
    });

    it('climbs: what is in force, what is next, how many more', async () => {
        const { bundle } = await setUp();
        expect(readLadder(bundle, 7)).toMatchObject({ discount: 5, missing: 5 });
        expect(readLadder(bundle, 12)).toMatchObject({ discount: 10, missing: 12 });
        const top = readLadder(bundle, 24)!;
        expect(top).toMatchObject({ next: null, discount: 15, missing: 0 });
        expect(top.current?.count).toBe(24);
    });

    it('moves when the merchant changes the tiers in Kitenzo (nothing is hardcoded)', async () => {
        const { bundle } = await setUp(tiers('percentage', [['gte', 10, 12]]));
        const ladder = readLadder(bundle, 4)!;
        expect(ladder.rungs.map((rung) => rung.count)).toEqual([10]);
        expect(ladder.missing).toBe(6);
    });

    it('draws only rungs a shopper steps up to: not the count where an "exactly 12" tier stops', async () => {
        const { bundle } = await setUp(
            tiers('percentage', [
                ['gt', 5, 5],
                ['eq', 12, 10],
            ]),
        );
        expect(readLadder(bundle, 0)!.rungs.map((rung) => [rung.count, rung.discount])).toEqual([
            [6, 5],
            [12, 10],
        ]);
    });

    it('has no ladder for a flat discount, no discount, or a tier worth nothing', async () => {
        const flat = await setUp({ type: 'percentage', value: '10.00', flatOrTiered: 'flat', tiers: [] });
        expect(readLadder(flat.bundle, 3)).toBeNull();
        expect(readLadder({ ...flat.bundle, discount: null }, 3)).toBeNull();
        const nothing = await setUp(tiers('percentage', [['gte', 6, 0]]));
        expect(readLadder(nothing.bundle, 3)).toBeNull();
    });
});

describe('ladderNotes', () => {
    const notes = (bundle: BundleDetail) => ladderNotes(bundle, ladderRungs(bundle));

    it('has nothing to say when every tier is a rung, or the bundle has no tiers at all', async () => {
        const { bundle } = await setUp();
        expect(notes(bundle)).toEqual([]);
        const flat = await setUp({ type: 'percentage', value: '10.00', flatOrTiered: 'flat', tiers: [] });
        expect(notes(flat.bundle)).toEqual([]);
        expect(notes({ ...flat.bundle, discount: null })).toEqual([]);
    });

    it('names each tier the ladder leaves out, one sentence each, in the merchant\'s order', async () => {
        const base = tiers('percentage', [
            ['gte', 6, 5],
            ['gte', 30, 20],
            ['eq', 12, 10],
            ['gte', 18, 0],
        ]);
        const { bundle } = await setUp({
            ...base,
            tiers: [...base.tiers!, { type: 'total_price', operation: 'gte', value: '150.00', discount: '20.00', customText: null }, { type: 'bulk_buy', operation: 'gte', value: '4.00', discount: '20.00', customText: null }],
        });
        expect(ladderRungs(bundle).map((rung) => rung.count)).toEqual([6, 12]);
        expect(notes(bundle)).toEqual([
            'The tier for at least 30 cans is not on the ladder: it is not a step up from the tiers around it, or no shopper can reach it within the case\'s limits. Checkout still applies it.',
            'The tier for at least 18 cans is not on the ladder: it is not a step up from the tiers around it, or no shopper can reach it within the case\'s limits. Checkout still applies it.',
            'A tier on the case\'s value cannot be drawn as a count of cans, so the ladder leaves it out. Checkout still applies it.',
            'A tier on one drink\'s quantity cannot be drawn as a count of cans, so the ladder leaves it out. Checkout still applies it.',
        ]);
    });
});

describe('ladderMessage', () => {
    it('speaks in the theme\'s words when the next tier has no customText', async () => {
        const { say } = await setUp();
        expect(say(0)).toEqual({ text: 'Add 6 more to unlock 5% off', custom: false });
        expect(say(5)).toEqual({ text: 'Add 1 more to unlock 5% off', custom: false });
    });

    it('speaks the NEXT tier\'s customText, as the SDK fills it', async () => {
        const { say } = await setUp();
        expect(say(7)).toEqual({ text: '5 more cans and the whole case is 10% off.', custom: true });
        expect(say(12)).toEqual({ text: 'Go big: 12 more for 15% off. You are on 10% now.', custom: true });
    });

    it('celebrates the top tier in the theme\'s words', async () => {
        const { say } = await setUp();
        expect(say(24)).toEqual({ text: 'Top tier unlocked: 15% off the whole case', custom: false });
    });

    it('treats a blank customText as none', async () => {
        const { say } = await setUp(tiers('percentage', [['gte', 6, 5, '   ']]));
        expect(say(2)).toEqual({ text: 'Add 4 more to unlock 5% off', custom: false });
    });

    it('promises the combined discount when the bundle adds its tiers up ("cumulative")', async () => {
        const { say } = await setUp(tiers('percentage', [['gte', 6, 5], ['gte', 12, 5]], 'cumulative'));
        expect(say(6)?.text).toBe('Add 6 more to unlock 10% off');
        expect(say(12)?.text).toBe('Top tier unlocked: 10% off the whole case');
    });

    it('at an "exactly 12" tier there is nothing higher to promise, so the top copy speaks', async () => {
        const { say } = await setUp(
            tiers('percentage', [
                ['gt', 5, 5],
                ['eq', 12, 10],
            ]),
        );
        expect(say(12)).toEqual({ text: text(DEFAULT_CONTENT, 'tierMax', { discount: '10% off' }), custom: false });
    });

    it('formats money tiers as money, in both the theme\'s copy and the merchant\'s', async () => {
        const { say } = await setUp(tiers('fixed', [['gte', 6, 5], ['gte', 12, 8, 'Only {{ amount }} to go for {{ discount }} off (now {{ currentDiscount }})']]));
        expect(say(2)?.text).toBe('Add 4 more to unlock £5.00 off');
        expect(say(6)?.text).toBe('Only 6 to go for £8.00 off (now £5.00)');
    });
});

describe('discountLabel', () => {
    it('words each kind of discount from the theme\'s copy', async () => {
        const { money } = await setUp();
        expect(discountLabel(DEFAULT_CONTENT, 'percentage', 7.5, money)).toBe('7.5% off');
        expect(discountLabel(DEFAULT_CONTENT, 'fixed', 5, money)).toBe('£5.00 off');
        expect(discountLabel(DEFAULT_CONTENT, 'price', 40, money)).toBe('£40.00 a case');
    });

    it('converts a money discount, which is stored in the shop\'s currency, for the shopper\'s market', () => {
        const euros = { format: (amount: number | string) => `€${Number(amount).toFixed(2)}`, fromShopCurrency: (amount: number | string) => Number(amount) * 1.2 };
        expect(discountLabel(DEFAULT_CONTENT, 'fixed', 5, euros)).toBe('€6.00 off');
    });
});
