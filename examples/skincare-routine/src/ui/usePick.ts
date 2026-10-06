/*
 * One product's picker: its option values, the variant they resolve to, how many of that variant
 * are in this step, and add/remove with a reason whenever the answer is no.
 *
 * Shared by the card and the details dialog so the two can never disagree about a product.
 *
 * In a one-pick step (every step of the routine) the picker is a choice: "Choose" swaps this
 * product in for whatever the step holds, and once a product is chosen its Size dropdown edits
 * the chosen line in place (swapping 75ml for 150ml) rather than browsing a variant that is not
 * in the routine. While chosen, the dropdown shows the chosen variant, read from the selection on
 * every render, so the card and the dialog can never show two different sizes of one pick.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { defaultOptionValues, isVariantBuyable, reachableOptionValues, resolveVariant, selectOptionValue, type AddBlockedReason, type BundleVariant, type OptionSelection } from '@kitenzo/react';

import { text } from '../content';
import type { ViewProduct, ViewSection } from '../model';
import { isSingleChoice } from '../selection';
import { useBuilder, useSelection } from './context';
import { blockedText } from './copy';

export interface OptionControl {
    name: string;
    value: string;
    values: { value: string; reachable: boolean }[];
}

export interface Pick {
    /** A one-pick step: "Choose" swaps, rather than "Add" counting up. */
    single: boolean;
    options: OptionControl[];
    /** For a product with variants but no option data (an older API): one choice per variant. */
    variantChoices: BundleVariant[] | null;
    setOption: (name: string, value: string) => void;
    setVariant: (variantId: string) => void;
    variant: BundleVariant;
    quantity: number;
    /**
     * Why this variant will not go into this step, from the SDK, or null when it will: as one more
     * in a step that counts, as the replacement of the step's pick in a one-pick step.
     */
    blocked: AddBlockedReason | null;
    /** A sentence for the shopper when something is refused or limited, else null. */
    message: string | null;
    add: () => void;
    remove: () => void;
}

function matches(variant: BundleVariant, product: ViewProduct['product'], values: OptionSelection): boolean {
    const options = product.options ?? [];
    return options.every((option, index) => values[option.name] === undefined || variant.optionValues?.[index] === values[option.name]);
}

function valuesOf(variant: BundleVariant, product: ViewProduct['product']): OptionSelection {
    return Object.fromEntries((product.options ?? []).map((option, index) => [option.name, variant.optionValues?.[index] ?? '']));
}

export function usePick(product: ViewProduct, section: ViewSection): Pick {
    const { content, onPicked, addItem, updateQuantity, swapItem, blockedReason, swapBlockedReason } = useBuilder();
    const { selections, locked } = useSelection();
    const options = product.product.options ?? [];
    const hasOptionData = options.length > 0 && product.variants.every((variant) => (variant.optionValues?.length ?? 0) === options.length);
    const single = isSingleChoice(section);
    const inStep = selections[section.id] ?? [];
    // The variant of this product the step holds, if any (a one-pick step holds at most one).
    const chosenVariant = single ? product.variants.find((variant) => inStep.some((pick) => pick.variantId === variant.id)) : undefined;

    const [browsed, setBrowsed] = useState<OptionSelection>(() =>
        hasOptionData ? (chosenVariant ? valuesOf(chosenVariant, product.product) : defaultOptionValues(product.product)) : {},
    );
    const [browsedId, setBrowsedId] = useState<string>(() => (chosenVariant ?? product.variants.find(isVariantBuyable) ?? product.variants[0]!).id);
    const [refusal, setRefusal] = useState<string | null>(null);
    const timer = useRef<number>();
    useEffect(() => () => window.clearTimeout(timer.current), []);

    const values = chosenVariant && hasOptionData ? valuesOf(chosenVariant, product.product) : browsed;
    const variantId = chosenVariant?.id ?? browsedId;

    // `resolveVariant` only resolves to something buyable. When the chosen combination is sold out,
    // show that variant anyway, so the card can say "Sold out" rather than jump elsewhere.
    const variant = !hasOptionData
        ? (product.variants.find((candidate) => candidate.id === variantId) ?? product.variants[0]!)
        : (resolveVariant(product.product, values) ?? product.variants.find((candidate) => matches(candidate, product.product, values)) ?? product.variants[0]!);

    const quantity = inStep.find((pick) => pick.variantId === variant.id)?.quantity ?? 0;
    // In a one-pick step that holds a pick, choosing is a swap: the pick that leaves makes the room.
    // So the question is the swap's (`swapBlockedReason`), not one more's: `blockedReason` would
    // call the step full, and under "one per product" refuse another size of the chosen product.
    const held = single ? inStep[0] : undefined;
    const blockedFor = (target: BundleVariant) => (held ? swapBlockedReason(section.id, held.variantId, target.id) : blockedReason(section.id, target.id));
    const blocked = blockedFor(variant);

    const refuse = useCallback((message: string) => {
        setRefusal(message);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setRefusal(null), 5000);
    }, []);

    const add = () => {
        if (locked) return;
        if (single && quantity > 0) return; // already the step's pick
        if (blocked) {
            refuse(blockedText(content, blocked));
            return;
        }
        setRefusal(null);
        // A step that holds a pick is full: adding the new one beside it would be refused.
        if (held) swapItem(section.id, held.variantId, variant.id);
        else addItem(section.id, variant.id, 1);
        onPicked(section);
    };

    const remove = () => {
        if (locked || quantity === 0) return;
        setRefusal(null);
        updateQuantity(section.id, variant.id, quantity - 1);
    };

    /** A chosen product's size changed: swap the line to the new variant, if it can be bought. */
    const swapChosenTo = (target: BundleVariant | null | undefined) => {
        if (!chosenVariant || !target || target.id === chosenVariant.id) return;
        const reason = blockedFor(target);
        if (reason) {
            refuse(blockedText(content, reason));
            return;
        }
        swapItem(section.id, chosenVariant.id, target.id);
    };

    // How low is low is the merchant's setting. A buyable variant has stock, so 0 never matches.
    const stock = variant.maxOrderableQuantity;
    const lowStock = isVariantBuyable(variant) && stock !== null && stock !== undefined && stock <= content.lowStockAt;
    const message = refusal ?? (lowStock ? text(content, 'onlyLeft', { count: stock }) : null);

    return {
        single,
        options: hasOptionData
            ? options
                  .filter((option) => option.values.length > 1)
                  .map((option) => {
                      const reachable = new Set(reachableOptionValues(product.product, values, option.name));
                      return {
                          name: option.name,
                          value: values[option.name] ?? '',
                          values: option.values.map((value) => ({ value, reachable: reachable.has(value) })),
                      };
                  })
            : [],
        variantChoices: !hasOptionData && product.variants.length > 1 ? product.variants : null,
        setOption: (name, value) => {
            if (locked) return;
            const next = selectOptionValue(product.product, values, name, value);
            setBrowsed(next);
            if (chosenVariant) swapChosenTo(resolveVariant(product.product, next));
        },
        setVariant: (id) => {
            if (locked) return;
            setBrowsedId(id);
            if (chosenVariant) swapChosenTo(product.variants.find((candidate) => candidate.id === id));
        },
        variant,
        quantity,
        blocked,
        message,
        add,
        remove,
    };
}
