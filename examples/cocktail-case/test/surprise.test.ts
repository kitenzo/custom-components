import { describe, expect, it } from 'vitest';

import { createBundleBuilder, type SectionSelections } from '@kitenzo/core';

import { DEFAULT_CONTENT } from '../src/content';
import { indexFacets, parseFacetDefs, type ActiveFacets } from '../src/facets';
import { toViewModel } from '../src/model';
import { nextCaseSize, planSurprise, seededRandom, surpriseCandidates, type SurprisePick } from '../src/surprise';
import { ladderRungs } from '../src/tiers';
import { load, withProduct } from './support';

async function setUp(change?: Parameters<typeof load>[0]) {
    const { bundle, settings } = await load(change);
    const model = toViewModel(bundle, settings);
    const cans = model.sections[0]!;
    const product = (handle: string) => cans.products.find((entry) => entry.handle === handle)!;
    const facets = indexFacets(cans.products, parseFacetDefs(DEFAULT_CONTENT.facets));
    const candidates = (activeFacets: ActiveFacets = {}) => surpriseCandidates(model, facets, activeFacets);
    /** The size "Surprise me" fills to from a case of `count`, with the SDK's own progress for that case. */
    const sizeFrom = (count: number, rungs = ladderRungs(bundle).map((rung) => rung.count)) => {
        const builder = createBundleBuilder(bundle);
        builder.addItem(cans.id, product('passionfruit-mojito').variants[0]!.id, count);
        const { progress, isSatisfied } = builder.getState();
        expect(progress.quantity).toBe(count);
        return { size: nextCaseSize(progress, model.bundleLimits, rungs), isSatisfied };
    };
    /** Whether the rules accept a case of `count`: the SDK's answer. */
    const accepts = (count: number | null) => count !== null && sizeFrom(count).isSatisfied;
    return { bundle, model, cans, product, candidates, sizeFrom, accepts };
}

const total = (plan: SurprisePick[]) => plan.reduce((sum, pick) => sum + pick.quantity, 0);
const quantityOf = (plan: SurprisePick[], variantId: string) => total(plan.filter((pick) => pick.variantId === variantId));

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
        const { sizeFrom } = await setUp();
        expect([0, 4, 6, 7, 11, 12, 23].map((count) => sizeFrom(count).size)).toEqual([6, 6, 12, 12, 12, 24, 24]);
        expect(sizeFrom(24).size).toBeNull();
    });

    it('with no tiers, fills to the minimum, then the maximum', () => {
        expect(nextCaseSize({ quantity: 2, missing: 4 }, { min: 6, max: 24, isRequired: true }, [])).toBe(6);
        expect(nextCaseSize({ quantity: 6, missing: 0 }, { min: 6, max: 24, isRequired: true }, [])).toBe(24);
        expect(nextCaseSize({ quantity: 6, missing: 0 }, { min: 6, max: null, isRequired: true }, [])).toBeNull();
    });

    it('with exact sizes ("6, 12 or 24"), only ever fills to one of them', async () => {
        const { model, sizeFrom } = await setUp((fixture) => ({
            ...fixture,
            bundle: {
                ...fixture.bundle,
                limitRules: [6, 12, 24].map((value) => ({ operation: 'eq' as const, sectionId: null, type: 'total-number-of-products' as const, value: `${value}.00` })),
            },
        }));
        expect(model.bundleLimits.allowedCounts).toEqual([6, 12, 24]);
        // A rung at 10 is not a size the rules allow, so it is never a stop.
        expect([8, 12, 24].map((count) => sizeFrom(count, [10]).size)).toEqual([12, 24, null]);
    });

    it('sold in packs of 6 with a tier at 10, never fills to 10: every size it names is one the rules accept', async () => {
        const { model, sizeFrom, accepts } = await setUp((fixture) => ({
            ...fixture,
            bundle: {
                ...fixture.bundle,
                limitRules: [...fixture.bundle.limitRules, { operation: 'eq', sectionId: null, type: 'multiples-of', value: '6.00' }],
                discount: { ...fixture.bundle.discount!, tiers: [...fixture.bundle.discount!.tiers.slice(0, 1), { customText: null, discount: '8.00', operation: 'gte', type: 'total_products', value: '10.00' }] },
            },
        }));
        expect(model.bundleLimits.multipleOf).toBe(6);
        expect(ladderRungs(model.bundle).map((rung) => rung.count)).toEqual([6, 10]);
        // From a whole pack, the rung at 10 is dropped. From a part pack, the SDK's next whole one.
        expect([0, 6, 7, 10, 12].map((count) => sizeFrom(count).size)).toEqual([6, 24, 12, 12, 24]);
        for (let count = 0; count < 24; count += 1) expect(accepts(sizeFrom(count).size), `from ${count}`).toBe(true);
    });
});

