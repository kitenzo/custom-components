/*
 * What the shopper's selection means for the page: which counts are still owed, when a step is
 * done, and what choosing a product in a one-pick step does.
 *
 * Selection, validation and pricing are the SDK's (`useBundleBuilder`). It takes only what fits
 * (a step's and the bundle's maximums, per-product caps, stock), says why one more will not go in
 * (`blockedReason`) or why a swap will not happen (`swapBlockedReason`), and counts what is still
 * owed (`progress`), required products included. This file only reads those answers; it never
 * counts picks against a rule itself.
 */
import type { AddBlockedReason, SectionSelections, SelectionProgress, UseBundleBuilderResult } from '@kitenzo/react';

import type { ViewSection } from './model';

export interface Missing {
    /** `null` for the bundle-wide count. */
    section: ViewSection | null;
    count: number;
}

/** How many the shopper has picked, without the required products the SDK adds on submit. */
export function pickedCount(progress: SelectionProgress): number {
    return progress.quantity - progress.requiredQuantity;
}

/** What still has to be picked, step by step, then bundle-wide, in the order the page shows them. */
export function missingPicks(sections: ViewSection[], progress: SelectionProgress): Missing[] {
    const missing: Missing[] = [];
    for (const section of sections) {
        const count = progress.sections[section.id]?.missing ?? 0;
        if (count > 0) missing.push({ section, count });
    }
    if (progress.missing > 0) missing.push({ section: null, count: progress.missing });
    return missing;
}

/**
 * The step holds picks and its own count is acceptable: what the page marks as done.
 *
 * Acceptable is the SDK's word (`missing === 0`), not `count >= min`: with "6, 12 or 24" a step
 * holding 7 is inside its window and still owes 5.
 */
export function isStepDone(section: ViewSection, progress: SelectionProgress): boolean {
    const step = progress.sections[section.id];
    return step !== undefined && step.quantity > 0 && step.missing === 0;
}

/**
 * Nothing more to do in the step, so a step the merchant set to advance can move the shopper on.
 * A step with a ceiling is finished when it is full; one without, when its minimum is met.
 */
export function isStepFinished(section: ViewSection, progress: SelectionProgress): boolean {
    const step = progress.sections[section.id];
    if (step === undefined) return false;
    if (section.limits.max !== null) return step.quantity >= section.limits.max;
    return section.limits.isRequired && step.missing === 0;
}

/** A step that holds one product at most (the box, the card): choosing another swaps it in. */
export function isSingleChoice(section: ViewSection): boolean {
    return section.limits.max === 1;
}

export interface Choice {
    /** The variant this one takes the place of: the pick a one-pick step holds. `null` for a plain add. */
    replaces: string | null;
    /** Why the SDK will not take it, as that swap or as one more, or null when it will. */
    blocked: AddBlockedReason | null;
}

/**
 * What pressing a variant's button in a step would do, and whether the SDK allows it.
 *
 * In a one-pick step that holds another pick, choosing is a swap: the pick that leaves makes the
 * room. So the question is the swap's (`swapBlockedReason`), not one more's: `blockedReason` would
 * call the step full, and under "one per product" refuse another colour of the chosen box.
 */
export function choiceFor(
    section: ViewSection,
    selections: SectionSelections,
    variantId: string,
    builder: Pick<UseBundleBuilderResult, 'blockedReason' | 'swapBlockedReason'>,
): Choice {
    const held = isSingleChoice(section) ? (selections[section.id] ?? [])[0] : undefined;
    if (held && held.variantId !== variantId) return { replaces: held.variantId, blocked: builder.swapBlockedReason(section.id, held.variantId, variantId) };
    return { replaces: null, blocked: builder.blockedReason(section.id, variantId) };
}
