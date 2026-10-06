import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { isStepDone, isStepFinished, missingPicks, pickedCount } from '../src/selection';
import { load, withRequired } from './support';
import type { Fixture } from '../dev/mock/wire';

type Rule = Fixture['bundle']['limitRules'][number];
/** A count rule on the step ("Pick your cans"), on top of the case's own 6 to 24. */
const onStep = (operation: Rule['operation'], value: number): Rule => ({ operation, sectionId: 31, type: 'total-number-of-products', value: value.toFixed(2) });

async function setUp(change?: Parameters<typeof load>[0]) {
    const { bundle, settings } = await load(change);
    const model = toViewModel(bundle, settings);
    const cans = model.sections[0]!;
    const builder = createBundleBuilder(bundle);
    const add = (handle: string, quantity: number) => builder.addItem(cans.id, cans.products.find((product) => product.handle === handle)!.variants[0]!.id, quantity);
    return { model, cans, add, progress: () => builder.getState().progress };
}

const withStepRules = (...rules: Rule[]) => (fixture: Fixture): Fixture => ({ ...fixture, bundle: { ...fixture.bundle, limitRules: [...fixture.bundle.limitRules, ...rules] } });

describe('missingPicks', () => {
    it('counts what the case still needs bundle-wide, not per step', async () => {
        const { model, add, progress } = await setUp();
        add('passionfruit-mojito', 4);
        expect(missingPicks(model.sections, progress())).toEqual([{ section: null, count: 2 }]);
        add('pear-cardamom', 2);
        expect(missingPicks(model.sections, progress())).toEqual([]);
    });

    it('names a step that has a minimum of its own before the case, and asks nothing of a step the page does not show', async () => {
        const { model, cans, progress } = await setUp(withStepRules(onStep('gte', 2)));
        expect(missingPicks(model.sections, progress())).toEqual([
            { section: cans, count: 2 },
            { section: null, count: 6 },
        ]);
        expect(missingPicks([], progress())).toEqual([{ section: null, count: 6 }]);
    });
});

describe('pickedCount', () => {
    it('counts the shopper\'s picks, not the can every case includes', async () => {
        const { add, progress } = await setUp((fixture) => withRequired(fixture, 'yuzu-elderflower'));
        expect(pickedCount(progress())).toBe(0);
        add('passionfruit-mojito', 5);
        expect(pickedCount(progress())).toBe(5);
        expect(progress().quantity).toBe(6);
    });
});

describe('isStepDone', () => {
    it('marks a "6 or 12" step done on those counts only: 7 is past the minimum and still short', async () => {
        const { cans, add, progress } = await setUp(withStepRules(onStep('eq', 6), onStep('eq', 12)));
        add('passionfruit-mojito', 6);
        expect(isStepDone(cans, progress())).toBe(true);
        add('passionfruit-mojito', 1);
        expect(progress().sections[cans.id]!.quantity).toBe(7);
        expect(isStepDone(cans, progress())).toBe(false);
        add('passionfruit-mojito', 5);
        expect(isStepDone(cans, progress())).toBe(true);
    });

    it('never marks an untouched step done, even one that owes nothing', async () => {
        const { cans, add, progress } = await setUp();
        expect(isStepDone(cans, progress())).toBe(false);
        add('passionfruit-mojito', 1);
        expect(isStepDone(cans, progress())).toBe(true);
    });
});

describe('isStepFinished', () => {
    it('finishes a step with a ceiling only when it is full', async () => {
        const { cans, add, progress } = await setUp(withStepRules(onStep('gte', 2), onStep('lte', 8)));
        add('passionfruit-mojito', 2);
        expect(isStepDone(cans, progress())).toBe(true);
        expect(isStepFinished(cans, progress())).toBe(false);
        add('passionfruit-mojito', 6);
        expect(isStepFinished(cans, progress())).toBe(true);
    });

    it('finishes a step with no ceiling once its minimum is met, and one with no rule never', async () => {
        const ruled = await setUp(withStepRules(onStep('gte', 2)));
        ruled.add('passionfruit-mojito', 1);
        expect(isStepFinished(ruled.cans, ruled.progress())).toBe(false);
        ruled.add('passionfruit-mojito', 1);
        expect(isStepFinished(ruled.cans, ruled.progress())).toBe(true);

        const free = await setUp();
        free.add('passionfruit-mojito', 24);
        expect(isStepFinished(free.cans, free.progress())).toBe(false);
    });
});
