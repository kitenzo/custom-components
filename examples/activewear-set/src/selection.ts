/*
 * What the shopper's selection means for the page: which piece a step holds, which counts are
 * still owed, and when a step is done.
 *
 * Selection, validation and pricing are the SDK's (`useBundleBuilder`). It takes only what fits
 * (a step's and the bundle's maximums, per-product caps, stock), says why one more will not go in
 * (`blockedReason`), replaces a pick in a full step (`swapItem`) or says why it will not
 * (`swapBlockedReason`), and counts what is still owed (`progress`), required products included.
 * This file only reads those answers; it never counts picks against a rule itself.
 */
import type { BundleSelection, SectionSelections, SelectionProgress } from '@kitenzo/react';

import type { ViewProduct, ViewSection } from './model';

export interface Missing {
    /** `null` for the bundle-wide count. */
    section: ViewSection | null;
    count: number;
}

/** How many the shopper has picked, without the required products the SDK adds on submit. */
export function pickedCount(progress: SelectionProgress): number {
    return progress.quantity - progress.requiredQuantity;
}

/** This product's pick in this step, if it has one. A set takes one piece per step. */
export function pickOf(selections: SectionSelections, sectionId: number, product: ViewProduct): BundleSelection | null {
    return (selections[sectionId] ?? []).find((pick) => product.variants.some((variant) => variant.id === pick.variantId)) ?? null;
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
