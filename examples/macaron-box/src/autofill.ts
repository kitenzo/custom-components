/*
 * "Fill the rest": the patissier's choice for the slots the shopper left empty.
 *
 * Planning is a pure function of the bundle, what is already in the box and a random source, so a
 * test can fix the seed and know the exact plan. Whether a flavour can take one more is never
 * worked out here: the plan is made on a builder of its own, opened with what the box holds, and
 * a macaron is in the plan only when that builder took it (`addItem` says how many went in). So
 * the plan keeps to stock, to "at most 2 of each" and to every other rule the shopper's builder
 * holds. Applying the plan is the UI's job, one `addItem` per macaron.
 *
 * The plan only ever fills empty slots (it never swaps out a flavour the shopper chose). It
 * spreads the box across flavours, fewest-in-the-box first, so a dozen becomes an assortment
 * rather than twelve of whatever came up first.
 */
import { createBundleBuilder, type BundleDetail, type SectionSelections } from '@kitenzo/react';

/**
 * A small seeded generator (mulberry32). `Math.random` cannot be seeded, and a plan a test cannot
 * reproduce is a plan nobody can debug.
 */
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

/** `items` in a random order (Fisher-Yates), without changing `items`. */
function shuffled<T>(items: T[], random: () => number): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const other = Math.min(index, Math.floor(random() * (index + 1)));
        [result[index], result[other]] = [result[other]!, result[index]!];
    }
    return result;
}

/**
 * Plan up to `empty` picks for a step from `variantIds`, the variants the page shows in it: one
 * variant id per macaron, in the order to add them. Shorter than `empty` when nothing more will go
 * in.
 *
 * `empty` is the chosen box's, which only the widget knows: the builder would fill the step to its
 * largest box. The plan goes round by round. Each round offers one more of every flavour the box
 * holds fewest of, in a random order. A flavour the builder refuses is out of the plan for good,
 * because a box that only grows never makes room for it again, so the rounds end.
 */
export function planFill(bundle: BundleDetail, selections: SectionSelections, sectionId: number, variantIds: string[], empty: number, random: () => number): string[] {
    const builder = createBundleBuilder(bundle, { initialSelections: selections });
    const picks: string[] = [];
    let open = [...new Set(variantIds)];
    while (picks.length < empty && open.length > 0) {
        const held = new Map((builder.getState().selections[sectionId] ?? []).map((pick) => [pick.variantId, pick.quantity]));
        const inBox = (variantId: string) => held.get(variantId) ?? 0;
        const fewest = Math.min(...open.map(inBox));
        const refused = new Set<string>();
        for (const variantId of shuffled(open.filter((candidate) => inBox(candidate) === fewest), random)) {
            if (picks.length === empty) break;
            if (builder.addItem(sectionId, variantId, 1) > 0) picks.push(variantId);
            else refused.add(variantId);
        }
        open = open.filter((variantId) => !refused.has(variantId));
    }
    return picks;
}
