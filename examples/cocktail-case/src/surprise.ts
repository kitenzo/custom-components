/*
 * "Surprise me": fill the rest of the case with a random mix the shopper can then edit.
 *
 * Three pure steps, so each is tested on its own:
 *
 *   1. `nextCaseSize`: how big the case should become. The next size worth stopping at above the
 *      current count: the bundle's minimum, each discount rung, its maximum. When the merchant's
 *      rules are exact sizes ("6, 12 or 24", several `eq` rules), only those count. Never a size
 *      the rules refuse, and never above the maximum.
 *   2. `surpriseCandidates`: what may go in. Sold-out products, products the conditions engine
 *      hides, and variants at their stock ceiling (`maxOrderableQuantity`, counted across the whole
 *      case) are out. Each candidate carries how many more of it fit, and a weight that leans
 *      toward the shopper's active filters without excluding the rest.
 *   3. `planSurprise`: the draw itself, with a seeded generator, so the same seed is the same
 *      case (the unit tests rely on it) and every press of the button is a new seed.
 *
 * The plan is applied through the SDK builder like any other pick; validation and pricing stay
 * the SDK's. The plan never relies on the builder to clamp it: it respects stock, each step's
 * room and the target on its own.
 */
import type { BundleDetail, PickLimits, SectionSelections } from '@kitenzo/react';

import { facetsMatched, type ActiveFacets, type FacetDef } from './facets';
import type { ViewModel } from './model';
import { countOf, quantitiesOf } from './selection';
import type { Ladder } from './tiers';

/** How much each matched filter facet adds to a product's weight (a non-match weighs 1). */
export const FACET_PULL = 4;
/** After each draw, the drawn can's weight is multiplied by this, so a case comes out varied. */
export const VARIETY = 0.55;

/** mulberry32: small, fast, and the same sequence for the same seed on every engine. */
export function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Bundle-wide "exactly N" count rules: each is an allowed case size. */
export function exactSizes(bundle: BundleDetail): number[] {
    return (bundle.limitRules ?? [])
        .filter((entry) => entry.sectionId === null && entry.type === 'total-number-of-products' && entry.operation === 'eq')
        .map((entry) => Math.round(Number.parseFloat(entry.value)))
        .filter((value) => Number.isFinite(value) && value > 0);
}

/** The size to fill to from `count`, or null when there is nowhere further to go. */
export function nextCaseSize(count: number, limits: PickLimits, ladder: Ladder | null, exact: number[]): number | null {
    const stops = exact.length > 0 ? exact : [limits.min, ...(ladder?.rungs.map((rung) => rung.threshold) ?? []), limits.max];
    const above = stops.filter((size) => Number.isFinite(size) && size > count && size >= limits.min && size <= limits.max);
    return above.length > 0 ? Math.min(...above) : null;
}

export interface Candidate {
    sectionId: number;
    variantId: string;
    productId: string;
    /** How many more of this variant stock allows. `Infinity` when nothing caps it. */
    room: number;
    weight: number;
}

export interface SurpriseInput {
    model: ViewModel;
    selections: SectionSelections;
    hiddenSectionIds: number[];
    hiddenProducts: { productId: string; sectionId: number | null }[];
    facetDefs: FacetDef[];
    activeFacets: ActiveFacets;
}

export function surpriseCandidates(input: SurpriseInput): Candidate[] {
    const { model, selections, hiddenSectionIds, hiddenProducts, facetDefs, activeFacets } = input;
    const taken = quantitiesOf(selections);
    return model.sections.flatMap((section) => {
        if (hiddenSectionIds.includes(section.id)) return [];
        return section.products.flatMap<Candidate>((product) => {
            if (hiddenProducts.some((entry) => entry.productId === product.id && (entry.sectionId === null || entry.sectionId === section.id))) return [];
            // The first variant that can still take a can. A sold-out product has none.
            for (const variant of product.variants) {
                if (!variant.available) continue;
                const stock = variant.maxOrderableQuantity ?? Number.POSITIVE_INFINITY;
                const room = stock - (taken.get(variant.id) ?? 0);
                if (room <= 0) continue;
                return [{ sectionId: section.id, variantId: variant.id, productId: product.id, room, weight: 1 + FACET_PULL * facetsMatched(product.tags, facetDefs, activeFacets) }];
            }
            return [];
        });
    });
}

/** How many more each step takes before its own maximum. */
export function sectionRoom(model: ViewModel, selections: SectionSelections): Record<number, number> {
    return Object.fromEntries(model.sections.map((section) => [section.id, section.limits.max - countOf(selections, section.id)]));
}

export interface SurprisePlan {
    picks: { sectionId: number; variantId: string; quantity: number }[];
    added: number;
    /** Cans the plan wanted but could not place: everything left is out of stock or out of room. */
    short: number;
}

/** Draw `need` cans from the candidates. Pure: same input and seed, same plan. */
export function planSurprise(candidates: Candidate[], need: number, room: Record<number, number>, seed: number): SurprisePlan {
    const random = seededRandom(seed);
    const pool = candidates.map((candidate) => ({ ...candidate }));
    const steps = { ...room };
    const picks: SurprisePlan['picks'] = [];
    let added = 0;
    while (added < need) {
        const open = pool.filter((candidate) => candidate.room > 0 && (steps[candidate.sectionId] ?? 0) > 0 && candidate.weight > 0);
        if (open.length === 0) break;
        const total = open.reduce((sum, candidate) => sum + candidate.weight, 0);
        let roll = random() * total;
        let chosen = open[open.length - 1]!;
        for (const candidate of open) {
            roll -= candidate.weight;
            if (roll < 0) {
                chosen = candidate;
                break;
            }
        }
        chosen.room -= 1;
        chosen.weight *= VARIETY;
        steps[chosen.sectionId] = (steps[chosen.sectionId] ?? 0) - 1;
        const existing = picks.find((pick) => pick.sectionId === chosen.sectionId && pick.variantId === chosen.variantId);
        if (existing) existing.quantity += 1;
        else picks.push({ sectionId: chosen.sectionId, variantId: chosen.variantId, quantity: 1 });
        added += 1;
    }
    return { picks, added, short: Math.max(0, need - added) };
}
