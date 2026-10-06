import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { toViewModel, type ViewSection } from '../src/model';
import { isStepDone, isStepFinished, missingPicks, pickOf, pickedCount } from '../src/selection';
import { CATALOG_DEFS } from '../dev/catalog';
import { defineCatalog, type StoreProduct } from '../dev/mock/catalog';
import snapshot from '../dev/mock/demo-store.json' with { type: 'json' };
import type { Fixture } from '../dev/mock/wire';
import { load } from './support';

type Rule = Fixture['bundle']['limitRules'][number];
const count = (operation: Rule['operation'], value: number, sectionId: number | null): Rule => ({ operation, sectionId, type: 'total-number-of-products', value: value.toFixed(2) });

async function setUp(change?: Parameters<typeof load>[0]) {
    const { bundle, settings } = await load(change);
    const model = toViewModel(bundle, settings);
    const [top, bra, leggings] = model.sections as [ViewSection, ViewSection, ViewSection];
    const variant = (section: ViewSection, title: string) => section.products[0]!.variants.find((candidate) => candidate.title === title)!;
    const builder = createBundleBuilder(bundle);
    const add = (section: ViewSection, title: string) => builder.addItem(section.id, variant(section, title).id, 1);
    return { model, top, bra, leggings, variant, add, progress: () => builder.getState().progress };
}

/** The demo set with the Top's own rule replaced; the other steps keep "exactly 1". */
const topRules = (...rules: Rule[]) => (fixture: Fixture): Fixture => ({
    ...fixture,
    bundle: { ...fixture.bundle, limitRules: [...fixture.bundle.limitRules.filter((entry) => entry.sectionId !== 51), ...rules] },
});

describe('pickOf', () => {
    it('finds the piece a step holds, in whichever variant', async () => {
        const { top, bra, variant } = await setUp();
        const chosen = { [top.id]: [{ variantId: variant(top, 'L / Bone').id, quantity: 1 }] };
        expect(pickOf(chosen, top.id, top.products[0]!)?.variantId).toBe(variant(top, 'L / Bone').id);
        expect(pickOf(chosen, bra.id, bra.products[0]!)).toBeNull();
    });
});

describe('missingPicks', () => {
    it('names every step still without its piece, in page order, until none is', async () => {
        const { model, top, bra, leggings, add, progress } = await setUp();
        expect(missingPicks(model.sections, progress())).toEqual([
            { section: top, count: 1 },
            { section: bra, count: 1 },
            { section: leggings, count: 1 },
        ]);
        add(top, 'M / Onyx');
        add(leggings, 'M / Slate');
        expect(missingPicks(model.sections, progress())).toEqual([{ section: bra, count: 1 }]);
        add(bra, 'M / Onyx');
        expect(missingPicks(model.sections, progress())).toEqual([]);
    });

    it('puts the bundle-wide count last, and asks for nothing from a step the page does not show', async () => {
        const { model, top, progress } = await setUp((fixture) => ({ ...fixture, bundle: { ...fixture.bundle, limitRules: [count('eq', 1, 51), count('gte', 2, null)] } }));
        expect(missingPicks(model.sections, progress())).toEqual([
            { section: top, count: 1 },
            { section: null, count: 2 },
        ]);
        expect(missingPicks(model.sections.slice(1), progress())).toEqual([{ section: null, count: 2 }]);
    });
});

describe('pickedCount', () => {
    it('counts the shopper\'s pieces, not the piece every set includes', async () => {
        const { top, add, progress } = await setUp(() =>
            defineCatalog({ ...CATALOG_DEFS[0]!, sections: CATALOG_DEFS[0]!.sections.slice(0, 2), required: [{ handle: 'power-leggings' }] }, snapshot as unknown as StoreProduct[]),
        );
        expect(pickedCount(progress())).toBe(0);
        add(top, 'M / Onyx');
        expect(pickedCount(progress())).toBe(1);
    });
});

describe('isStepDone', () => {
    it('marks a step done once it holds its piece, and an optional step only when it holds one', async () => {
        const { top, bra, add, progress } = await setUp(topRules(count('lte', 1, 51)));
        expect(isStepDone(top, progress())).toBe(false);
        expect(isStepDone(bra, progress())).toBe(false);
        add(top, 'M / Onyx');
        add(bra, 'M / Onyx');
        expect(isStepDone(top, progress())).toBe(true);
        expect(isStepDone(bra, progress())).toBe(true);
    });

    it('does not mark a step done while the SDK still counts it short, though it is past its minimum', async () => {
        // "2 or 4" is not a set this section sells, and the rule is the same one: done is `missing === 0`.
        const { top, add, progress } = await setUp(topRules(count('eq', 1, 51), count('eq', 3, 51)));
        add(top, 'M / Onyx');
        expect(isStepDone(top, progress())).toBe(true);
        add(top, 'L / Onyx');
        expect(progress().sections[top.id]).toMatchObject({ quantity: 2, missing: 1 });
        expect(isStepDone(top, progress())).toBe(false);
    });
});

describe('isStepFinished', () => {
    it('finishes a one-piece step when it holds its piece, required or optional', async () => {
        const { top, bra, add, progress } = await setUp(topRules(count('lte', 1, 51)));
        expect(isStepFinished(top, progress())).toBe(false);
        expect(isStepFinished(bra, progress())).toBe(false);
        add(top, 'M / Onyx');
        add(bra, 'M / Onyx');
        expect(isStepFinished(top, progress())).toBe(true);
        expect(isStepFinished(bra, progress())).toBe(true);
    });

    it('finishes a step with no ceiling once its minimum is met, and one with no rule never', async () => {
        const { top, add, progress } = await setUp(topRules(count('gte', 1, 51)));
        expect(isStepFinished(top, progress())).toBe(false);
        add(top, 'M / Onyx');
        expect(isStepFinished(top, progress())).toBe(true);

        const free = await setUp(topRules());
        free.add(free.top, 'M / Onyx');
        expect(isStepFinished(free.top, free.progress())).toBe(false);
    });
});
