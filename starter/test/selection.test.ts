import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { isStepDone, isStepFinished, missingPicks, pickedCount } from '../src/selection';
import { load } from './support';
import type { Fixture } from '../dev/mock/wire';

type Rule = Fixture['bundle']['limitRules'][number];
const count = (operation: Rule['operation'], value: number, sectionId: number | null): Rule => ({ operation, sectionId, type: 'total-number-of-products', value: value.toFixed(2) });

/** The demo bundle with its limit rules replaced; `rules` is given the two steps' ids. */
async function setUp(rules?: (smoothies: number, shots: number) => Rule[]) {
    const { bundle, settings } = await load((fixture) =>
        rules ? { ...fixture, bundle: { ...fixture.bundle, limitRules: rules(fixture.bundle.sections[0]!.id, fixture.bundle.sections[1]!.id) } } : fixture,
    );
    const model = toViewModel(bundle, settings);
    const [smoothies, shots] = model.sections as [(typeof model.sections)[number], (typeof model.sections)[number]];
    const builder = createBundleBuilder(bundle);
    const add = (section: typeof smoothies, quantity: number) => builder.addItem(section.id, section.products[0]!.variants[0]!.id, quantity);
    return { model, smoothies, shots, add, progress: () => builder.getState().progress };
}

describe('missingPicks', () => {
    it('names each step that is short in page order, then the bundle-wide count, and ignores an optional step', async () => {
        const { model, smoothies, shots, add, progress } = await setUp((first, second) => [count('gte', 2, first), count('gte', 1, second), count('gte', 5, null)]);
        expect(missingPicks(model.sections, progress())).toEqual([
            { section: smoothies, count: 2 },
            { section: shots, count: 1 },
            { section: null, count: 4 },
        ]);
        add(smoothies, 2);
        expect(missingPicks(model.sections, progress())).toEqual([
            { section: shots, count: 1 },
            { section: null, count: 2 },
        ]);

        const plain = await setUp();
        expect(missingPicks(plain.model.sections, plain.progress())).toEqual([{ section: plain.smoothies, count: 3 }]);
    });

    it('asks for nothing from a step the page does not show', async () => {
        const { model, progress } = await setUp();
        expect(missingPicks(model.sections.slice(1), progress())).toEqual([]);
    });
});

describe('pickedCount', () => {
    it('counts the shopper\'s picks, not the product every bundle includes', async () => {
        const { smoothies, add, progress } = await setUp();
        expect(pickedCount(progress())).toBe(0);
        add(smoothies, 2);
        expect(pickedCount(progress())).toBe(2);
    });
});

describe('isStepDone', () => {
    it('marks a "6, 12 or 24" step done on those counts only: 7 is past the minimum and still short', async () => {
        const { smoothies, add, progress } = await setUp((first) => [count('eq', 6, first), count('eq', 12, first), count('eq', 24, first)]);
        add(smoothies, 6);
        expect(isStepDone(smoothies, progress())).toBe(true);
        add(smoothies, 1);
        expect(progress().sections[smoothies.id]!.quantity).toBe(7);
        expect(isStepDone(smoothies, progress())).toBe(false);
        add(smoothies, 5);
        expect(isStepDone(smoothies, progress())).toBe(true);
    });

    it('never marks an untouched step done, even an optional one that owes nothing', async () => {
        const { shots, add, progress } = await setUp();
        expect(isStepDone(shots, progress())).toBe(false);
        add(shots, 1);
        expect(isStepDone(shots, progress())).toBe(true);
    });
});

describe('isStepFinished', () => {
    it('finishes a step with a ceiling only when it is full', async () => {
        const { smoothies, add, progress } = await setUp();
        add(smoothies, 3);
        expect(isStepDone(smoothies, progress())).toBe(true);
        expect(isStepFinished(smoothies, progress())).toBe(false);
        add(smoothies, 3);
        expect(isStepFinished(smoothies, progress())).toBe(true);
    });

    it('finishes a step with no ceiling once its minimum is met, and an optional one never', async () => {
        const { smoothies, shots, add, progress } = await setUp((first) => [count('gte', 2, first)]);
        add(smoothies, 1);
        expect(isStepFinished(smoothies, progress())).toBe(false);
        add(smoothies, 1);
        expect(isStepFinished(smoothies, progress())).toBe(true);
        add(shots, 2);
        expect(isStepFinished(shots, progress())).toBe(false);
    });
});
