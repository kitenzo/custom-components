/*
 * One product's picker: its option values, the variant they resolve to, how many of that variant
 * are in this step, and add/remove with a reason whenever the answer is no.
 *
 * Shared by the card and the details dialog so the two can never disagree about a product.
 *
 * A step that holds one (the box, the card) behaves like a set of radio buttons: choosing another
 * replaces the one chosen, instead of refusing with "this step is full". It is still two SDK
 * calls (remove, then add), so the engine checks the result exactly as it checks any pick.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { defaultOptionValues, reachableOptionValues, resolveVariant, selectOptionValue, type BundleVariant, type OptionSelection } from '@kitenzo/react';

import { text } from '../content';
import type { ViewProduct, ViewSection } from '../model';
import { blockedReason, type Blocked } from '../selection';
import { useBuilder } from './context';

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
    blocked: Blocked | null;
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
    const { model, selection, content, locked } = useBuilder();
    const options = product.product.options ?? [];
    const hasOptionData = options.length > 0 && product.variants.every((variant) => (variant.optionValues?.length ?? 0) === options.length);

    const [values, setValues] = useState<OptionSelection>(() => (hasOptionData ? defaultOptionValues(product.product) : {}));
    const [variantId, setVariantId] = useState<string>(() => (product.variants.find((variant) => variant.available) ?? product.variants[0]!).id);
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

    const stepPicks = selection.selections[section.id] ?? [];
    const quantity = stepPicks.find((pick) => pick.variantId === variant.id)?.quantity ?? 0;
    const blocked = blockedReason(model, selection.selections, section, variant);
    const single = section.limits.max === 1;
    const replaced = single && blocked === 'step-full' ? stepPicks.find((pick) => pick.variantId !== variant.id && pick.quantity > 0) : undefined;

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

    const add = useCallback(() => {
        if (locked) return;
        if (blocked && !replaced) {
            refuse(reasonText(blocked));
            return;
        }
        setRefusal(null);
        if (replaced) selection.builder.removeItem(section.id, replaced.variantId);
        selection.builder.addItem(section.id, variant.id, 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [locked, blocked, replaced, refuse, selection.builder, section.id, variant.id]);

    const remove = useCallback(() => {
        if (locked || quantity === 0) return;
        setRefusal(null);
        selection.builder.updateQuantity(section.id, variant.id, quantity - 1);
    }, [locked, quantity, selection.builder, section.id, variant.id]);

    const stock = variant.maxOrderableQuantity;
    const lowStock = variant.available && stock !== null && stock !== undefined && stock > 0 && stock <= 5;
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
        swaps: replaced !== undefined,
        single,
        message,
        add,
        remove,
    };
}
