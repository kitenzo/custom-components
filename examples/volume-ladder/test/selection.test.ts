import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { missingPicks, pickedCount } from '../src/selection';
import { load, withRequiredUnflavoured } from './support';

type Change = NonNullable<Parameters<typeof load>[0]>;

async function setUp(change?: Change) {
    const { bundle, settings } = await load(change);
    const model = toViewModel(bundle, settings);
    const flavours = model.sections[0]!;
    const builder = createBundleBuilder(bundle);
    const add = (handle: string, quantity: number) => builder.addItem(flavours.id, flavours.products.find((product) => product.handle === handle)!.variants[0]!.id, quantity);
    return { model, flavours, add, progress: () => builder.getState().progress };
}

describe('missingPicks', () => {
    it('says the bundle-wide count while no step is short: one pouch is one short, two are enough', async () => {
        const { model, add, progress } = await setUp();
        expect(missingPicks(model.sections, progress())).toEqual([{ section: null, count: 2 }]);
        add('chocolate-whey-protein', 1);
        expect(missingPicks(model.sections, progress())).toEqual([{ section: null, count: 1 }]);
        add('vanilla-whey-protein', 1);
        expect(missingPicks(model.sections, progress())).toEqual([]);
    });

    it('names a step that needs picks of its own before the bundle-wide count, and asks nothing of a step the page does not show', async () => {
        const { model, flavours, progress } = await setUp((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, limitRules: [...fixture.bundle.limitRules, { operation: 'gte', sectionId: fixture.bundle.sections[0]!.id, type: 'total-number-of-products', value: '3.00' }] },
        }));
        expect(missingPicks(model.sections, progress())).toEqual([
            { section: flavours, count: 3 },
            { section: null, count: 2 },
        ]);
        expect(missingPicks([], progress())).toEqual([{ section: null, count: 2 }]);
    });
});

describe('pickedCount', () => {
    it('counts the shopper\'s picks, not the pouch every bundle includes', async () => {
        const { add, progress } = await setUp(withRequiredUnflavoured);
        expect(pickedCount(progress())).toBe(0);
        add('chocolate-whey-protein', 2);
        expect(pickedCount(progress())).toBe(2);
    });
});