describe('surpriseCandidates', () => {
    it('offers every can the page shows, and none the conditions engine has taken out of the model', async () => {
        const { bundle, model, product, candidates } = await setUp();
        expect(candidates()).toHaveLength(model.sections[0]!.products.length);
        const { settings } = await load();
        const pear = product('pear-cardamom').id;
        const hidden = toViewModel(bundle, settings, { hiddenSectionIds: [], hiddenProducts: [{ productId: pear, sectionId: null }] });
        expect(surpriseCandidates(hidden, indexFacets([], []), {}).map((candidate) => candidate.productId)).not.toContain(pear);
    });

    it('weighs a can by how many active filters it matches', async () => {
        const { product, candidates } = await setUp();
        const weights = candidates({ Flavor_: ['citrus'], Strength_: ['light'] });
        const weight = (handle: string) => weights.find((candidate) => candidate.productId === product(handle).id)!.weight;
        expect(weight('yuzu-elderflower')).toBe(9);
        expect(weight('grapefruit-rosemary')).toBe(5);
        expect(weight('peach-bourbon-smash')).toBe(1);
    });
});

describe('planSurprise', () => {
    it('is deterministic per seed and fills exactly what was asked', async () => {
        const { bundle, candidates } = await setUp();
        const plan = planSurprise(bundle, {}, candidates(), 6, 7);
        expect(planSurprise(bundle, {}, candidates(), 6, 7)).toEqual(plan);
        expect(planSurprise(bundle, {}, candidates(), 6, 8)).not.toEqual(plan);
        expect(total(plan)).toBe(6);
    });

    it('never draws the sold-out can, whatever the seed', async () => {
        const { bundle, product, candidates } = await setUp();
        const watermelon = product('watermelon-basil').variants[0]!.id;
        const loaded = candidates().map((candidate) => ({ ...candidate, weight: candidate.productId === product('watermelon-basil').id ? 1000 : 1 }));
        for (let seed = 1; seed <= 50; seed += 1) {
            const plan = planSurprise(bundle, {}, loaded, 12, seed);
            expect(quantityOf(plan, watermelon)).toBe(0);
            expect(total(plan)).toBe(12);
        }
    });

    it('never draws a can that cannot be bought, even when nothing counts its stock', async () => {
        // Unavailable in this market, say, with `maxOrderableQuantity: null`: stock says "no limit",
        // availability says no. Availability wins.
        const { bundle, product, candidates } = await setUp((fixture) =>
            withProduct(fixture, 'pear-cardamom', (entry) => ({ ...entry, variants: entry.variants.map((variant) => ({ ...variant, available: false, maxOrderableQuantity: null })) })),
        );
        const pear = product('pear-cardamom').variants[0]!.id;
        for (let seed = 1; seed <= 50; seed += 1) expect(quantityOf(planSurprise(bundle, {}, candidates(), 12, seed), pear)).toBe(0);
    });

    it('never puts in more than stock allows, whatever the seed', async () => {
        const { bundle, cans, product, candidates } = await setUp();
        const spicy = product('spicy-pineapple-marg').variants[0]!.id; // stock 4 in the catalogue
        const selections: SectionSelections = { [cans.id]: [{ variantId: spicy, quantity: 3 }] };
        // Spicy carries nearly all the weight here, so every draw wants it; only one more fits.
        const only = candidates().map((candidate) => ({ ...candidate, weight: candidate.productId === product('spicy-pineapple-marg').id ? 1000 : 1 }));
        for (let seed = 1; seed <= 50; seed += 1) {
            const plan = planSurprise(bundle, selections, only, 12, seed);
            expect(quantityOf(plan, spicy)).toBe(1);
            expect(total(plan)).toBe(12);
        }
    });

    it('never plans more than the case holds, and plans short when room or stock runs out', async () => {
        const { bundle, cans, product, candidates } = await setUp();
        const selections: SectionSelections = { [cans.id]: [{ variantId: product('passionfruit-mojito').variants[0]!.id, quantity: 20 }] };
        expect(total(planSurprise(bundle, selections, candidates(), 10, 3))).toBe(4);
        expect(planSurprise(bundle, {}, [], 6, 3)).toEqual([]);
        const scarce = candidates().filter((candidate) => candidate.productId === product('spicy-pineapple-marg').id);
        expect(planSurprise(bundle, {}, scarce, 6, 3)).toEqual([{ sectionId: cans.id, variantId: product('spicy-pineapple-marg').variants[0]!.id, quantity: 4 }]);
    });

    it('respects a cap on one product ("at most 2 of each")', async () => {
        const { bundle, candidates } = await setUp((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, limitRules: [...fixture.bundle.limitRules, { operation: 'lte', sectionId: null, type: 'amount-of-one-product', value: '2.00' }] },
        }));
        for (let seed = 1; seed <= 20; seed += 1) {
            const plan = planSurprise(bundle, {}, candidates(), 12, seed);
            expect(total(plan)).toBe(12);
            expect(Math.max(...plan.map((pick) => pick.quantity))).toBeLessThanOrEqual(2);
        }
    });

    it('plans only what the builder then takes, can for can', async () => {
        const { bundle, cans, product, candidates } = await setUp();
        const start: SectionSelections = { [cans.id]: [{ variantId: product('spicy-pineapple-marg').variants[0]!.id, quantity: 2 }] };
        for (let seed = 1; seed <= 20; seed += 1) {
            const plan = planSurprise(bundle, start, candidates(), 22, seed);
            const builder = createBundleBuilder(bundle, { initialSelections: start });
            for (const pick of plan) expect(builder.addItem(pick.sectionId, pick.variantId, pick.quantity)).toBe(pick.quantity);
            expect(builder.getState().progress.quantity).toBe(24);
        }
    });

    it('leans toward the active filters without excluding the rest', async () => {
        const { bundle, product, candidates } = await setUp();
        const active = { Flavor_: ['citrus'] };
        const citrus = new Set(['grapefruit-rosemary', 'cucumber-lime-tonic', 'blood-orange-bitters', 'yuzu-elderflower'].map((handle) => product(handle).variants[0]!.id));
        let matching = 0;
        let drawn = 0;
        for (let seed = 1; seed <= 200; seed += 1) {
            for (const pick of planSurprise(bundle, {}, candidates(active), 6, seed)) {
                drawn += pick.quantity;
                if (citrus.has(pick.variantId)) matching += pick.quantity;
            }
        }
        // 4 citrus cans at weight 5 against 5 others at weight 1: well over half the cans are citrus.
        expect(matching / drawn).toBeGreaterThan(0.6);
        expect(drawn - matching).toBeGreaterThan(0);
    });

    it('mixes the case rather than stacking one can', async () => {
        const { bundle, candidates } = await setUp();
        let distinct = 0;
        for (let seed = 1; seed <= 100; seed += 1) distinct += planSurprise(bundle, {}, candidates(), 6, seed).length;
        // Six cans drawn evenly from the nine in stock come out as about 4.6 kinds. Each draw makes
        // the drawn can less likely, which is what lifts it to 5.
        expect(distinct / 100).toBeGreaterThan(4.8);
    });
});
