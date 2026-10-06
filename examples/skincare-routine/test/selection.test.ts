import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { isSingleChoice, isStepDone, isStepFinished, missingPicks, nearestShownStep, nextShownStep, pickedCount } from '../src/selection';
import { asRequired, load } from './support';
import type { Fixture } from '../dev/mock/wire';

type Rule = Fixture['bundle']['limitRules'][number];
const count = (operation: Rule['operation'], value: number, sectionId: number | null): Rule => ({ operation, sectionId, type: 'total-number-of-products', value: value.toFixed(2) });

/** The demo routine, or the same steps under other count rules; `rules` is given the three steps' ids. */
async function setUp(rules?: (cleanse: number, treat: number, moisturise: number) => Rule[]) {
    const { bundle, settings } = await load((fixture) => {
        const [first, second, third] = fixture.bundle.sections.map((section) => section.id) as [number, number, number];
        return rules ? { ...fixture, bundle: { ...fixture.bundle, limitRules: rules(first, second, third) } } : fixture;
    });
    const model = toViewModel(bundle, settings);
    const [cleanse, treat, moisturise] = model.sections as [(typeof model.sections)[number], (typeof model.sections)[number], (typeof model.sections)[number]];
    const builder = createBundleBuilder(bundle);
    /** One of each of the step's first `products` products, so no stock or per-product cap is in the way. */
    const add = (section: typeof cleanse, products: number) => {
        const free = section.products.filter((product) => !product.soldOut && !product.variants.some((variant) => (builder.getState().selections[section.id] ?? []).some((pick) => pick.variantId === variant.id)));
        for (const product of free.slice(0, products)) builder.addItem(section.id, product.variants.find((variant) => variant.available)!.id, 1);
    };
    return { bundle, model, cleanse, treat, moisturise, add, progress: () => builder.getState().progress };
}

describe('isSingleChoice', () => {
    it('reads a step that holds one product at most as a choice, and any other as a count', async () => {
        const routine = await setUp();
        expect(routine.model.sections.every(isSingleChoice)).toBe(true);
        const { cleanse, treat, moisturise } = await setUp((first, second) => [count('eq', 2, first), count('lte', 1, second)]);
        expect([cleanse, treat, moisturise].map(isSingleChoice)).toEqual([false, true, false]);
    });
});

describe('missingPicks', () => {
    it('names each step that is short in page order, then the bundle-wide count, and ignores an optional step', async () => {
        const { model, cleanse, treat, moisturise, add, progress } = await setUp();
        add(cleanse, 1);
        expect(missingPicks(model.sections, progress())).toEqual([
            { section: treat, count: 1 },
            { section: moisturise, count: 1 },
        ]);

        const wide = await setUp((first) => [count('gte', 1, first), count('gte', 4, null)]);
        expect(missingPicks(wide.model.sections, wide.progress())).toEqual([
            { section: wide.cleanse, count: 1 },
            { section: null, count: 4 },
        ]);
    });

    it('asks for nothing from a step the page does not show', async () => {
        const { model, add, cleanse, progress } = await setUp();
        add(cleanse, 1);
        expect(missingPicks(model.sections.slice(0, 1), progress())).toEqual([]);
    });
});

describe('pickedCount', () => {
    it('counts the shopper\'s picks, not a product every routine includes', async () => {
        const { bundle } = await load((fixture) => asRequired(fixture, 'ceramide-peptide-daily-moisturiser'));
        const builder = createBundleBuilder(bundle);
        const cleanse = bundle.sections[0]!;
        expect(builder.getState().progress.quantity).toBe(1);
        expect(pickedCount(builder.getState().progress)).toBe(0);
        builder.addItem(cleanse.id, cleanse.products[0]!.variants.find((variant) => variant.available)!.id, 1);
        expect(pickedCount(builder.getState().progress)).toBe(1);
    });
});

