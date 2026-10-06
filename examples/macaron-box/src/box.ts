/*
 * The box: which sizes the bundle sells, what each costs, and which slot each pick sits in.
 *
 * Every size is the SDK's reading of the bundle's limit rules. A count window carries
 * `allowedCounts` when the rules name exact counts ("6, 12 or 24"): the valid ones, smallest
 * first, without any the step's other rules exclude. So no size is typed anywhere: a bundle of 4
 * or 8 draws two boxes, a bundle whose rules name no exact count draws none. Whether a selection
 * is a valid box is the SDK's call too (`isSatisfied`).
 *
 * Every price comes from the SDK: a box's price is `getBundlePrice` on a box of that size, so
 * tiers, set prices, percentages, surcharges and markets all price exactly as the total and the
 * cart will.
 */
import { getBundlePrice, isVariantBuyable, type BundleDetail, type BundlePriceOptions, type MoneyFormatter, type SectionSelections } from '@kitenzo/react';

import type { ViewModel, ViewSection } from './model';

/**
 * The box sizes a step sells, smallest first: the exact counts its own rules allow, or the
 * bundle-wide ones when the bundle has a single step. A bundle-wide count includes the products
 * every bundle comes with, so those are taken off: "exactly 7" with one included is a box of 6.
 */
export function boxSizes(model: ViewModel, section: ViewSection): number[] {
    if (section.limits.allowedCounts) return section.limits.allowedCounts;
    if (model.bundle.sections.length !== 1) return [];
    return (model.bundleLimits.allowedCounts ?? []).map((count) => count - model.requiredQuantity).filter((size) => size > 0);
}

export interface BoxOffer {
    size: number;
    /** The least a box of this size costs, in display currency. */
    price: number;
    /** Before the bundle's discount, when there is one. */
    compareAt: number | null;
    perItem: number;
    /** False when the price depends on the flavours chosen: `price` is then where it starts. */
    exact: boolean;
}

/**
 * Price each size with the SDK, on sample boxes filled with one flavour each.
 *
 * What a box costs can depend on what goes in it: flavours priced apart under a percentage or
 * money-off discount, or a flavour whose surcharge the SDK adds on top of any discount, a set
 * price included. Working out which case this is would be the SDK's pricing done twice, so the
 * samples are priced instead: one flavour for each distinct pair of price and surcharge, since two
 * flavours alike in both fill a box that costs the same. A size is `exact` when every sample costs
 * the same, and otherwise quotes the lowest as its "from".
 *
 * A discount ladder (`getDiscountLadder`) names each tier's set price, but not the price before
 * it, and says nothing for a bundle whose sizes are not tiers. Pricing the box itself answers for
 * every discount there is.
 *
 * `pricing` is what the total is priced with (the shop's settings, the page's language), so a
 * card and the total always agree.
 */
export function boxOffers(
    bundle: BundleDetail,
    section: ViewSection,
    sizes: number[],
    money: Pick<MoneyFormatter, 'unitPrice' | 'surcharge'>,
    pricing: Pick<BundlePriceOptions, 'settings' | 'locale'>,
): BoxOffer[] {
    const samples = new Map<string, string>();
    for (const variant of section.products.flatMap((product) => product.variants).filter(isVariantBuyable)) {
        const pair = `${money.unitPrice(variant)}+${money.surcharge(variant)}`;
        if (!samples.has(pair)) samples.set(pair, variant.id);
    }

    return sizes.flatMap((size) => {
        const priced = [...samples.values()]
            .map((variantId) => getBundlePrice(bundle, { [section.id]: [{ variantId, quantity: size }] }, pricing))
            .flatMap((price) => (price.amounts ? [{ amounts: price.amounts, hasDiscount: price.hasDiscount }] : []));
        const lowest = priced.reduce<(typeof priced)[number] | null>((best, sample) => (best === null || sample.amounts.discounted < best.amounts.discounted ? sample : best), null);
        if (lowest === null) return [];
        const price = lowest.amounts.discounted;
        return [
            {
                size,
                price,
                compareAt: lowest.hasDiscount ? lowest.amounts.original : null,
                perItem: price / size,
                exact: priced.every((sample) => sample.amounts.discounted === price),
            },
        ];
    });
}

/** What a flavour in the box says about money. */
export type FlavourPricing = 'price' | 'surcharge' | 'none';

/**
 * A flavour's own price is shown only where it is what the shopper pays for it.
 *
 * In a box whose every size has one price, whatever goes in, the size cards carry the price and a
 * flavour says nothing (`none`). In a box sold at a set price that some flavours add to, a
 * flavour's price is still not what anyone pays, so it says only what it adds (`surcharge`).
 * Anywhere else (no sizes to choose, or a discount taken off each flavour's own price) the
 * flavour shows its price.
 */
export function flavourPricing(bundle: BundleDetail, sizes: number[], offers: BoxOffer[]): FlavourPricing {
    if (sizes.length === 0) return 'price';
    if (offers.length > 0 && offers.every((offer) => offer.exact)) return 'none';
    return bundle.discount?.type === 'price' ? 'surcharge' : 'price';
}

/** The step the box is built in: the one with sizes to choose, else the first that sells anything. */
export function boxSection(model: ViewModel): ViewSection | null {
    return (
        model.sections.find((section) => boxSizes(model, section).length > 0) ??
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

/** The quantities a pick order stands for, as the builder holds them. */
export function selectionsOf(order: Placed[]): SectionSelections {
    const selections: SectionSelections = {};
    for (const { sectionId, variantId } of order) {
        const picks = (selections[sectionId] ??= []);
        const pick = picks.find((candidate) => candidate.variantId === variantId);
        if (pick) pick.quantity += 1;
        else picks.push({ variantId, quantity: 1 });
    }
    return selections;
}

/**
 * Which placements to take out so a box of `size` can hold the tray: the most recent first, the
 * order a shopper undoes things in. Empty when the tray already fits.
 */
export function overflowOf(order: Placed[], sectionId: number, size: number): { index: number; entry: Placed }[] {
    const inBox = order.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.sectionId === sectionId);
    return inBox.slice(size).reverse();
}
