/*
 * A product's option dropdowns and its add / quantity control, shared by the card and the dialog.
 *
 * Unreachable option values are disabled, not hidden: a shopper needs to see that a size exists
 * before they can work out what to change to reach it. A control that refuses an action stays
 * focusable (`aria-disabled`, not `disabled`) and says why when pressed; only a sold-out product's
 * control is truly `disabled`, because there is nothing the shopper can do about it.
 */
import { useEffect, useId, useRef } from 'react';

import { isVariantBuyable } from '@kitenzo/react';

import { text } from '../content';
import type { ViewProduct } from '../model';
import { useBuilder, useSelection } from './context';
import { MinusIcon, PlusIcon } from './Icons';
import type { Pick } from './usePick';

export function OptionPickers({ pick, product }: { pick: Pick; product: ViewProduct }) {
    const id = useId();
    const { locked } = useSelection();
    if (pick.variantChoices) {
        return (
            <label className="kst-option">
                <span className="kst-option__label">{product.product.options?.[0]?.name ?? 'Option'}</span>
                <select className="kst-select" value={pick.variant.id} disabled={locked} onChange={(event) => pick.setVariant(event.target.value)}>
                    {pick.variantChoices.map((variant) => (
                        <option key={variant.id} value={variant.id} disabled={!isVariantBuyable(variant)}>
                            {variant.title}
                        </option>
                    ))}
                </select>
            </label>
        );
    }
    if (pick.options.length === 0) return null;
    return (
        <div className="kst-options">
            {pick.options.map((option) => (
                <label key={option.name} className="kst-option" htmlFor={`${id}-${option.name}`}>
                    <span className="kst-option__label">{option.name}</span>
                    <select
                        id={`${id}-${option.name}`}
                        className="kst-select"
                        value={option.value}
                        disabled={locked}
                        onChange={(event) => pick.setOption(option.name, event.target.value)}
                    >
                        {option.values.map((entry) => (
                            <option key={entry.value} value={entry.value} disabled={!entry.reachable}>
                                {entry.value}
                            </option>
                        ))}
                    </select>
                </label>
            ))}
        </div>
    );
}

export function QuantityControl({ pick, product }: { pick: Pick; product: ViewProduct }) {
    const { content } = useBuilder();
    const { locked } = useSelection();
    const soldOut = pick.blocked === 'sold-out' || pick.blocked === 'not-offered';
    const refusing = pick.blocked !== null && !soldOut;
    const name = pick.variant.title === 'Default Title' ? product.title : `${product.title}, ${pick.variant.title}`;

    // "Add" becomes a stepper and back. The button under the shopper's finger is replaced, so focus
    // is moved to its counterpart, or a keyboard or screen reader user is dropped to the page top.
    const addRef = useRef<HTMLButtonElement>(null);
    const plusRef = useRef<HTMLButtonElement>(null);
    const moveFocus = useRef(false);
    const previous = useRef(pick.quantity);
    useEffect(() => {
        const was = previous.current;
        previous.current = pick.quantity;
        if (!moveFocus.current) return;
        moveFocus.current = false;
        if (was === 0 && pick.quantity > 0) plusRef.current?.focus();
        if (was > 0 && pick.quantity === 0) addRef.current?.focus();
    }, [pick.quantity]);
    const press = (action: () => void) => () => {
        moveFocus.current = true;
        action();
    };

    if (pick.quantity === 0) {
        return (
            <button
                ref={addRef}
                type="button"
                className="kst-button kst-button--secondary kst-add"
                data-testid="cc-pick"
                disabled={soldOut}
                aria-disabled={refusing || locked || undefined}
                aria-label={soldOut ? `${name}: ${text(content, 'soldOut')}` : `${text(content, 'add')} ${name}`}
                onClick={press(pick.add)}
            >
                {soldOut ? text(content, 'soldOut') : text(content, 'add')}
            </button>
        );
    }
    return (
        <div className="kst-stepper" role="group" aria-label={name}>
            <button type="button" className="kst-stepper__button" aria-label={`${text(content, 'remove')} ${name}`} aria-disabled={locked || undefined} onClick={press(pick.remove)}>
                <MinusIcon />
            </button>
            <output className="kst-stepper__count" aria-live="polite">
                {pick.quantity}
            </output>
            <button
                ref={plusRef}
                type="button"
                className="kst-stepper__button"
                data-testid="cc-pick"
                aria-label={`${text(content, 'add')} ${name}`}
                aria-disabled={refusing || locked || undefined}
                onClick={pick.add}
            >
                <PlusIcon />
            </button>
        </div>
    );
}
