/*
 * The shopper's selection: the SDK's builder, plus the answers a UI needs on every render.
 *
 * Selection, validation and pricing are the SDK's (`createBundleBuilder`). This file adds only
 * what the SDK leaves to the UI: how many of a variant are already picked across the bundle, why
 * one more cannot go in, and what is still missing, phrased per step.
 *
 * The builder is created WITH its opening selection (a basket Edit, a quiz result), never filled
 * from an effect after the first paint: an effect paints an empty bundle for one frame, and a
 * shopper who taps in that frame adds to the wrong state.
 */
import { useMemo, useSyncExternalStore } from 'react';

import { createBundleBuilder, type BundleBuilderCore, type BundleVariant, type SectionSelections } from '@kitenzo/react';

import type { ViewModel, ViewSection } from './model';

export type Blocked = 'sold-out' | 'stock' | 'step-full' | 'bundle-full';

export interface Missing {
    /** `null` for the bundle-wide count. */
    section: ViewSection | null;
    count: number;
}

/** Variant id → quantity, summed over every step (stock is per variant, not per step). */
export function quantitiesOf(selections: SectionSelections): Map<string, number> {
    const totals = new Map<string, number>();
    for (const picks of Object.values(selections)) {
        for (const pick of picks) totals.set(pick.variantId, (totals.get(pick.variantId) ?? 0) + pick.quantity);
    }
    return totals;
}

export function countOf(selections: SectionSelections, sectionId?: number): number {
    const entries = sectionId === undefined ? Object.values(selections) : [selections[sectionId] ?? []];
    return entries.flat().reduce((total, pick) => total + pick.quantity, 0);
}

/**
 * Why one more of `variant` cannot go into `section`, or null when it can.
 *
 * The order matters: the reason a shopper can act on comes first. "Sold out" beats "step full",
 * because removing something else will not make a sold-out product addable.
 */
export function blockedReason(model: ViewModel, selections: SectionSelections, section: ViewSection, variant: BundleVariant): Blocked | null {
    if (!variant.available) return 'sold-out';
    const stock = variant.maxOrderableQuantity;
    if (stock !== null && stock !== undefined && (quantitiesOf(selections).get(variant.id) ?? 0) >= stock) return 'stock';
    if (countOf(selections, section.id) >= section.limits.max) return 'step-full';
    if (countOf(selections) + model.requiredCount >= model.bundleLimits.max) return 'bundle-full';
    return null;
}

/** What still has to be picked, step by step, then bundle-wide. Hidden steps need nothing. */
export function missingPicks(model: ViewModel, selections: SectionSelections, hiddenSectionIds: number[] = []): Missing[] {
    const missing: Missing[] = [];
    for (const section of model.sections) {
        if (hiddenSectionIds.includes(section.id)) continue;
        const short = section.limits.min - countOf(selections, section.id);
        if (short > 0) missing.push({ section, count: short });
    }
    const bundleShort = model.bundleLimits.min - countOf(selections) - model.requiredCount;
    if (bundleShort > 0) missing.push({ section: null, count: bundleShort });
    return missing;
}

/**
 * The seed, trimmed to what the shopper could have picked by hand: variants this bundle still
 * offers in that step and that are in stock, capped at stock and at each step's maximum. A seed
 * comes from a saved cart line or a quiz, written against some earlier copy of the bundle.
 */
export function clampSeed(model: ViewModel, seed: SectionSelections | null): SectionSelections {
    const clamped: SectionSelections = {};
    if (!seed) return clamped;
    let bundleRoom = model.bundleLimits.max - model.requiredCount;
    for (const section of model.sections) {
        let room = section.limits.max;
        for (const pick of seed[section.id] ?? []) {
            const variant = section.products
                .filter((product) => !product.soldOut)
                .flatMap((product) => product.variants)
                .find((candidate) => candidate.id === pick.variantId);
            if (!variant?.available) continue;
            const already = quantitiesOf(clamped).get(variant.id) ?? 0;
            const stock = variant.maxOrderableQuantity ?? Number.POSITIVE_INFINITY;
            const quantity = Math.min(Math.trunc(pick.quantity), room, bundleRoom, stock - already);
            if (!(quantity > 0)) continue;
            (clamped[section.id] ??= []).push({ variantId: variant.id, quantity });
            room -= quantity;
            bundleRoom -= quantity;
        }
    }
    return clamped;
}

export interface Selection {
    builder: BundleBuilderCore;
    selections: SectionSelections;
    isSatisfied: boolean;
    conditions: ReturnType<BundleBuilderCore['getState']>['conditions'];
    errors: ReturnType<BundleBuilderCore['getState']>['errors'];
}

/** The builder for this bundle, seeded at creation. A new bundle (another market) is a new builder. */
export function useSelection(model: ViewModel, seed: SectionSelections | null): Selection {
    const builder = useMemo(() => {
        const made = createBundleBuilder(model.bundle);
        const start = clampSeed(model, seed);
        for (const [sectionId, picks] of Object.entries(start)) {
            for (const pick of picks) made.addItem(Number(sectionId), pick.variantId, pick.quantity);
        }
        return made;
        // The seed is read once, at creation, on purpose: it is not a dependency.
    }, [model.bundle]);
    const state = useSyncExternalStore(builder.subscribe, builder.getState, builder.getState);
    return {
        builder,
        selections: state.selections,
        isSatisfied: state.isSatisfied,
        conditions: state.conditions,
        errors: state.errors,
    };
}
