/*
 * One piece of the set: its option grid, the variant the choice resolves to, whether it is in the
 * set, and add / remove with a reason whenever the answer is no.
 *
 * Shared by the card and the details dialog so the two can never disagree about a piece. The
 * choice itself lives in `usePieces`, so "Match colours" moves both at once, and a piece in the
 * set shows the variant the set holds.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { isVariantBuyable, type AddBlockedReason, type BundleVariant } from '@kitenzo/react';

import { text } from '../content';
import type { ViewProduct, ViewSection } from '../model';
import { choose, hasOptionGrid, imageFor, missingOption, optionStates, resolve, surchargeCause, type OptionState, type Unreachable } from '../options';
import { pickedVariant, type ChangeOutcome } from '../pieces';
import { pickOf } from '../selection';
import { blockedText, repairText, unreachableText } from './copy';
import { useBuilder, useSelection } from './context';

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
    /** Why this variant will not go into this step, from the SDK, or null when it will. */
    blocked: AddBlockedReason | null;
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
    const { content, money, swatchNames, addItem, removeItem, blockedReason } = useBuilder();
    const { selections, locked, pieces } = useSelection();
    const grid = hasOptionGrid(product.product);
    // While the piece is in the set these are the picked variant's (../pieces.ts), so the card and
    // the dialog show what the set holds, whatever was pressed last.
    const values = pieces.valuesOf(section, product);
    const picked = pickedVariant(selections, section, product);

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
    const variant = picked ?? (resolved ? (resolved.variant ?? resolved.preview) : pieces.variantOf(section, product));
    const blocked = blockedReason(section.id, variant.id);
    const surchargeAmount = money.surcharge(variant);

    /** What a change did, in words: the refusal first, then a repair, then the swap. */
    const report = (outcome: ChangeOutcome, repaired: string | null) => {
        if (outcome.kind === 'blocked') say(blockedText(content, outcome.reason, section));
        else if (repaired) say(repaired);
        else if (outcome.kind === 'swapped') say(text(content, 'swapped', { value: outcome.title }));
        else setNote(null);
    };

    const setOption = (name: string, value: string) => {
        if (locked) return;
        const { values: next, repairs } = choose(product.product, values, name, value);
        report(pieces.apply(section, product, next), repairs[0] ? repairText(content, repairs[0], value) : null);
    };

    const setVariant = (id: string) => {
        if (locked) return;
        report(pieces.applyVariant(section, product, id), null);
    };

    const add = () => {
        if (locked) return;
        if (missing) {
            say(text(content, 'chooseOption', { option: missing.name.toLocaleLowerCase() }));
            setNudge((count) => count + 1);
            return;
        }
        if (picked) {
            say(text(content, 'inSetAgain'));
            return;
        }
        if (blocked) {
            say(blockedText(content, blocked, section));
            return;
        }
        setNote(null);
        addItem(section.id, variant.id, 1);
    };

    const remove = () => {
        if (locked || !picked) return;
        setNote(null);
        removeItem(section.id, picked.id);
    };

    // How low is low is the merchant's setting. A buyable variant has stock, so 0 never matches.
    const stock = variant.maxOrderableQuantity;
    const lowStock = !missing && isVariantBuyable(variant) && stock !== null && stock !== undefined && stock <= content.lowStockAt;

    return {
        options: grid ? optionStates(product.product, values, swatchNames) : [],
        variantChoices: !grid && product.variants.length > 1 ? product.variants : null,
        setOption,
        explain: (value, why) => say(unreachableText(content, value, why)),
        setVariant,
        variant,
        complete: !missing,
        missing: missing?.name ?? null,
        image: grid ? imageFor(product.product, values, product.photos[0]?.url) : (variant.image ?? product.photos[0]?.url),
        inSet: picked !== null,
        quantity: pickOf(selections, section.id, product)?.quantity ?? 0,
        blocked: picked ? null : blocked,
        surcharge: surchargeAmount > 0 ? { amount: surchargeAmount, cause: surchargeCause(product.product, variant, money.surcharge) } : null,
        message: note ?? (lowStock ? text(content, 'onlyLeft', { count: stock }) : null),
        nudge,
        add,
        remove,
    };
}
