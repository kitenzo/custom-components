/*
 * The box: which sizes the bundle sells, what each costs, and which slot each pick sits in.
 *
 * Every size comes from the bundle's own limit rules. Several `eq` rules on one step are
 * alternatives ("exactly 6, 12 or 24"), and `getSectionLimits` can only report them as a window
 * (6 to 24) because a window is all `PickLimits` can say. So the sizes are read off the rules
 * here, once, and never typed anywhere: a bundle of 4 or 8 draws two boxes, a bundle with no `eq`
 * rule draws none. Whether a selection is a valid box is still the SDK's call (`isSatisfied`).
 *
 * Every price comes from the SDK: a box's price is `calculatePrice` on a box of that size, so
 * tiers, set prices, percentages and markets all price exactly as the cart will.
 */
import {
    calculatePrice,
    getBundleLimits,
    getSectionLimits,
    resolvePresentmentPricing,
    type BundleDetail,
    type BundleVariant,
    type SectionSelections,
} from '@kitenzo/react';

import type { ViewModel, ViewSection } from './model';

/**
 * The box sizes a step sells, smallest first: its `eq` alternatives, or the bundle-wide ones when
 * the bundle has a single step. A size the other rules rule out (an `eq 24` beside an `lte 12`)
 * is not offered, because no box of that size could ever be added to the cart.
 */
export function boxSizes(bundle: BundleDetail, sectionId: number): number[] {
    const eqValues = (matches: (ruleSectionId: number | null) => boolean) =>
        (bundle.limitRules ?? [])
            .filter((rule) => rule.type === 'total-number-of-products' && rule.operation === 'eq' && matches(rule.sectionId))
            .map((rule) => Number.parseFloat(rule.value))
            .filter((value) => Number.isInteger(value) && value > 0);

    let values = eqValues((ruleSectionId) => ruleSectionId === sectionId);
    if (values.length === 0 && bundle.sections.length === 1) values = eqValues((ruleSectionId) => ruleSectionId === null);

    const step = getSectionLimits(bundle, sectionId);
    const whole = getBundleLimits(bundle);
    const fits = (size: number) => size >= step.min && size <= step.max && size >= whole.min && size <= whole.max;
    return [...new Set(values)].filter(fits).sort((a, b) => a - b);
}

export interface BoxOffer {
    size: number;
    /** What a box of this size costs, in display currency. */
    price: number;
    /** Before the bundle's discount, when there is one. */
    compareAt: number | null;
    perItem: number;
    /** False when the price depends on the flavours chosen (a percentage off mixed prices). */
    exact: boolean;
}

/**
 * Price each size with the SDK, on a box filled with the cheapest flavour on offer. For a set
 * price (this bundle) that IS the price, whatever goes in; when flavours cost different amounts
 * under a percentage or money-off discount it is the lowest the box can cost, and `exact` says so.
 */
export function boxOffers(bundle: BundleDetail, section: ViewSection, sizes: number[]): BoxOffer[] {
    const variants = section.products.flatMap((product) => product.variants).filter((variant) => variant.available);
    if (variants.length === 0) return [];
    const unit = (variant: BundleVariant) => Number.parseFloat(variant.presentmentPrice ?? variant.price) || 0;
    const cheapest = variants.reduce((best, variant) => (unit(variant) < unit(best) ? variant : best));
    const samePrice = variants.every((variant) => unit(variant) === unit(cheapest));
    const setPrice = bundle.discount?.type === 'price';

    return sizes.map((size) => {
        const sample: SectionSelections = { [section.id]: [{ variantId: cheapest.id, quantity: size }] };
        const base = calculatePrice(bundle, sample);
        // The same localisation `useBundlePrice` applies, so a card and the total always agree.
        const priced = resolvePresentmentPricing(bundle, sample, base) ?? base;
        const price = Number.parseFloat(priced.discountedPrice) || 0;
        const original = Number.parseFloat(priced.originalPrice) || 0;
        return {
            size,
            price,
            compareAt: original > price ? original : null,
            perItem: price / size,
            exact: setPrice || samePrice,
        };
    });
}

/** The step the box is built in: the one with sizes to choose, else the first that sells anything. */
export function boxSection(model: ViewModel): ViewSection | null {
    return (
        model.sections.find((section) => boxSizes(model.bundle, section.id).length > 0) ??
        model.sections.find((section) => section.products.length > 0) ??
        null
    );
}

/** The smallest size that holds `count`, or the largest when none does. */
export function sizeFor(sizes: number[], count: number): number | null {
    if (sizes.length === 0) return null;
    return sizes.find((size) => size >= count) ?? sizes[sizes.length - 1]!;
}

/**
 * Columns for a tray of `slots`: the divisor of `slots` nearest a slightly landscape shape, so
 * every row is full (6 is 3 by 2, 12 is 4 by 3, 24 is 6 by 4, 8 is 4 by 2), never wider than 6.
 */
export function trayColumns(slots: number): number {
    if (slots <= 3) return Math.max(1, slots);
    const ideal = Math.sqrt(slots * 1.5);
    let best = 1;
    for (let columns = 1; columns <= Math.min(6, slots); columns += 1) {
        if (slots % columns === 0 && Math.abs(columns - ideal) <= Math.abs(best - ideal)) best = columns;
    }
    // A prime count (7, 11) has no tidy shape; fall back to the ideal width.
    return best === 1 ? Math.min(6, Math.ceil(ideal)) : best;
}

export interface Placed {
    sectionId: number;
    variantId: string;
}

/**
 * Pick order, kept in step with the builder's selection.
 *
 * The builder stores a quantity per variant; the tray shows one macaron per slot in the order the
 * shopper chose them. Reconciling after every change keeps each existing placement where it is,
 * drops the most recent placements of a variant whose quantity fell, and appends new ones at the
 * end. A removal from a particular slot is made on the order first (`removeAt`), so it is that
 * slot that empties, not the newest of that flavour.
 */
export function reconcileOrder(order: Placed[], selections: SectionSelections): Placed[] {
    const key = (sectionId: number, variantId: string) => `${sectionId}:${variantId}`;
    const want = new Map<string, number>();
    for (const [sectionId, picks] of Object.entries(selections)) {
        for (const pick of picks) want.set(key(Number(sectionId), pick.variantId), (want.get(key(Number(sectionId), pick.variantId)) ?? 0) + pick.quantity);
    }
    const kept: Placed[] = [];
    const seen = new Map<string, number>();
    for (const entry of order) {
        const id = key(entry.sectionId, entry.variantId);
        const count = seen.get(id) ?? 0;
        if (count < (want.get(id) ?? 0)) {
            kept.push(entry);
            seen.set(id, count + 1);
        }
    }
    for (const [sectionId, picks] of Object.entries(selections)) {
        for (const pick of picks) {
            const id = key(Number(sectionId), pick.variantId);
            for (let index = seen.get(id) ?? 0; index < pick.quantity; index += 1) kept.push({ sectionId: Number(sectionId), variantId: pick.variantId });
            seen.set(id, Math.max(seen.get(id) ?? 0, pick.quantity));
        }
    }
    return kept;
}

/**
 * Which placements to take out so a box of `size` can hold the tray: the most recent first, the
 * order a shopper undoes things in. Empty when the tray already fits.
 */
export function overflowOf(order: Placed[], sectionId: number, size: number): { index: number; entry: Placed }[] {
    const inBox = order.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.sectionId === sectionId);
    return inBox.slice(size).reverse();
}
