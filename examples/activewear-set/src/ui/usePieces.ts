/*
 * Every piece's choice (its size and colour), held once for the whole set.
 *
 * Held above the cards because three things change it: the card, the details dialog, and
 * "Match colours", which changes all three pieces at once.
 *
 * A piece in the set shows the variant the set holds, read from the selection on every render
 * (../pieces.ts), so a card can never show a colour the set does not hold. The state here is only
 * what the shopper last chose for a piece that is not in the set. It also remembers a piece's
 * choice after it leaves the set: it is seeded from a basket Edit when the builder is created
 * (never from an effect after the first paint) and follows every change the builder accepted.
 */
import { useCallback, useMemo, useState } from 'react';

import type { BundleVariant, OptionSelection, SectionSelections, UseBundleBuilderResult } from '@kitenzo/react';

import type { ViewModel, ViewProduct, ViewSection } from '../model';
import { initialValues, resolve } from '../options';
import { changePiece, pickedVariant, shownValues, shownVariant, type ChangeOutcome } from '../pieces';

export interface Pieces {
    /** The option values a piece shows. */
    valuesOf: (section: ViewSection, product: ViewProduct) => OptionSelection;
    /** The variant shown for a product with no option data, whose choice is a variant. */
    variantOf: (section: ViewSection, product: ViewProduct) => BundleVariant;
    /** Set a piece's option values and, if it is in the set, swap the set to match. */
    apply: (section: ViewSection, product: ViewProduct, next: OptionSelection) => ChangeOutcome;
    /** The same for a product with no option data. */
    applyVariant: (section: ViewSection, product: ViewProduct, variantId: string) => ChangeOutcome;
}

/** What the shopper last chose on a card: option values, or a variant for a product without option data. */
interface Browsed {
    values?: OptionSelection;
    variantId?: string;
}

export const pieceKey = (section: ViewSection, product: ViewProduct) => `${section.id}:${product.id}`;

export function usePieces(
    model: ViewModel,
    selections: SectionSelections,
    { swapItem, swapBlockedReason }: Pick<UseBundleBuilderResult, 'swapItem' | 'swapBlockedReason'>,
    swatchNames: string[],
    locked: boolean,
): Pieces {
    const [browsed, setBrowsed] = useState<Record<string, Browsed>>(() => {
        const seeded: Record<string, Browsed> = {};
        for (const section of model.sections) {
            for (const product of section.products) {
                const picked = pickedVariant(selections, section, product);
                if (picked) seeded[pieceKey(section, product)] = { values: initialValues(product.product, swatchNames, picked), variantId: picked.id };
            }
        }
        return seeded;
    });

    const valuesOf = useCallback(
        (section: ViewSection, product: ViewProduct) => shownValues(product.product, swatchNames, pickedVariant(selections, section, product), browsed[pieceKey(section, product)]?.values),
        [selections, browsed, swatchNames],
    );
    const variantOf = useCallback(
        (section: ViewSection, product: ViewProduct) => shownVariant(product.product, pickedVariant(selections, section, product), browsed[pieceKey(section, product)]?.variantId),
        [selections, browsed],
    );

    // "Match colours" changes several pieces in one handler, before the next render. Each piece is
    // its own pick in its own step, so the selection as rendered still names the pick to replace,
    // and the builder judges each swap against the swaps before it.
    const change = useCallback(
        (section: ViewSection, product: ViewProduct, target: BundleVariant | null, choice: Browsed): ChangeOutcome => {
            if (locked) return { kind: 'none' };
            const outcome = changePiece({ swapItem, swapBlockedReason }, section.id, pickedVariant(selections, section, product), target);
            // A refused change is not remembered: the piece stays what the set holds.
            if (outcome.kind !== 'blocked') setBrowsed((current) => ({ ...current, [pieceKey(section, product)]: { ...current[pieceKey(section, product)], ...choice } }));
            return outcome;
        },
        [locked, selections, swapItem, swapBlockedReason],
    );

    return useMemo<Pieces>(
        () => ({
            valuesOf,
            variantOf,
            apply: (section, product, next) => change(section, product, resolve(product.product, next).variant, { values: next }),
            applyVariant: (section, product, variantId) => change(section, product, product.variants.find((variant) => variant.id === variantId) ?? null, { variantId }),
        }),
        [valuesOf, variantOf, change],
    );
}
