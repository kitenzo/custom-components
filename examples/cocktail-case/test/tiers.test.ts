import { describe, expect, it } from 'vitest';

import type { BundleDiscount } from '@kitenzo/core';

import { DEFAULT_CONTENT, fillTierText } from '../src/content';
import { ladderMessage, tierLadder } from '../src/tiers';
import { load } from './support';

const pounds = (amount: number) => `£${amount.toFixed(2)}`;
const say = (discount: BundleDiscount | null | undefined, count: number) => {
    const ladder = tierLadder(discount, count);
    return ladder ? ladderMessage(ladder, DEFAULT_CONTENT, pounds) : null;
};

/** The case's own discount, from the catalogue through the SDK client: never typed in here. */
async function caseDiscount() {
    const { bundle } = await load();
    return bundle.discount!;
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

describe('tierLadder', () => {
    it('reads the rungs from the bundle: 6, 12 and 24 cans at 5, 10 and 15%', async () => {
        const ladder = tierLadder(await caseDiscount(), 0)!;
        expect(ladder.rungs.map((rung) => [rung.threshold, rung.discount])).toEqual([
            [6, 5],
            [12, 10],
            [24, 15],
        ]);
        expect(ladder).toMatchObject({ current: null, remaining: 6, inForce: 0, progress: 0, skipped: 0 });
        expect(ladder.next?.threshold).toBe(6);
    });

    it('climbs: what is in force, what is next, how many more', async () => {
        const discount = await caseDiscount();
        expect(tierLadder(discount, 7)).toMatchObject({ inForce: 5, remaining: 5, progress: 7 / 24 });
        expect(tierLadder(discount, 12)).toMatchObject({ inForce: 10, remaining: 12 });
        const top = tierLadder(discount, 24)!;
        expect(top).toMatchObject({ next: null, inForce: 15, remaining: 0, progress: 1 });
        expect(top.current?.threshold).toBe(24);
    });

    it('moves when the merchant changes the tiers in Kitenzo (nothing is hardcoded)', () => {
        const ladder = tierLadder(tiers('percentage', [['gte', 10, 12]]), 4)!;
        expect(ladder.rungs.map((rung) => rung.threshold)).toEqual([10]);
        expect(ladder.remaining).toBe(6);
    });

    it('reads "more than 5" as a rung at 6, and leaves off tiers a count cannot climb', () => {
        const ladder = tierLadder(
            {
                ...tiers('percentage', [
                    ['gt', 5, 5],
                    ['eq', 12, 10],
                    ['lte', 3, 2],
                ]),
            },
            0,
        )!;
        expect(ladder.rungs.map((rung) => rung.threshold)).toEqual([6]);
        expect(ladder.skipped).toBe(2);
    });

    it('adds tiers up when the bundle combines them ("cumulative")', () => {
        const ladder = tierLadder(tiers('percentage', [['gte', 6, 5], ['gte', 12, 5]], 'cumulative'), 12)!;
        expect(ladder.rungs.map((rung) => rung.effective)).toEqual([5, 10]);
        expect(ladder.inForce).toBe(10);
    });

    it('has no ladder for a flat discount, no discount, or a tier worth nothing', async () => {
        expect(tierLadder(null, 3)).toBeNull();
        expect(tierLadder({ type: 'percentage', value: '10.00', flatOrTiered: 'flat', tiers: [] }, 3)).toBeNull();
        expect(tierLadder(tiers('percentage', [['gte', 6, 0]]), 3)).toBeNull();
    });
});

describe('ladderMessage', () => {
    it('speaks in the theme\'s words when the next tier has no customText', async () => {
        expect(say(await caseDiscount(), 0)).toEqual({ text: 'Add 6 more to unlock 5% off', custom: false });
        expect(say(await caseDiscount(), 5)).toEqual({ text: 'Add 1 more to unlock 5% off', custom: false });
    });

    it('speaks the NEXT tier\'s customText, with {{ amount }}, {{ discount }} and {{ currentDiscount }} filled', async () => {
        expect(say(await caseDiscount(), 7)).toEqual({ text: '5 more cans and the whole case is 10% off.', custom: true });
        expect(say(await caseDiscount(), 12)).toEqual({ text: 'Go big: 12 more for 15% off. You are on 10% now.', custom: true });
    });

    it('celebrates the top tier in the theme\'s words', async () => {
        expect(say(await caseDiscount(), 24)).toEqual({ text: 'Top tier unlocked: 15% off the whole case', custom: false });
    });

    it('treats a blank customText as none', () => {
        expect(say(tiers('percentage', [['gte', 6, 5, '   ']]), 2)).toEqual({ text: 'Add 4 more to unlock 5% off', custom: false });
    });

    it('formats money tiers as money, in both the theme\'s copy and the merchant\'s', () => {
        expect(say(tiers('fixed', [['gte', 6, 5]]), 2)?.text).toBe('Add 4 more to unlock £5.00 off');
        expect(say(tiers('fixed', [['gte', 6, 5], ['gte', 12, 8, 'Only {{ amount }} to go for {{ discount }} off (now {{ currentDiscount }})']]), 6)?.text).toBe(
            'Only 6 to go for £8.00 off (now £5.00)',
        );
    });
});

describe('fillTierText', () => {
    it('fills {{ name }} with any spacing, and leaves an unknown name visible', () => {
        expect(fillTierText('{{amount}} / {{  discount }} / {{ typo }}', { amount: 3, discount: 10 })).toBe('3 / 10 / {{ typo }}');
    });
});
