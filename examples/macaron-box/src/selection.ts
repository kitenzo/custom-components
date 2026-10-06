/*
 * What the shopper's selection means for the page, and the two things a box adds to it.
 *
 * Selection, validation and pricing are the SDK's (`useBundleBuilder`). It takes only what fits
 * (a step's and the bundle's maximums, per-product caps, stock), says why one more will not go in
 * (`blockedReason`), and counts what is still owed (`progress`), required products included. This
 * file only reads those answers; it never counts picks against a rule itself.
 *
 * A box adds the order the macarons were picked in, because the builder holds a quantity per
 * variant and the tray shows one macaron per slot, and the box the shopper chose, because the
 * builder holds a step at its largest allowed count and has no notion of aiming for a smaller
 * one.
 */
import { useCallback, useState } from 'react';

import type { AddBlockedReason, SectionSelections, SelectionProgress, UseBundleBuilderResult } from '@kitenzo/react';

import { overflowOf, reconcileOrder, selectionsOf, type Placed } from './box';
import type { ViewSection } from './model';

/** The SDK's reasons, and `box-full`: the box the shopper chose is full, though a bigger one would take more. */
export type Blocked = AddBlockedReason | 'box-full';

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

/**
 * Why one more will not go into the box step, given the SDK's own answer.
 *
 * The SDK's reason always comes first: it knows stock, caps and the step's ceiling, and at the
 * largest box its "step full" is the right thing to say, because there is no bigger box to offer.
 * Only when the SDK would take one more does the chosen box get a say.
 */
export function blockedInBox(reason: AddBlockedReason | null, inBox: number, size: number | null): Blocked | null {
    if (reason !== null) return reason;
    return size !== null && inBox >= size ? 'box-full' : null;
}

export interface PickOrder {
    /** One entry per macaron, in the order the shopper picked them: see `reconcileOrder`. */
    order: Placed[];
    /** Add these to a step one at a time, in this order. Returns how many the builder took. */
    place: (sectionId: number, variantIds: string[]) => number;
    /** Take one macaron out of one slot: that slot empties, not the newest of its flavour. */
    removeAt: (index: number) => void;
    /** Take the most recent picks out of a step until `size` are left. */
    shrinkTo: (sectionId: number, size: number) => void;
}

/**
 * The order the macarons were picked in, beside the builder that holds how many of each.
 *
 * The order follows the builder: whatever it holds after a change is what the order is trimmed or
 * extended to, so the two cannot drift. It is state, brought up to date while rendering whenever
 * the builder hands over a new selection (React renders again at once with the result, before
 * anything is drawn), so no render writes anywhere but through `setState`. A change made through
 * `place`, `removeAt` or `shrinkTo` sets the order first, and the reconciling render then agrees
 * with it.
 */
export function usePickOrder({ selections, addItem, updateQuantity, setSelections }: Pick<UseBundleBuilderResult, 'selections' | 'addItem' | 'updateQuantity' | 'setSelections'>): PickOrder {
    const [held, setHeld] = useState<{ order: Placed[]; of: SectionSelections }>(() => ({ order: reconcileOrder([], selections), of: selections }));
    let order = held.order;
    if (held.of !== selections) {
        order = reconcileOrder(held.order, selections);
        setHeld({ order, of: selections });
    }

    const place = useCallback(
        (sectionId: number, variantIds: string[]) => {
            const taken = variantIds.filter((variantId) => addItem(sectionId, variantId, 1) > 0);
            if (taken.length > 0) setHeld((current) => ({ ...current, order: [...current.order, ...taken.map((variantId) => ({ sectionId, variantId }))] }));
            return taken.length;
        },
        [addItem],
    );

    const removeAt = useCallback(
        (index: number) => {
            const entry = order[index];
            if (!entry) return;
            const left = order.filter((_, position) => position !== index);
            setHeld((current) => ({ ...current, order: left }));
            updateQuantity(entry.sectionId, entry.variantId, left.filter((other) => other.sectionId === entry.sectionId && other.variantId === entry.variantId).length);
        },
        [order, updateQuantity],
    );

    const shrinkTo = useCallback(
        (sectionId: number, size: number) => {
            const dropped = new Set(overflowOf(order, sectionId, size).map(({ index }) => index));
            if (dropped.size === 0) return;
            const left = order.filter((_, position) => !dropped.has(position));
            setHeld((current) => ({ ...current, order: left }));
            setSelections(selectionsOf(left));
        },
        [order, setSelections],
    );

    return { order, place, removeAt, shrinkTo };
}
