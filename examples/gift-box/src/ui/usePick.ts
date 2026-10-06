/*
 * One product's picker: its option values, the variant they resolve to, how many of that variant
 * are in this step, and add/remove with a reason whenever the answer is no.
 *
 * Shared by the card and the details dialog so the two can never disagree about a product.
 *
 * A step that holds one (the box, the card) behaves like a set of radio buttons: choosing another
 * replaces the one chosen, instead of refusing with "this step is full". Whether the replacement
 * can go in is the SDK's to say (`swapBlockedReason`), and the replacing is the SDK's (`swapItem`),
 * which leaves the old choice where it was if the new one cannot go in.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { defaultOptionValues, isVariantBuyable, reachableOptionValues, resolveVariant, selectOptionValue, type AddBlockedReason, type BundleVariant, type OptionSelection } from '@kitenzo/react';

import { text } from '../content';
import type { ViewProduct, ViewSection } from '../model';
import { choiceFor, isSingleChoice } from '../selection';
import { useBuilder, useSelection } from './context';
import { blockedText } from './copy';

export interface OptionControl {
    name: string;
    value: string;
    values: { value: string; reachable: boolean }[];
}

export interface Pick {
    options: OptionControl[];
    /** For a product with variants but no option data (an older API): one choice per variant. */
    variantChoices: BundleVariant[] | null;
    setOption: (name: string, value: string) => void;
    setVariant: (variantId: string) => void;
    variant: BundleVariant;
    quantity: number;
    /**
     * Why this variant will not go into this step, from the SDK, or null when it will: as one more
     * in a step that counts, as the replacement of the step's pick when `swaps`.
     */
    blocked: AddBlockedReason | null;
    /** The step holds one and another is chosen: adding this one replaces it. */
    swaps: boolean;
    /** The step holds at most one, so the control is a choose / chosen toggle, not a stepper. */
    single: boolean;
    /** A sentence for the shopper when something is refused or limited, else null. */
    message: string | null;
    add: () => void;
    remove: () => void;
}

function matches(variant: BundleVariant, product: ViewProduct['product'], values: OptionSelection): boolean {
    const options = product.options ?? [];
    return options.every((option, index) => values[option.name] === undefined || variant.optionValues?.[index] === values[option.name]);
}

export function usePick(product: ViewProduct, section: ViewSection): Pick {
    const { content, addItem, updateQuantity, swapItem, blockedReason, swapBlockedReason } = useBuilder();
    const { selections, locked } = useSelection();
    const options = product.product.options ?? [];
    const hasOptionData = options.length > 0 && product.variants.every((variant) => (variant.optionValues?.length ?? 0) === options.length);

    const [values, setValues] = useState<OptionSelection>(() => (hasOptionData ? defaultOptionValues(product.product) : {}));
    const [variantId, setVariantId] = useState<string>(() => (product.variants.find(isVariantBuyable) ?? product.variants[0]!).id);
    const [refusal, setRefusal] = useState<string | null>(null);
    const timer = useRef<number>();
    useEffect(() => () => window.clearTimeout(timer.current), []);

    const variant = useMemo(() => {
        if (!hasOptionData) return product.variants.find((candidate) => candidate.id === variantId) ?? product.variants[0]!;
        // `resolveVariant` only resolves to something buyable. When the chosen combination is sold
        // out, show that variant anyway, so the card can say "Sold out" rather than jump elsewhere.
        return (
            resolveVariant(product.product, values) ??
            product.variants.find((candidate) => matches(candidate, product.product, values)) ??
            product.variants[0]!
        );
    }, [hasOptionData, product, values, variantId]);

    const quantity = (selections[section.id] ?? []).find((pick) => pick.variantId === variant.id)?.quantity ?? 0;
    const { replaces, blocked } = choiceFor(section, selections, variant.id, { blockedReason, swapBlockedReason });

    const refuse = useCallback((message: string) => {
        setRefusal(message);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setRefusal(null), 5000);
    }, []);

    const add = useCallback(() => {
        if (locked) return;
        if (blocked) {
            refuse(blockedText(content, blocked));
            return;
        }
        setRefusal(null);
        if (replaces === null) {
            addItem(section.id, variant.id, 1);
            return;
        }
        // The swap is the SDK's to make and to refuse. A refusal it gave no reason for a moment
        // ago still leaves the old choice in place, so the shopper is told the step is full.
        if (!swapItem(section.id, replaces, variant.id)) refuse(blockedText(content, swapBlockedReason(section.id, replaces, variant.id) ?? 'section-full'));
    }, [locked, blocked, replaces, refuse, content, addItem, swapItem, swapBlockedReason, section.id, variant.id]);

    const remove = useCallback(() => {
        if (locked || quantity === 0) return;
        setRefusal(null);
        updateQuantity(section.id, variant.id, quantity - 1);
    }, [locked, quantity, updateQuantity, section.id, variant.id]);

    // How low is low is the merchant's setting. A buyable variant has stock, so 0 never matches.
    const stock = variant.maxOrderableQuantity;
    const lowStock = isVariantBuyable(variant) && stock !== null && stock !== undefined && stock <= content.lowStockAt;
    const message = refusal ?? (lowStock ? text(content, 'onlyLeft', { count: stock }) : null);

    return {
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
        setOption: (name, value) => setValues((current) => selectOptionValue(product.product, current, name, value)),
        setVariant: setVariantId,
        variant,
        quantity,
        blocked,
        swaps: replaces !== null,
        single: isSingleChoice(section),
        message,
        add,
        remove,
    };
}
