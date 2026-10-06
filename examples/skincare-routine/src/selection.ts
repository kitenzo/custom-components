/*
 * What the shopper's selection means for the page: which counts are still owed, when a step is
 * done, and which step the wizard shows.
 *
 * Selection, validation and pricing are the SDK's (`useBundleBuilder`). It takes only what fits
 * (a step's and the bundle's maximums, per-product caps, stock), says why one more will not go in
 * (`blockedReason`), counts what is still owed (`progress`), required products included, and
 * replaces a pick in a full step (`swapItem`) or says why it will not (`swapBlockedReason`). This
 * file only reads those answers; it never counts picks against a rule itself.
 *
 * A step whose rule allows exactly one product ("pick a cleanser") is a choice, not a counter:
 * choosing another product swaps it in, so a full one-pick step is never "full" to the shopper.
 */
import type { SelectionProgress } from '@kitenzo/react';

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

/** A step that holds one product at most: choosing another swaps it in. */
export function isSingleChoice(section: ViewSection): boolean {
    return section.limits.max === 1;
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
 * The step holds picks and its own count is acceptable: what a step pill marks as done.
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

/**
 * The first step on screen after `sectionId`, or null when it was the last.
 *
 * `order` is the bundle's own step order, and `shown` the steps the wizard draws, which is fewer
 * whenever the conditions engine hides one or a step has nothing to offer. So "the next step" is
 * looked up in the bundle's order, and `sectionId` itself need not be on screen.
 */
export function nextShownStep(order: readonly { id: number }[], shown: ViewSection[], sectionId: number): ViewSection | null {
    const at = order.findIndex((section) => section.id === sectionId);
    if (at < 0) return null;
    for (const { id } of order.slice(at + 1)) {
        const step = shown.find((section) => section.id === id);
        if (step) return step;
    }
    return null;
}

/**
 * The step the wizard shows for the step the builder is on: that step when it is on screen,
 * otherwise the nearest one after it, so a shopper whose next step was just hidden moves forward
 * rather than back to the start. With none after it, the last one on screen.
 */
export function nearestShownStep(order: readonly { id: number }[], shown: ViewSection[], sectionId: number | undefined): ViewSection | null {
    if (sectionId === undefined) return shown[0] ?? null;
    return shown.find((section) => section.id === sectionId) ?? nextShownStep(order, shown, sectionId) ?? shown.at(-1) ?? null;
}
