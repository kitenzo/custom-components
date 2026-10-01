import { describe, expect, it } from 'vitest';

import type { SectionSelections } from '@kitenzo/core';

import { DEFAULT_CONTENT } from '../src/content';
import { parseFacetDefs, type ActiveFacets } from '../src/facets';
import { toViewModel } from '../src/model';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { exactSizes, nextCaseSize, planSurprise, sectionRoom, seededRandom, surpriseCandidates, type Candidate } from '../src/surprise';
import { tierLadder } from '../src/tiers';
import { load, withProduct } from './support';

const facetDefs = parseFacetDefs(DEFAULT_CONTENT.facets);

async function setUp() {
    const { bundle, settings } = await load();
    const model = toViewModel(withRequiredVariantIds(bundle), { settings });
    const cans = model.sections[0]!;
    const product = (handle: string) => cans.products.find((entry) => entry.handle === handle)!;
    const candidates = (selections: SectionSelections, activeFacets: ActiveFacets = {}) =>
        surpriseCandidates({ model, selections, hiddenSectionIds: [], hiddenProducts: [], facetDefs, activeFacets });
    return { model, cans, product, candidates };
}

const quantityOf = (plan: ReturnType<typeof planSurprise>, variantId: string) => plan.picks.filter((pick) => pick.variantId === variantId).reduce((sum, pick) => sum + pick.quantity, 0);

describe('seededRandom', () => {
    it('is the same sequence for the same seed, and a different one for another', () => {
        const a = seededRandom(42);
        const b = seededRandom(42);
        const c = seededRandom(43);
        const first = [a(), a(), a()];
        expect([b(), b(), b()]).toEqual(first);
        expect([c(), c(), c()]).not.toEqual(first);
        expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
    });
});

describe('nextCaseSize', () => {
    it('fills to the next stop: the minimum, each discount rung, the maximum', async () => {
        const { model } = await setUp();
        const size = (count: number) => nextCaseSize(count, model.bundleLimits, tierLadder(model.bundle.discount, count), exactSizes(model.bundle));
        expect([0, 4, 6, 7, 11, 12, 23].map(size)).toEqual([6, 6, 12, 12, 12, 24, 24]);
        expect(size(24)).toBeNull();
    });

    it('with no tiers, fills to the minimum, then the maximum', () => {
        expect(nextCaseSize(2, { min: 6, max: 24, isRequired: true }, null, [])).toBe(6);
        expect(nextCaseSize(6, { min: 6, max: 24, isRequired: true }, null, [])).toBe(24);
        expect(nextCaseSize(6, { min: 6, max: Number.POSITIVE_INFINITY, isRequired: true }, null, [])).toBeNull();
    });

    it('with exact sizes ("6, 12 or 24"), only ever fills to one of them', async () => {
        const { bundle } = await load((fixture) => ({
            ...fixture,
            bundle: {
                ...fixture.bundle,
                discount: null,
                limitRules: [6, 12, 24].map((value) => ({ operation: 'eq' as const, sectionId: null, type: 'total-number-of-products' as const, value: `${value}.00` })),
            },
        }));
        const exact = exactSizes(bundle);
        expect(exact).toEqual([6, 12, 24]);
        expect(nextCaseSize(8, { min: 6, max: 24, isRequired: true }, null, exact)).toBe(12);
        expect(nextCaseSize(12, { min: 6, max: 24, isRequired: true }, null, exact)).toBe(24);
    });
});

describe('surpriseCandidates', () => {
    it('leaves out the sold-out can and a can at its stock ceiling', async () => {
        const { cans, product, candidates } = await setUp();
        const ids = (list: Candidate[]) => list.map((candidate) => candidate.productId);
        const fresh = candidates({});
        expect(ids(fresh)).not.toContain(product('watermelon-basil').id);
        expect(fresh.find((candidate) => candidate.productId === product('spicy-pineapple-marg').id)?.room).toBe(4);

        const spicy = product('spicy-pineapple-marg').variants[0]!.id;
        expect(candidates({ [cans.id]: [{ variantId: spicy, quantity: 3 }] }).find((candidate) => candidate.variantId === spicy)?.room).toBe(1);
        expect(ids(candidates({ [cans.id]: [{ variantId: spicy, quantity: 4 }] }))).not.toContain(product('spicy-pineapple-marg').id);
    });

    it('leaves out an unavailable can even when nothing counts its stock', async () => {
        // Unavailable in this market, say, with `maxOrderableQuantity: null`: stock says "no limit",
        // availability says no. Availability wins.
        const { bundle, settings } = await load((fixture) =>
            withProduct(fixture, 'pear-cardamom', (entry) => ({ ...entry, variants: entry.variants.map((variant) => ({ ...variant, available: false, maxOrderableQuantity: null })) })),
        );
        const model = toViewModel(bundle, { settings });
        const pear = model.sections[0]!.products.find((entry) => entry.handle === 'pear-cardamom')!;
        const list = surpriseCandidates({ model, selections: {}, hiddenSectionIds: [], hiddenProducts: [], facetDefs, activeFacets: {} });
        expect(list.map((candidate) => candidate.productId)).not.toContain(pear.id);
    });

    it('leaves out a can the conditions engine hides', async () => {
        const { model, product } = await setUp();
        const hidden = surpriseCandidates({ model, selections: {}, hiddenSectionIds: [], hiddenProducts: [{ productId: product('pear-cardamom').id, sectionId: null }], facetDefs, activeFacets: {} });
        expect(hidden.map((candidate) => candidate.productId)).not.toContain(product('pear-cardamom').id);
    });

    it('weighs a can by how many active filters it matches', async () => {
        const { product, candidates } = await setUp();
        const weights = candidates({}, { Flavor_: ['citrus'], Strength_: ['light'] });
        const weight = (handle: string) => weights.find((candidate) => candidate.productId === product(handle).id)!.weight;
        expect(weight('yuzu-elderflower')).toBe(9);
        expect(weight('grapefruit-rosemary')).toBe(5);
        expect(weight('peach-bourbon-smash')).toBe(1);
    });
});

