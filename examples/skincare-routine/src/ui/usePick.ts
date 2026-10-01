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

import { defaultOptionValues, reachableOptionValues, resolveVariant, selectOptionValue, type BundleVariant, type OptionSelection } from '@kitenzo/react';

import { text } from '../content';
import type { ViewProduct, ViewSection } from '../model';
import { blockedReason, isSingleChoice, swapInStep, withoutStep, type Blocked } from '../selection';
import { useBuilder } from './context';

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
    blocked: Blocked | null;
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
    const { model, selection, content, locked, onPicked } = useBuilder();
    const options = product.product.options ?? [];
    const hasOptionData = options.length > 0 && product.variants.every((variant) => (variant.optionValues?.length ?? 0) === options.length);
    const single = isSingleChoice(section);
    const inStep = selection.selections[section.id] ?? [];
    // The variant of this product the step holds, if any (a one-pick step holds at most one).
    const chosenVariant = single ? product.variants.find((variant) => inStep.some((pick) => pick.variantId === variant.id)) : undefined;

    const [browsed, setBrowsed] = useState<OptionSelection>(() =>
        hasOptionData ? (chosenVariant ? valuesOf(chosenVariant, product.product) : defaultOptionValues(product.product)) : {},
    );
    const [browsedId, setBrowsedId] = useState<string>(() => (chosenVariant ?? product.variants.find((variant) => variant.available) ?? product.variants[0]!).id);
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
    // A swap empties the step first, so it is checked against the step without its current pick.
    const against = single ? withoutStep(selection.selections, section.id) : selection.selections;
    const blocked = blockedReason(model, against, section, variant);

    const refuse = useCallback((message: string) => {
        setRefusal(message);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setRefusal(null), 5000);
    }, []);

    const reasonText = (reason: Blocked): string => {
        switch (reason) {
            case 'sold-out':
                return text(content, 'soldOut');
            case 'stock':
                return text(content, 'stockReached');
            case 'step-full':
                return text(content, 'stepFull');
            case 'bundle-full':
                return text(content, 'bundleFull');
        }
    };

    const add = () => {
        if (locked) return;
        if (single && quantity > 0) return; // already the step's pick
        if (blocked) {
            refuse(reasonText(blocked));
            return;
        }
        setRefusal(null);
        if (single) swapInStep(selection.builder, selection.selections, section.id, variant.id);
        else selection.builder.addItem(section.id, variant.id, 1);
        onPicked(section);
    };

    const remove = () => {
        if (locked || quantity === 0) return;
        setRefusal(null);
        selection.builder.updateQuantity(section.id, variant.id, quantity - 1);
    };

    /** A chosen product's size changed: swap the line to the new variant, if it can be bought. */
    const swapChosenTo = (target: BundleVariant | null | undefined) => {
        if (!chosenVariant || !target || target.id === chosenVariant.id) return;
        const reason = blockedReason(model, withoutStep(selection.selections, section.id), section, target);
        if (reason) {
            refuse(reasonText(reason));
            return;
        }
        swapInStep(selection.builder, selection.selections, section.id, target.id);
    };

    const stock = variant.maxOrderableQuantity;
    const lowStock = variant.available && stock !== null && stock !== undefined && stock > 0 && stock <= 5;
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
