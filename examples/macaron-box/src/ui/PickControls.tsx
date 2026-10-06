/*
 * A product's price line, option dropdowns and add / quantity control, shared by the card and
 * the dialog.
 *
 * Unreachable option values are disabled, not hidden: a shopper needs to see that a size exists
 * before they can work out what to change to reach it. A control that refuses an action stays
 * focusable (`aria-disabled`, not `disabled`) and says why when pressed; only a sold-out product's
 * control is truly `disabled`, because there is nothing the shopper can do about it.
 */
import { useEffect, useId, useRef } from 'react';

import { isVariantBuyable, type BundleVariant } from '@kitenzo/react';

import { text } from '../content';
import type { ViewProduct, ViewSection } from '../model';
import { useBuilder, useSelection } from './context';
import { MinusIcon, PlusIcon } from './Icons';
import type { Pick } from './usePick';

/**
 * What a flavour says about money, on its card and in its details alike: its price, only what it
 * adds to a box sold at a set price, or nothing (box.ts, `flavourPricing`).
 */
export function FlavourPrice({ variant, section }: { variant: BundleVariant; section: ViewSection }) {
    const { money, content, box } = useBuilder();
    if (content.hidePrices) return null;
    const pricing = box?.section.id === section.id ? box.flavourPricing : 'price';
    if (pricing === 'price') {
        const price = money.unitPrice(variant);
        return (
            <p className="mcb-card__price" data-price-value={price.toFixed(2)}>
                {money.format(price)}
            </p>
        );
    }
    const extra = money.surcharge(variant);
    if (pricing === 'none' || extra <= 0) return null;
    return (
        <p className="mcb-card__price" data-mcb-surcharge={extra.toFixed(2)}>
            {text(content, 'surchargeNote', { amount: money.format(extra) })}
        </p>
    );
}

export function OptionPickers({ pick, product }: { pick: Pick; product: ViewProduct }) {
    const id = useId();
    const { locked } = useSelection();
    if (pick.variantChoices) {
        return (
            <label className="mcb-option">
                <span className="mcb-option__label">{product.product.options?.[0]?.name ?? 'Option'}</span>
                <select className="mcb-select" value={pick.variant.id} disabled={locked} onChange={(event) => pick.setVariant(event.target.value)}>
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
        <div className="mcb-options">
            {pick.options.map((option) => (
                <label key={option.name} className="mcb-option" htmlFor={`${id}-${option.name}`}>
                    <span className="mcb-option__label">{option.name}</span>
                    <select
                        id={`${id}-${option.name}`}
                        className="mcb-select"
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
                className="mcb-button mcb-button--secondary mcb-add"
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
        <div className="mcb-stepper" role="group" aria-label={name}>
            <button type="button" className="mcb-stepper__button" aria-label={`${text(content, 'remove')} ${name}`} aria-disabled={locked || undefined} onClick={press(pick.remove)}>
                <MinusIcon />
            </button>
            <output className="mcb-stepper__count" aria-live="polite">
                {pick.quantity}
            </output>
            <button
                ref={plusRef}
                type="button"
                className="mcb-stepper__button"
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