describe('planSurprise', () => {
    it('is deterministic per seed and fills exactly what was asked', async () => {
        const { model, candidates } = await setUp();
        const room = sectionRoom(model, {});
        const plan = planSurprise(candidates({}), 6, room, 7);
        expect(planSurprise(candidates({}), 6, room, 7)).toEqual(plan);
        expect(plan.added).toBe(6);
        expect(plan.short).toBe(0);
        expect(plan.picks.reduce((sum, pick) => sum + pick.quantity, 0)).toBe(6);
    });

    it('never puts in more than stock allows, whatever the seed', async () => {
        const { cans, model, product, candidates } = await setUp();
        const spicy = product('spicy-pineapple-marg').variants[0]!.id;
        const selections = { [cans.id]: [{ variantId: spicy, quantity: 3 }] };
        // Spicy is the only can with weight here, so every draw wants it; only one more fits.
        const only = candidates(selections).map((candidate) => ({ ...candidate, weight: candidate.variantId === spicy ? 1000 : 1 }));
        for (let seed = 1; seed <= 50; seed += 1) {
            expect(quantityOf(planSurprise(only, 12, sectionRoom(model, selections), seed), spicy)).toBeLessThanOrEqual(1);
        }
    });

    it('reports what it could not place when stock runs out', () => {
        const scarce: Candidate[] = [
            { sectionId: 1, variantId: 'a', productId: 'A', room: 2, weight: 1 },
            { sectionId: 1, variantId: 'b', productId: 'B', room: 1, weight: 1 },
        ];
        expect(planSurprise(scarce, 6, { 1: Number.POSITIVE_INFINITY }, 3)).toMatchObject({ added: 3, short: 3 });
        expect(planSurprise([], 6, { 1: 10 }, 3)).toEqual({ picks: [], added: 0, short: 6 });
    });

    it('respects a step\'s own maximum', () => {
        const pool: Candidate[] = [
            { sectionId: 1, variantId: 'a', productId: 'A', room: Number.POSITIVE_INFINITY, weight: 1 },
            { sectionId: 2, variantId: 'b', productId: 'B', room: Number.POSITIVE_INFINITY, weight: 1 },
        ];
        const plan = planSurprise(pool, 10, { 1: 2, 2: Number.POSITIVE_INFINITY }, 11);
        expect(quantityOf(plan, 'a')).toBeLessThanOrEqual(2);
        expect(plan.added).toBe(10);
    });

    it('leans toward the active filters without excluding the rest', async () => {
        const { model, product, candidates } = await setUp();
        const active = { Flavor_: ['citrus'] };
        const citrus = new Set(['grapefruit-rosemary', 'cucumber-lime-tonic', 'blood-orange-bitters', 'yuzu-elderflower'].map((handle) => product(handle).variants[0]!.id));
        let matching = 0;
        let total = 0;
        let others = 0;
        for (let seed = 1; seed <= 200; seed += 1) {
            const plan = planSurprise(candidates({}, active), 6, sectionRoom(model, {}), seed);
            for (const pick of plan.picks) {
                total += pick.quantity;
                if (citrus.has(pick.variantId)) matching += pick.quantity;
                else others += pick.quantity;
            }
        }
        // 4 citrus cans at weight 5 against 5 others at weight 1: well over half the cans are citrus.
        expect(matching / total).toBeGreaterThan(0.6);
        expect(others).toBeGreaterThan(0);
    });

    it('mixes the case rather than stacking one can', async () => {
        const { model, candidates } = await setUp();
        let distinct = 0;
        for (let seed = 1; seed <= 100; seed += 1) distinct += planSurprise(candidates({}), 6, sectionRoom(model, {}), seed).picks.length;
        expect(distinct / 100).toBeGreaterThan(4);
    });
});
