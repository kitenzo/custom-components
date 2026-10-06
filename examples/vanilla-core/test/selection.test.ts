import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { isStepDone, isStepFinished, missingPicks, pickedCount } from '../src/selection';
import { countRule, load, withRequired, withTwoSteps } from './support';

type Change = NonNullable<Parameters<typeof load>[0]>;
type Rules = Parameters<typeof withTwoSteps>[1];

async function setUp(change: Change = (fixture) => fixture) {
    const { bundle, settings } = await load(change);
    const model = toViewModel(bundle, settings);
    const [wines, cellar] = model.sections as [(typeof model.sections)[number], (typeof model.sections)[number]];
    const builder = createBundleBuilder(bundle);
    const add = (section: typeof wines, quantity: number) => builder.addItem(section.id, section.products[0]!.variants[0]!.id, quantity);
    return { model, wines, cellar, add, progress: () => builder.getState().progress };
}

/** The case as two steps: 3 to 6 wines, then up to 2 for the cellar, unless `rules` says otherwise. */
const twoSteps = (rules: Rules = (first, second) => [countRule('gte', 3, first), countRule('lte', 6, first), countRule('lte', 2, second)]) =>
    setUp((fixture) => withTwoSteps(fixture, rules));

describe('missingPicks', () => {
    it('names each step that is short in page order, then the bundle-wide count, and ignores an optional step', async () => {
        const { model, wines, cellar, add, progress } = await twoSteps((first, second) => [countRule('gte', 2, first), countRule('gte', 1, second), countRule('gte', 5, null)]);
        expect(missingPicks(model.sections, progress())).toEqual([
            { section: wines, count: 2 },
            { section: cellar, count: 1 },
            { section: null, count: 5 },
        ]);
        add(wines, 2);
        expect(missingPicks(model.sections, progress())).toEqual([
            { section: cellar, count: 1 },
            { section: null, count: 3 },
        ]);

        const plain = await twoSteps();
        expect(missingPicks(plain.model.sections, plain.progress())).toEqual([{ section: plain.wines, count: 3 }]);
    });

    it('asks for nothing from a step the page does not show', async () => {
        const { model, progress } = await twoSteps();
        expect(missingPicks(model.sections.slice(1), progress())).toEqual([]);
    });
});

describe('pickedCount', () => {
    it('counts the shopper\'s picks, not the bottle every case includes', async () => {
        const { wines, add, progress } = await setUp((fixture) => withRequired(fixture, 'pinot-gris'));
        expect(pickedCount(progress())).toBe(0);
        add(wines, 2);
        expect(pickedCount(progress())).toBe(2);
    });
});

describe('isStepDone', () => {
    it('marks a "6, 12 or 24" step done on those counts only: 7 is past the minimum and still short', async () => {
        const { wines, add, progress } = await setUp((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, limitRules: [6, 12, 24].map((size) => countRule('eq', size, fixture.bundle.sections[0]!.id)) },
        }));
        add(wines, 6);
        expect(isStepDone(wines, progress())).toBe(true);
        add(wines, 1);
        expect(progress().sections[wines.id]!.quantity).toBe(7);
        expect(isStepDone(wines, progress())).toBe(false);
        add(wines, 5);
        expect(isStepDone(wines, progress())).toBe(true);
    });

    it('never marks an untouched step done, even an optional one that owes nothing', async () => {
        const { cellar, add, progress } = await twoSteps();
        expect(isStepDone(cellar, progress())).toBe(false);
        add(cellar, 1);
        expect(isStepDone(cellar, progress())).toBe(true);
    });
});

describe('isStepFinished', () => {
    it('finishes a step with a ceiling only when it is full', async () => {
        const { wines, add, progress } = await twoSteps();
        add(wines, 3);
        expect(isStepDone(wines, progress())).toBe(true);
        expect(isStepFinished(wines, progress())).toBe(false);
        add(wines, 3);
        expect(isStepFinished(wines, progress())).toBe(true);
    });

    it('finishes a step with no ceiling once its minimum is met, and an optional one never', async () => {
        const { wines, cellar, add, progress } = await twoSteps((first) => [countRule('gte', 2, first)]);
        add(wines, 1);
        expect(isStepFinished(wines, progress())).toBe(false);
        add(wines, 1);
        expect(isStepFinished(wines, progress())).toBe(true);
        add(cellar, 2);
        expect(isStepFinished(cellar, progress())).toBe(false);
    });
});
