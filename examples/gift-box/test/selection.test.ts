import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { choiceFor, isSingleChoice, isStepDone, isStepFinished, missingPicks, pickedCount } from '../src/selection';
import { load } from './support';
import type { Fixture } from '../dev/mock/wire';

type Rule = Fixture['bundle']['limitRules'][number];
const count = (operation: Rule['operation'], value: number, sectionId: number | null): Rule => ({ operation, sectionId, type: 'total-number-of-products', value: value.toFixed(2) });
/** One of each product, across the whole box. */
const onePerProduct: Rule = { operation: 'lte', sectionId: null, type: 'amount-of-one-product', value: '1.00' };

/** The demo bundle, its limit rules replaced when `rules` is given (it is handed the three steps' ids). */
async function setUp(rules?: (boxes: number, fill: number, cards: number, current: Rule[]) => Rule[]) {
    const { bundle, settings } = await load((fixture) => {
        const [boxes, fill, cards] = fixture.bundle.sections.map((section) => section.id) as [number, number, number];
        return rules ? { ...fixture, bundle: { ...fixture.bundle, limitRules: rules(boxes, fill, cards, fixture.bundle.limitRules) } } : fixture;
    });
    const model = toViewModel(bundle, settings);
    const [boxes, fill, cards] = model.sections as [(typeof model.sections)[number], (typeof model.sections)[number], (typeof model.sections)[number]];
    const builder = createBundleBuilder(bundle);
    const variant = (section: typeof fill, handle: string, title?: string) => {
        const product = section.products.find((entry) => entry.handle === handle)!;
        return title ? product.variants.find((entry) => entry.title === title)! : product.variants[0]!;
    };
    const add = (section: typeof fill, handle: string, quantity = 1) => builder.addItem(section.id, variant(section, handle).id, quantity);
    const state = () => builder.getState();
    return { model, boxes, fill, cards, builder, variant, add, state, progress: () => state().progress };
}

describe('missingPicks', () => {
    it('names each step that is short in page order, then the bundle-wide count, and ignores the optional card', async () => {
        const { model, boxes, fill, add, progress } = await setUp((_boxes, _fill, _cards, current) => [...current, count('gte', 5, null)]);
        expect(missingPicks(model.sections, progress())).toEqual([
            { section: boxes, count: 1 },
            { section: fill, count: 2 },
            { section: null, count: 5 },
        ]);
        add(boxes, 'keepsake-gift-box');
        add(fill, 'loose-leaf-tea-tin', 2);
        expect(missingPicks(model.sections, progress())).toEqual([{ section: null, count: 2 }]);
    });

    it('asks for nothing from a step the page does not show', async () => {
        const { model, fill, progress } = await setUp();
        expect(missingPicks(model.sections.slice(1), progress())).toEqual([{ section: fill, count: 2 }]);
        expect(missingPicks(model.sections.slice(2), progress())).toEqual([]);
    });
});

describe('pickedCount', () => {
    it('counts the shopper\'s picks, not the product every box includes', async () => {
        const { bundle, settings } = await load((fixture) => {
            const id = fixture.products.find((product) => product.handle === 'botanical-bath-soak')!.shopifyProductId;
            return { ...fixture, bundle: { ...fixture.bundle, requiredProducts: [{ quantity: 1, shopifyProductId: id, variantIds: [] }] } };
        });
        const boxes = toViewModel(bundle, settings).sections[0]!;
        const builder = createBundleBuilder(bundle);
        expect(pickedCount(builder.getState().progress)).toBe(0);
        builder.addItem(boxes.id, boxes.products[0]!.variants[0]!.id, 1);
        expect(builder.getState().progress.quantity).toBe(2);
        expect(pickedCount(builder.getState().progress)).toBe(1);
    });
});

