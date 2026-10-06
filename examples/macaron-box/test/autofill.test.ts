import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { planFill, seededRandom } from '../src/autofill';
import { toViewModel } from '../src/model';
import type { Fixture } from '../dev/mock/wire';
import { load } from './support';

async function setUp(change?: (fixture: Fixture) => Fixture, bundleId?: number) {
    const { bundle, settings } = await load(change, {}, bundleId);
    const box = toViewModel(bundle, settings).sections[0]!;
    const id = (handle: string) => box.products.find((product) => product.handle === handle)!.variants[0]!.id;
    const handleOf = (variantId: string) => box.byVariantId.get(variantId)!.product.handle;
    return { bundle, box, id, handleOf, all: [...box.byVariantId.keys()] };
}

const count = (picks: string[], variantId: string) => picks.filter((pick) => pick === variantId).length;

const atMostTwoOfEach = (fixture: Fixture): Fixture => ({
    ...fixture,
    bundle: { ...fixture.bundle, limitRules: [...fixture.bundle.limitRules, { operation: 'lte', sectionId: null, type: 'amount-of-one-product', value: '2.00' }] },
});

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
    it('with a fixed seed, plans the same box every time', async () => {
        const { bundle, box, id, handleOf } = await setUp();
        const four = ['vanilla-macaron', 'chocolate-macaron', 'pistachio-macaron', 'lemon-macaron'].map(id);
        const plan = planFill(bundle, {}, box.id, four, 6, seededRandom(7));
        expect(plan.map(handleOf)).toEqual(['pistachio-macaron', 'chocolate-macaron', 'lemon-macaron', 'vanilla-macaron', 'lemon-macaron', 'vanilla-macaron']);
        expect(planFill(bundle, {}, box.id, four, 6, seededRandom(7))).toEqual(plan);
        expect(planFill(bundle, {}, box.id, four, 6, seededRandom(8))).not.toEqual(plan);
    });

    it('fills only the empty slots and spreads them, fewest-in-the-box first', async () => {
        const { bundle, box, id } = await setUp();
        const [a, b, c] = ['vanilla-macaron', 'chocolate-macaron', 'pistachio-macaron'].map(id) as [string, string, string];
        const selections = { [box.id]: [{ variantId: a, quantity: 3 }, { variantId: c, quantity: 1 }] };
        const plan = planFill(bundle, selections, box.id, [a, b, c], 3, seededRandom(1));
        // b (none in the box) first; then b and c tie at 1 and get one each; never a, which already has 3.
        expect(plan[0]).toBe(b);
        expect([...plan].sort()).toEqual([b, b, c].sort());
    });

    it('plans only what the builder takes: nothing sold out, nothing past its stock', async () => {
        const { bundle, box, id } = await setUp();
        const lavender = id('lavender-macaron'); // sold out
        const rose = id('rose-macaron'); // stock 4
        const vanilla = id('vanilla-macaron');
        const selections = { [box.id]: [{ variantId: rose, quantity: 2 }] };
        const plan = planFill(bundle, selections, box.id, [lavender, rose, vanilla], 8, seededRandom(3));
        expect(plan).toHaveLength(8);
        expect(count(plan, lavender)).toBe(0);
        expect(count(plan, rose)).toBe(2);
        expect(count(plan, vanilla)).toBe(6);
    });

    it('keeps to a rule it knows nothing about: "at most 2 of each flavour"', async () => {
        const { bundle, box, all } = await setUp(atMostTwoOfEach);
        const plan = planFill(bundle, {}, box.id, all, 24, seededRandom(5));
        // Nine flavours can be bought, two of each, so six slots stay empty.
        expect(plan).toHaveLength(18);
        expect(Math.max(...all.map((variantId) => count(plan, variantId)))).toBe(2);
    });

    it('comes up short, and stops, when nothing more will go in', async () => {
        const { bundle, box, id } = await setUp();
        const rose = id('rose-macaron');
        expect(planFill(bundle, {}, box.id, [rose], 6, seededRandom(1))).toEqual([rose, rose, rose, rose]);
        expect(planFill(bundle, {}, box.id, [], 5, seededRandom(1))).toEqual([]);
        // The largest box is the most the step takes, however much is asked for.
        expect(planFill(bundle, {}, box.id, [id('vanilla-macaron')], 1_000_000, seededRandom(1))).toHaveLength(24);
    });

    it('stops at the chosen box, which the builder knows nothing of: 7 for a box of 12 holding 5', async () => {
        const { bundle, box, id, all } = await setUp();
        const selections = { [box.id]: [{ variantId: id('vanilla-macaron'), quantity: 5 }] };
        expect(planFill(bundle, selections, box.id, all, 7, seededRandom(11))).toHaveLength(7);
    });

    it.each([
        ['the demo box', undefined],
        ['a box of at most 2 of each flavour', atMostTwoOfEach],
    ])('plans only macarons the shopper\'s own builder takes, one by one: %s', async (_name, change) => {
        const { bundle, box, id, all } = await setUp(change);
        const builder = createBundleBuilder(bundle);
        builder.addItem(box.id, id('rose-macaron'), 2);
        builder.addItem(box.id, id('vanilla-macaron'), 2);
        const before = builder.getState().selections;

        const plan = planFill(bundle, before, box.id, all, 12 - 4, seededRandom(2001));
        expect(plan).toHaveLength(8);
        // Planning leaves the selection it was given alone.
        expect(builder.getState().selections).toBe(before);
        expect(plan.map((variantId) => builder.addItem(box.id, variantId, 1))).toEqual(plan.map(() => 1));

        const quantity = (handle: string) => builder.getState().selections[box.id]!.find((pick) => pick.variantId === id(handle))?.quantity ?? 0;
        expect(quantity('lavender-macaron')).toBe(0);
        expect(quantity('rose-macaron')).toBeLessThanOrEqual(4);
        // What was there before the fill is still there.
        expect(quantity('vanilla-macaron')).toBeGreaterThanOrEqual(2);
        expect(builder.getSectionQuantity(box.id)).toBe(12);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});
