/*
 * Every piece's option choice (its size and colour), held once for the whole set.
 *
 * Held above the cards because three things change it: the card, the details dialog, and
 * "Match colours", which changes all three pieces at once. Each piece's choice is seeded when the
 * builder is created, from the variant a basket Edit restored or from the product's first buyable
 * colour, never from an effect after the first paint.
 *
 * A piece already in the set follows its choice: change its colour and the set now holds that
 * colour. That is a swap through the SDK's builder (remove the old variant, add the new), asked
 * first whether the new one can go in.
 */
import { useCallback, useMemo, useState } from 'react';

import type { OptionSelection } from '@kitenzo/react';

import type { ViewModel, ViewProduct, ViewSection } from '../model';
import { initialValues, parseNameList, resolve } from '../options';
import { pickOf, swapBlocked, type Blocked, type Selection } from '../selection';

export type ApplyOutcome = { kind: 'none' } | { kind: 'swapped'; title: string } | { kind: 'blocked'; reason: Blocked };

export interface Pieces {
    swatchNames: string[];
    valuesOf: (section: ViewSection, product: ViewProduct) => OptionSelection;
    /** Set a piece's choice and, if it is in the set, swap the set to match. */
    apply: (section: ViewSection, product: ViewProduct, next: OptionSelection) => ApplyOutcome;
}

export const pieceKey = (section: ViewSection, product: ViewProduct) => `${section.id}:${product.id}`;

export function usePieces(model: ViewModel, selection: Selection, swatchOptions: string, locked: boolean): Pieces {
    const swatchNames = useMemo(() => parseNameList(swatchOptions), [swatchOptions]);
    const seedFor = useCallback(
        (section: ViewSection, product: ViewProduct) => {
            const pick = pickOf(selection.builder.getState().selections, section.id, product);
            const chosen = pick ? product.variants.find((variant) => variant.id === pick.variantId) : undefined;
            return initialValues(product.product, swatchNames, chosen);
        },
        [selection.builder, swatchNames],
    );

    const [values, setValues] = useState<Record<string, OptionSelection>>(() => {
        const seeded: Record<string, OptionSelection> = {};
        for (const section of model.sections) for (const product of section.products) seeded[pieceKey(section, product)] = seedFor(section, product);
        return seeded;
    });

    const valuesOf = useCallback((section: ViewSection, product: ViewProduct) => values[pieceKey(section, product)] ?? seedFor(section, product), [values, seedFor]);

    const apply = useCallback(
        (section: ViewSection, product: ViewProduct, next: OptionSelection): ApplyOutcome => {
            if (locked) return { kind: 'none' };
            setValues((current) => ({ ...current, [pieceKey(section, product)]: next }));
            // Read the builder live, not this render's snapshot: "Match colours" applies three
            // pieces in one handler, and each swap has to see the one before it.
            const selections = selection.builder.getState().selections;
            const pick = pickOf(selections, section.id, product);
            if (!pick) return { kind: 'none' };
            const { variant } = resolve(product.product, next);
            if (!variant || variant.id === pick.variantId) return { kind: 'none' };
            const reason = swapBlocked(model, selections, section, pick.variantId, variant);
            if (reason) return { kind: 'blocked', reason };
            selection.builder.removeItem(section.id, pick.variantId);
            selection.builder.addItem(section.id, variant.id, pick.quantity);
            return { kind: 'swapped', title: variant.title };
        },
        [locked, model, selection.builder],
    );

    return useMemo(() => ({ swatchNames, valuesOf, apply }), [swatchNames, valuesOf, apply]);
}
