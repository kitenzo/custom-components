/*
 * One piece of the set: its option grid, the variant the choice resolves to, whether it is in the
 * set, and add / remove with a reason whenever the answer is no.
 *
 * Shared by the card and the details dialog so the two can never disagree about a piece. The
 * choice itself lives in `usePieces`, so "Match colours" moves both at once.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { BundleVariant } from '@kitenzo/react';

import { text } from '../content';
import type { ViewProduct, ViewSection } from '../model';
import { choose, imageFor, missingOption, optionStates, resolve, surchargeCause, type OptionState, type Unreachable } from '../options';
import { blockedReason, pickOf, type Blocked } from '../selection';
import { blockedText, repairText, unreachableText } from './copy';
import { useBuilder } from './context';

export interface Piece {
    options: OptionState[];
    /** For a product with variants but no option data (an older API): one choice per variant. */
    variantChoices: BundleVariant[] | null;
    setOption: (name: string, value: string) => void;
    /** A press on a value that cannot be chosen: say why, change nothing. */
    explain: (value: string, why: Unreachable) => void;
    setVariant: (variantId: string) => void;
    /** The exact variant chosen, or the one shown while a choice is still missing. */
    variant: BundleVariant;
    /** Every option has a value. */
    complete: boolean;
    /** The option still to choose, named in the shopper's words ("size"). */
    missing: string | null;
    image: string | undefined;
    /** This piece is in the set (in whichever variant). */
    inSet: boolean;
    quantity: number;
    blocked: Blocked | null;
    /** What picking this variant adds to the set, in display currency, and the value that causes it. */
    surcharge: { amount: number; cause: string } | null;
    /** A sentence for the shopper when something is refused, repaired or limited, else null. */
    message: string | null;
    /** Bumped on each "choose your size first", so the size row can draw the eye to itself. */
    nudge: number;
    add: () => void;
    remove: () => void;
}

export function usePiece(product: ViewProduct, section: ViewSection): Piece {
    const { model, selection, content, locked, pieces, money } = useBuilder();
    const grid = (product.product.options ?? []).length > 0 && product.variants.every((variant) => (variant.optionValues?.length ?? 0) === (product.product.options ?? []).length);
    const values = pieces.valuesOf(section, product);

    const [variantId, setVariantId] = useState<string>(() => (product.variants.find((variant) => variant.available) ?? product.variants[0]!).id);
    const [note, setNote] = useState<string | null>(null);
    const [nudge, setNudge] = useState(0);
    const timer = useRef<number>();
    useEffect(() => () => window.clearTimeout(timer.current), []);

    const say = useCallback((message: string) => {
        setNote(message);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setNote(null), 6000);
    }, []);

    const resolved = grid ? resolve(product.product, values) : null;
    const missing = grid ? missingOption(product.product, values) : null;
    const variant = resolved ? (resolved.variant ?? resolved.preview) : (product.variants.find((candidate) => candidate.id === variantId) ?? product.variants[0]!);
    const pick = pickOf(selection.selections, section.id, product);
    const quantity = pick?.quantity ?? 0;
    const blocked = blockedReason(model, selection.selections, section, variant);
    const surchargeAmount = money.surcharge(variant);
    const applies = model.bundle.applyVariantSurcharges === true;

    const setOption = (name: string, value: string) => {
        if (locked) return;
        const { values: next, repairs } = choose(product.product, values, name, value);
        const outcome = pieces.apply(section, product, next);
        if (outcome.kind === 'blocked') say(blockedText(content, outcome.reason, section));
        else if (repairs[0]) say(repairText(content, repairs[0], value));
        else if (outcome.kind === 'swapped') say(text(content, 'swapped', { value: outcome.title }));
        else setNote(null);
    };

    const setVariant = (id: string) => {
        if (locked) return;
        setVariantId(id);
        const next = product.variants.find((candidate) => candidate.id === id);
        if (pick && next && next.id !== pick.variantId && next.available) {
            selection.builder.removeItem(section.id, pick.variantId);
            selection.builder.addItem(section.id, next.id, pick.quantity);
        }
    };

    const add = () => {
        if (locked) return;
        if (missing) {
            say(text(content, 'chooseOption', { option: missing.name.toLocaleLowerCase() }));
            setNudge((count) => count + 1);
            return;
        }
        if (pick) {
            say(text(content, 'inSetAgain'));
            return;
        }
        if (blocked) {
            say(blockedText(content, blocked, section));
            return;
        }
        setNote(null);
        selection.builder.addItem(section.id, variant.id, 1);
    };

    const remove = () => {
        if (locked || !pick) return;
        setNote(null);
        selection.builder.removeItem(section.id, pick.variantId);
    };

    const stock = variant.maxOrderableQuantity;
    const lowStock = !missing && variant.available && stock !== null && stock !== undefined && stock > 0 && stock <= 5;

    return {
        options: grid ? optionStates(product.product, values, pieces.swatchNames) : [],
        variantChoices: !grid && product.variants.length > 1 ? product.variants : null,
        setOption,
        explain: (value, why) => say(unreachableText(content, value, why)),
        setVariant,
        variant,
        complete: !missing,
        missing: missing?.name ?? null,
        image: grid ? imageFor(product.product, values, product.photos[0]?.url) : (variant.image ?? product.photos[0]?.url),
        inSet: pick !== null,
        quantity,
        blocked: pick ? null : blocked,
        surcharge: surchargeAmount > 0 ? { amount: surchargeAmount, cause: surchargeCause(product.product, variant, applies) } : null,
        message: note ?? (lowStock ? text(content, 'onlyLeft', { count: stock }) : null),
        nudge,
        add,
        remove,
    };
}
