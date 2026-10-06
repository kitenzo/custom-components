/*
 * "Surprise me": fill the rest of the case with a random mix the shopper can then edit.
 *
 * Three pure steps, so each is tested on its own:
 *
 *   1. `nextCaseSize`: how big the case should become. While the case is short of a count the
 *      rules accept, that count, which is the SDK's own (`progress.missing`). After that, the next
 *      size worth stopping at: the minimum, each discount rung, the maximum, or the next of the
 *      merchant's exact sizes ("6, 12 or 24"). Never a size the rules refuse, and never above the
 *      maximum.
 *   2. `surpriseCandidates`: what may be drawn. Every product the page shows, with a weight that
 *      leans toward the shopper's active filters without excluding the rest.
 *   3. `planSurprise`: the draw itself, with a seeded generator, so the same seed is the same
 *      case (the unit tests rely on it) and every press of the button is a new seed.
 *
 * Whether a can fits is never worked out here. The draw offers each can to a builder of its own,
 * holding the shopper's case, and that builder takes only what a shopper could have picked by
 * hand: nothing sold out, nothing past its stock, a step's room, the case's or a cap on one
 * product. The plan is what it took, and goes in through the page's builder like any other pick.
 */
import { ceilingOf, createBundleBuilder, type BundleDetail, type PickLimits, type SectionSelections, type SelectionProgress } from '@kitenzo/react';

import { facetsMatched, type ActiveFacets, type FacetIndex } from './facets';
import type { ViewModel } from './model';

/** How much each matched filter facet adds to a product's weight (a non-match weighs 1). */
const FACET_PULL = 4;
/** After each draw, the drawn can's weight is multiplied by this, so a case comes out varied. */
const VARIETY = 0.55;

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

/**
 * The size to fill to, or null when there is nowhere further to go. `progress` is the case's
 * (bundle-wide) and `rungs` are the counts the discount ladder steps up at.
 */
export function nextCaseSize(progress: Pick<SelectionProgress, 'quantity' | 'missing'>, limits: PickLimits, rungs: number[]): number | null {
    const count = progress.quantity;
    // Short of an acceptable count: the SDK says how far the next one is.
    if (progress.missing > 0) return count + progress.missing;
    const ceiling = ceilingOf(limits);
    const pack = limits.multipleOf ?? 1;
    const stops = limits.allowedCounts ?? [limits.min, ...rungs, ceiling];
    // A rung or a maximum that is not a whole number of packs is a count the rules refuse.
    const above = stops.filter((size) => Number.isFinite(size) && size > count && size >= limits.min && size <= ceiling && size % pack === 0);
    return above.length > 0 ? Math.min(...above) : null;
}

export interface Candidate {
    sectionId: number;
    productId: string;
    /** The product's variants, in the order the draw tries them. */
    variantIds: string[];
    weight: number;
}

/** Every product on the page. What the conditions engine hides has already left the model. */
export function surpriseCandidates(model: ViewModel, facets: FacetIndex, activeFacets: ActiveFacets): Candidate[] {
    return model.sections.flatMap((section) =>
        section.products.map<Candidate>((product) => ({
            sectionId: section.id,
            productId: product.id,
            variantIds: product.variants.map((variant) => variant.id),
            weight: 1 + FACET_PULL * facetsMatched(product.id, facets, activeFacets),
        })),
    );
}

export interface SurprisePick {
    sectionId: number;
    variantId: string;
    quantity: number;
}

/**
 * Draw up to `need` cans on top of `selections`. Pure: same input and seed, same plan.
 *
 * Fewer than `need` come back when everything left is out of stock or out of room.
 */
export function planSurprise(bundle: BundleDetail, selections: SectionSelections, candidates: Candidate[], need: number, seed: number): SurprisePick[] {
    const random = seededRandom(seed);
    const builder = createBundleBuilder(bundle, { initialSelections: selections });
    let pool = candidates.filter((candidate) => candidate.weight > 0).map((candidate) => ({ ...candidate }));
    const picks: SurprisePick[] = [];
    let left = need;
    while (left > 0 && pool.length > 0) {
        let roll = random() * pool.reduce((sum, candidate) => sum + candidate.weight, 0);
        const drawn = pool.find((candidate) => (roll -= candidate.weight) < 0) ?? pool[pool.length - 1]!;
        // The builder's answer is the only one: the first of the product's variants it takes.
        const variantId = drawn.variantIds.find((id) => builder.addItem(drawn.sectionId, id, 1) === 1);
        if (variantId === undefined) {
            // Cans only go in during a draw, so what is refused once is refused for the rest of it.
            pool = pool.filter((candidate) => candidate !== drawn);
            continue;
        }
        drawn.weight *= VARIETY;
        const existing = picks.find((pick) => pick.sectionId === drawn.sectionId && pick.variantId === variantId);
        if (existing) existing.quantity += 1;
        else picks.push({ sectionId: drawn.sectionId, variantId, quantity: 1 });
        left -= 1;
    }
    return picks;
}
