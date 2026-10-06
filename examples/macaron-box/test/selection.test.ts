import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { blockedInBox, isStepDone, isStepFinished, missingPicks, pickedCount } from '../src/selection';
import { load, withRequired } from './support';
import type { Fixture } from '../dev/mock/wire';

type Rule = Fixture['bundle']['limitRules'][number];
const count = (operation: Rule['operation'], value: number, sectionId: number | null): Rule => ({ operation, sectionId, type: 'total-number-of-products', value: value.toFixed(2) });

/** The demo box, optionally with its limit rules replaced; `rules` is given the step's id. */
async function setUp(rules?: (box: number) => Rule[], change: (fixture: Fixture) => Fixture = (fixture) => fixture) {
    const { bundle, settings } = await load((fixture) => {
        const changed = change(fixture);
        return rules ? { ...changed, bundle: { ...changed.bundle, limitRules: rules(changed.bundle.sections[0]!.id) } } : changed;
    });
    const model = toViewModel(bundle, settings);
    const box = model.sections[0]!;
    const builder = createBundleBuilder(bundle);
    const add = (quantity: number) => builder.addItem(box.id, box.products[0]!.variants[0]!.id, quantity);
    return { model, box, add, progress: () => builder.getState().progress };
}

describe('blockedInBox', () => {
    it('holds the shopper at the box they chose, and only when the SDK would take one more', () => {
        // A box of 6 holding 6 is full to the shopper. To the SDK the step takes 24.
        expect(blockedInBox(null, 6, 6)).toBe('box-full');
        expect(blockedInBox(null, 5, 6)).toBeNull();
        expect(blockedInBox(null, 6, 12)).toBeNull();
        // No box chosen (or a bundle with no sizes): the SDK's answer stands.
        expect(blockedInBox(null, 6, null)).toBeNull();
        // The SDK's reason comes first: a bigger box will not restock a flavour.
        expect(blockedInBox('sold-out', 6, 6)).toBe('sold-out');
        expect(blockedInBox('section-full', 24, 24)).toBe('section-full');
    });
});

describe('missingPicks', () => {
    it('counts up to the next box: 5 more after the first, none at 6, 5 more at 7', async () => {
        const { model, box, add, progress } = await setUp();
        add(1);
        expect(missingPicks(model.sections, progress())).toEqual([{ section: box, count: 5 }]);
        add(5);
        expect(missingPicks(model.sections, progress())).toEqual([]);
        // Seven is inside the 6 to 24 window and is no box.
        add(1);
        expect(missingPicks(model.sections, progress())).toEqual([{ section: box, count: 5 }]);
    });

    it('names the step that is short, then the bundle-wide count', async () => {
        const { model, box, add, progress } = await setUp((id) => [count('gte', 2, id), count('gte', 5, null)]);
        expect(missingPicks(model.sections, progress())).toEqual([
            { section: box, count: 2 },
            { section: null, count: 5 },
        ]);
        add(2);
        expect(missingPicks(model.sections, progress())).toEqual([{ section: null, count: 3 }]);
    });

    it('asks for nothing from a step the page does not show', async () => {
        const { progress } = await setUp();
        expect(missingPicks([], progress())).toEqual([]);
    });
});

describe('pickedCount', () => {
    it('counts the shopper\'s picks, not the product every box includes', async () => {
        const { add, progress } = await setUp(undefined, (fixture) => withRequired(fixture, 'english-toffee'));
        expect(progress().quantity).toBe(1);
        expect(pickedCount(progress())).toBe(0);
        add(2);
        expect(pickedCount(progress())).toBe(2);
    });
});

describe('isStepDone', () => {
    it('marks the "6, 12 or 24" step done on those counts only: 7 is past the minimum and still short', async () => {
        const { box, add, progress } = await setUp();
        expect(isStepDone(box, progress())).toBe(false);
        add(6);
        expect(isStepDone(box, progress())).toBe(true);
        add(1);
        expect(progress().sections[box.id]!.quantity).toBe(7);
        expect(isStepDone(box, progress())).toBe(false);
        add(5);
        expect(isStepDone(box, progress())).toBe(true);
    });

    it('never marks an untouched step done, even an optional one that owes nothing', async () => {
        const { box, add, progress } = await setUp((id) => [count('lte', 2, id)]);
        expect(progress().sections[box.id]!.missing).toBe(0);
        expect(isStepDone(box, progress())).toBe(false);
        add(1);
        expect(isStepDone(box, progress())).toBe(true);
    });
});

describe('isStepFinished', () => {
    it('finishes a step with a ceiling only when it is full', async () => {
        const { box, add, progress } = await setUp((id) => [count('gte', 3, id), count('lte', 6, id)]);
        add(3);
        expect(isStepDone(box, progress())).toBe(true);
        expect(isStepFinished(box, progress())).toBe(false);
        add(3);
        expect(isStepFinished(box, progress())).toBe(true);
    });

    it('finishes a step with no ceiling once its minimum is met, and an optional one never', async () => {
        const required = await setUp((id) => [count('gte', 2, id)]);
        required.add(1);
        expect(isStepFinished(required.box, required.progress())).toBe(false);
        required.add(1);
        expect(isStepFinished(required.box, required.progress())).toBe(true);

        const optional = await setUp(() => []);
        optional.add(2);
        expect(isStepFinished(optional.box, optional.progress())).toBe(false);
    });
});