describe('isStepDone', () => {
    it('marks a "2 or 4" step done on those counts only: 3 is past the minimum and still short', async () => {
        const { fill, add, progress } = await setUp((_boxes, second) => [count('eq', 2, second), count('eq', 4, second)]);
        add(fill, 'loose-leaf-tea-tin', 2);
        expect(isStepDone(fill, progress())).toBe(true);
        add(fill, 'loose-leaf-tea-tin', 1);
        expect(progress().sections[fill.id]!.quantity).toBe(3);
        expect(isStepDone(fill, progress())).toBe(false);
        add(fill, 'loose-leaf-tea-tin', 1);
        expect(isStepDone(fill, progress())).toBe(true);
    });

    it('never marks an untouched step done, even the optional card that owes nothing', async () => {
        const { cards, add, progress } = await setUp();
        expect(isStepDone(cards, progress())).toBe(false);
        add(cards, 'with-love-letterpress-card');
        expect(isStepDone(cards, progress())).toBe(true);
    });
});

describe('isStepFinished', () => {
    it('finishes a step with a ceiling only when it is full', async () => {
        const { fill, add, progress } = await setUp();
        add(fill, 'loose-leaf-tea-tin', 2);
        expect(isStepDone(fill, progress())).toBe(true);
        expect(isStepFinished(fill, progress())).toBe(false);
        add(fill, 'loose-leaf-tea-tin', 3);
        expect(isStepFinished(fill, progress())).toBe(true);
    });

    it('finishes a step with no ceiling once its minimum is met, and an optional one never', async () => {
        const { fill, cards, add, progress } = await setUp((_boxes, second) => [count('gte', 2, second)]);
        add(fill, 'loose-leaf-tea-tin', 1);
        expect(isStepFinished(fill, progress())).toBe(false);
        add(fill, 'loose-leaf-tea-tin', 1);
        expect(isStepFinished(fill, progress())).toBe(true);
        add(cards, 'with-love-letterpress-card', 2);
        expect(isStepFinished(cards, progress())).toBe(false);
    });
});

describe('a step that holds one', () => {
    it('is the box and the card, not the step that is filled', async () => {
        const { model } = await setUp();
        expect(model.sections.map(isSingleChoice)).toEqual([true, false, true]);
    });

    it('adds the first choice, and swaps the next one in instead of calling the step full', async () => {
        const { cards, builder, variant, add, state } = await setUp();
        const love = variant(cards, 'with-love-letterpress-card');
        const home = variant(cards, 'new-home-letterpress-card');
        expect(choiceFor(cards, state().selections, love.id, builder)).toEqual({ replaces: null, blocked: null });
        add(cards, 'with-love-letterpress-card');
        expect(choiceFor(cards, state().selections, home.id, builder)).toEqual({ replaces: love.id, blocked: null });
        // The card that is chosen replaces nothing: its button takes it back out.
        expect(choiceFor(cards, state().selections, love.id, builder).replaces).toBeNull();
    });

    it('swaps to another size of the chosen box under "one per product", where one more of it is refused', async () => {
        const { boxes, builder, variant, state } = await setUp((_boxes, _fill, _cards, current) => [...current, onePerProduct]);
        const petite = variant(boxes, 'keepsake-gift-box', 'Petite / Oat');
        const classic = variant(boxes, 'keepsake-gift-box', 'Classic / Oat');
        builder.addItem(boxes.id, petite.id, 1);
        expect(builder.blockedReason(boxes.id, classic.id)).toBe('product-limit');
        expect(choiceFor(boxes, state().selections, classic.id, builder)).toEqual({ replaces: petite.id, blocked: null });
    });

    it('still refuses a swap to something that cannot be bought, with the reason', async () => {
        const { boxes, cards, builder, variant, add, state } = await setUp();
        add(boxes, 'keepsake-gift-box');
        add(cards, 'with-love-letterpress-card');
        expect(choiceFor(boxes, state().selections, variant(boxes, 'keepsake-gift-box', 'Grand / Terracotta').id, builder).blocked).toBe('sold-out');
        expect(choiceFor(cards, state().selections, variant(cards, 'get-well-soon-letterpress-card').id, builder).blocked).toBe('sold-out');
    });

    it('asks about one more, never a swap, in a step that counts', async () => {
        const { fill, builder, variant, add, state } = await setUp();
        add(fill, 'hand-poured-soy-candle', 5);
        expect(choiceFor(fill, state().selections, variant(fill, 'loose-leaf-tea-tin').id, builder)).toEqual({ replaces: null, blocked: 'section-full' });
    });
});
