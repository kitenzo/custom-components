/*
 * A piece's choice (its size and colour): what its card shows, and what changing it does to the
 * set.
 *
 * One rule keeps the card honest. A piece that is in the set shows the variant the set holds,
 * read from the selection, never a copy kept beside it. So when the builder refuses a change
 * (`swapItem` answers false), the card still shows what the shopper will be sent, and the reason
 * is the SDK's (`swapBlockedReason`). Only a piece that is not in the set has a choice of its own
 * to remember.
 *
 * Pure functions of the product, the selection and the builder's answers, so
 * test/pieces.test.ts drives them without a browser.
 */
import { isVariantBuyable, type AddBlockedReason, type BundleProduct, type BundleVariant, type OptionSelection, type SectionSelections, type UseBundleBuilderResult } from '@kitenzo/react';

import type { ViewProduct, ViewSection } from './model';
import { initialValues } from './options';
import { pickOf } from './selection';

/** The variant of this piece the set holds, if it holds one. */
export function pickedVariant(selections: SectionSelections, section: ViewSection, product: ViewProduct): BundleVariant | null {
    const pick = pickOf(selections, section.id, product);
    return pick ? (product.variants.find((variant) => variant.id === pick.variantId) ?? null) : null;
}

/**
 * The option values a piece's card shows: the picked variant's while the piece is in the set,
 * else what the shopper last chose on the card (`browsed`), else where a choice starts.
 */
export function shownValues(product: BundleProduct, swatchNames: string[], picked: BundleVariant | null, browsed: OptionSelection | undefined): OptionSelection {
    if (picked) return initialValues(product, swatchNames, picked);
    return browsed ?? initialValues(product, swatchNames);
}

/**
 * The same for a product with variants but no option data (an older API), whose choice is a
 * variant: the picked one, else the one last chosen on the card, else the first that can be bought.
 */
export function shownVariant(product: BundleProduct, picked: BundleVariant | null, browsedId: string | undefined): BundleVariant {
    return picked ?? product.variants.find((variant) => variant.id === browsedId) ?? product.variants.find(isVariantBuyable) ?? product.variants[0]!;
}

export type ChangeOutcome =
    /** Nothing in the set changed: the piece is not in it, or already is this variant. */
    | { kind: 'none' }
    | { kind: 'swapped'; title: string }
    /** The builder refused: the set holds what it held, and `reason` says why. */
    | { kind: 'blocked'; reason: AddBlockedReason };

/**
 * Change a piece to `target`. A piece in the set follows its choice: that is the builder's
 * `swapItem`, which replaces the piece in a step that is full of it. A refused swap leaves the
 * piece where it was, so the reason asked afterwards is the one that refused it.
 */
export function changePiece(
    builder: Pick<UseBundleBuilderResult, 'swapItem' | 'swapBlockedReason'>,
    sectionId: number,
    picked: BundleVariant | null,
    target: BundleVariant | null,
): ChangeOutcome {
    if (!picked || !target || target.id === picked.id) return { kind: 'none' };
    if (builder.swapItem(sectionId, picked.id, target.id)) return { kind: 'swapped', title: target.title };
    const reason = builder.swapBlockedReason(sectionId, picked.id, target.id);
    return reason ? { kind: 'blocked', reason } : { kind: 'none' };
}