describe('isStepDone', () => {
    it('marks a "2 or 4" step done on those counts only: 3 is past the minimum and still short', async () => {
        const { cleanse, add, progress } = await setUp((first) => [count('eq', 2, first), count('eq', 4, first)]);
        add(cleanse, 2);
        expect(isStepDone(cleanse, progress())).toBe(true);
        add(cleanse, 1);
        expect(progress().sections[cleanse.id]!.quantity).toBe(3);
        expect(isStepDone(cleanse, progress())).toBe(false);
        add(cleanse, 1);
        expect(isStepDone(cleanse, progress())).toBe(true);
    });

    it('never marks an untouched step done, even an optional one that owes nothing', async () => {
        const { moisturise, add, progress } = await setUp((first, second) => [count('eq', 1, first), count('eq', 1, second)]);
        expect(progress().sections[moisturise.id]!.missing).toBe(0);
        expect(isStepDone(moisturise, progress())).toBe(false);
        add(moisturise, 1);
        expect(isStepDone(moisturise, progress())).toBe(true);
    });
});

describe('isStepFinished', () => {
    it('finishes a one-pick step with its pick, and a step with a higher ceiling only when it is full', async () => {
        const routine = await setUp();
        expect(isStepFinished(routine.cleanse, routine.progress())).toBe(false);
        routine.add(routine.cleanse, 1);
        expect(isStepFinished(routine.cleanse, routine.progress())).toBe(true);

        const { cleanse, add, progress } = await setUp((first) => [count('gte', 1, first), count('lte', 3, first)]);
        add(cleanse, 1);
        expect(isStepDone(cleanse, progress())).toBe(true);
        expect(isStepFinished(cleanse, progress())).toBe(false);
        add(cleanse, 2);
        expect(isStepFinished(cleanse, progress())).toBe(true);
    });

    it('finishes a step with no ceiling once its minimum is met, and an optional one never', async () => {
        const { cleanse, treat, add, progress } = await setUp((first) => [count('gte', 2, first)]);
        add(cleanse, 1);
        expect(isStepFinished(cleanse, progress())).toBe(false);
        add(cleanse, 1);
        expect(isStepFinished(cleanse, progress())).toBe(true);
        add(treat, 2);
        expect(isStepFinished(treat, progress())).toBe(false);
    });
});

describe('the step the wizard moves to', () => {
    it('advances to the first step on screen after the pick\'s, past a step the pick has hidden', async () => {
        const { bundle, cleanse, treat, moisturise } = await setUp();
        const order = bundle.sections;
        expect(nextShownStep(order, [cleanse, treat, moisturise], cleanse.id)).toBe(treat);
        // The pick in Cleanse made a condition hide Treat: the wizard goes on to Moisturise.
        expect(nextShownStep(order, [cleanse, moisturise], cleanse.id)).toBe(moisturise);
        // A step that is itself off screen still has a next one.
        expect(nextShownStep(order, [cleanse, moisturise], treat.id)).toBe(moisturise);
        expect(nextShownStep(order, [cleanse, treat, moisturise], moisturise.id)).toBeNull();
        expect(nextShownStep(order, [cleanse], cleanse.id)).toBeNull();
        expect(nextShownStep(order, [cleanse, treat], 999)).toBeNull();
    });

    it('shows the builder\'s step, and when that step is hidden falls forward, never back to the first', async () => {
        const { bundle, cleanse, treat, moisturise } = await setUp();
        const order = bundle.sections;
        expect(nearestShownStep(order, [cleanse, treat, moisturise], treat.id)).toBe(treat);
        expect(nearestShownStep(order, [cleanse, moisturise], treat.id)).toBe(moisturise);
        // Nothing after it is on screen: the last step that is.
        expect(nearestShownStep(order, [cleanse, treat], moisturise.id)).toBe(treat);
        expect(nearestShownStep(order, [cleanse, treat, moisturise], undefined)).toBe(cleanse);
        expect(nearestShownStep(order, [], treat.id)).toBeNull();
    });
});
