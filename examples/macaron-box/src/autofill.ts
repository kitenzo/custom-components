/*
 * "Fill the rest": the patissier's choice for the slots the shopper left empty.
 *
 * Planning is a pure function of what is on offer, what is already in the box and a random
 * source, so a test can fix the seed and know the exact plan. Applying the plan is the UI's job,
 * one `builder.addItem` per macaron, which keeps every rule the engine enforces in the engine.
 *
 * The plan only ever fills empty slots (it never swaps out a flavour the shopper chose), never
 * picks a sold-out flavour, and never takes a flavour past its stock: a flavour at its ceiling is
 * skipped entirely. It spreads the box across flavours, fewest-in-the-box first, so a dozen
 * becomes an assortment rather than twelve of whatever came up first.
 */

export interface FillCandidate {
    variantId: string;
    /** In the box already. */
    inBox: number;
    /** How many more stock allows: `Infinity` when nobody counts. 0 for sold out or capped. */
    room: number;
}

export interface FillPlan {
    /** One variant id per macaron to add, in the order to add them. */
    picks: string[];
    /** Slots the plan could not fill, because stock ran out before the box did. */
    unfilled: number;
}

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

/**
 * Plan `empty` picks. Bounded twice: by `empty`, and by an iteration cap that holds even if a
 * caller hands in a candidate list that never runs out (a bug elsewhere should cost a short box,
 * not a frozen tab).
 */
export function planFill(candidates: FillCandidate[], empty: number, random: () => number, maxIterations = 500): FillPlan {
    const pool = candidates.filter((candidate) => candidate.room > 0).map((candidate) => ({ ...candidate }));
    const picks: string[] = [];
    let iterations = 0;
    while (picks.length < empty && iterations < maxIterations) {
        iterations += 1;
        const open = pool.filter((candidate) => candidate.room > 0);
        if (open.length === 0) break;
        const fewest = Math.min(...open.map((candidate) => candidate.inBox));
        const tied = open.filter((candidate) => candidate.inBox === fewest);
        const chosen = tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))]!;
        picks.push(chosen.variantId);
        chosen.inBox += 1;
        chosen.room -= 1;
    }
    return { picks, unfilled: Math.max(0, empty - picks.length) };
}
