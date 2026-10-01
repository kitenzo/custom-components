import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { planFill, seededRandom, type FillCandidate } from '../src/autofill';
import { toViewModel } from '../src/model';
import { fillCandidates, quantitiesOf } from '../src/selection';
import { load } from './support';

const unlimited = (variantId: string, inBox = 0): FillCandidate => ({ variantId, inBox, room: Number.POSITIVE_INFINITY });

describe('seededRandom', () => {
    it('repeats for a seed and differs between seeds', () => {
        const a = seededRandom(42);
        const b = seededRandom(42);
        const first = [a(), a(), a()];
        expect([b(), b(), b()]).toEqual(first);
        expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
        expect(seededRandom(43)()).not.toBe(first[0]);
    });
});

describe('planFill', () => {
    it('with a fixed seed, plans the same box every time', () => {
        const candidates = ['a', 'b', 'c', 'd'].map((id) => unlimited(id));
        const plan = planFill(candidates, 6, seededRandom(7));
        expect(plan).toEqual({ picks: ['a', 'b', 'd', 'c', 'c', 'b'], unfilled: 0 });
        expect(planFill(candidates, 6, seededRandom(7))).toEqual(plan);
    });

    it('fills only the empty slots and spreads them, fewest-in-the-box first', () => {
        const plan = planFill([unlimited('a', 3), unlimited('b', 0), unlimited('c', 1)], 3, seededRandom(1));
        expect(plan.picks).toHaveLength(3);
        // b (none in the box) first; then b and c tie at 1; never a, which already has 3.
        expect(plan.picks[0]).toBe('b');
        expect(plan.picks).not.toContain('a');
    });

    it('skips sold-out and capped flavours, and never takes one past its stock', () => {
        const plan = planFill(
            [
                { variantId: 'sold-out', inBox: 0, room: 0 },
                { variantId: 'capped', inBox: 4, room: 0 },
                { variantId: 'two-left', inBox: 0, room: 2 },
                unlimited('plenty'),
            ],
            8,
            seededRandom(3),
        );
        expect(plan.picks).not.toContain('sold-out');
        expect(plan.picks).not.toContain('capped');
        expect(plan.picks.filter((id) => id === 'two-left')).toHaveLength(2);
        expect(plan.picks.filter((id) => id === 'plenty')).toHaveLength(6);
    });

    it('says how many slots it could not fill when stock runs out first', () => {
        expect(planFill([{ variantId: 'a', inBox: 0, room: 2 }], 5, seededRandom(1))).toEqual({ picks: ['a', 'a'], unfilled: 3 });
        expect(planFill([], 5, seededRandom(1))).toEqual({ picks: [], unfilled: 5 });
    });

    it('stops at the iteration cap however much is asked for', () => {
        expect(planFill([unlimited('a')], 1_000_000, seededRandom(1), 50).picks).toHaveLength(50);
    });

    it('plans a box of 12 the builder accepts: no lavender, rose within its 4, the SDK satisfied', async () => {
        const { bundle, settings } = await load();
        const model = toViewModel(bundle, { settings });
        const box = model.sections[0]!;
        const id = (handle: string) => box.products.find((product) => product.handle === handle)!.variants[0]!.id;
        const builder = createBundleBuilder(model.bundle);
        builder.addItem(box.id, id('rose-macaron'), 3);
        builder.addItem(box.id, id('vanilla-macaron'), 2);

        const plan = planFill(fillCandidates(box, builder.getState().selections), 12 - 5, seededRandom(2001));
        for (const variantId of plan.picks) builder.addItem(box.id, variantId, 1);

        const totals = quantitiesOf(builder.getState().selections);
        expect(plan.unfilled).toBe(0);
        expect(totals.get(id('lavender-macaron'))).toBeUndefined();
        expect(totals.get(id('rose-macaron')) ?? 0).toBeLessThanOrEqual(4);
        // What was there before the fill is still there.
        expect(totals.get(id('vanilla-macaron'))).toBeGreaterThanOrEqual(2);
        expect([...totals.values()].reduce((sum, value) => sum + value, 0)).toBe(12);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});
