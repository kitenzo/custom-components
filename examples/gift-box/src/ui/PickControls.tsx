/*
 * A product's options and its add / quantity control, shared by the card, the featured product and
 * the dialog.
 *
 * Options render as buttons (a "chip" each) where there is room or where the values are colours
 * (a swatch says more than the word), and as a dropdown in a narrow card with long values.
 *
 * Unreachable option values are disabled, not hidden: a shopper needs to see that a size exists
 * before they can work out what to change to reach it. A control that refuses an action stays
 * focusable (`aria-disabled`, not `disabled`) and says why when pressed; only a sold-out product's
 * control is truly `disabled`, because there is nothing the shopper can do about it.
 */
import { useEffect, useId, useRef } from 'react';

import { text } from '../content';
import type { ViewProduct } from '../model';
import { useBuilder } from './context';
import { isColourOption, swatchFor } from './art';
import { CheckIcon, MinusIcon, PlusIcon } from './Icons';
import type { OptionControl, Pick } from './usePick';

function OptionChips({ option, pick, colour }: { option: OptionControl; pick: Pick; colour: boolean }) {
    const id = useId();
    const { locked, content } = useBuilder();
    return (
        <div className="gft-option">
            <span className="gft-option__label" id={id}>
                {option.name}
                {colour ? <span className="gft-option__value">{option.value}</span> : null}
            </span>
            <div className={`gft-chips${colour ? ' gft-chips--swatches' : ''}`} role="group" aria-labelledby={id}>
                {option.values.map((entry) => (
                    <button
                        key={entry.value}
                        type="button"
                        className={`gft-chip${entry.reachable ? '' : ' gft-chip--unreachable'}`}
                        aria-pressed={entry.value === option.value}
                        aria-disabled={locked || undefined}
                        data-option-value={entry.value}
                        data-reachable={entry.reachable ? 'true' : 'false'}
                        title={colour ? entry.value : undefined}
                        onClick={() => {
                            // An unreachable value is still choosable: the product then shows that
                            // combination as sold out, which says why far better than a dead button.
                            if (!locked) pick.setOption(option.name, entry.value);
                        }}
                    >
                        {colour ? <span className="gft-chip__swatch" style={{ background: swatchFor(entry.value) }} aria-hidden="true" /> : null}
                        <span className={colour ? 'gft-visually-hidden' : 'gft-chip__text'}>{entry.value}</span>
                        {entry.reachable ? null : <span className="gft-visually-hidden">, {text(content, 'soldOut')}</span>}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function OptionPickers({ pick, product, chips = false }: { pick: Pick; product: ViewProduct; chips?: boolean }) {
    const id = useId();
    const { locked } = useBuilder();
    if (pick.variantChoices) {
        return (
            <label className="gft-option">
                <span className="gft-option__label">{product.product.options?.[0]?.name ?? 'Option'}</span>
                <select className="gft-select" value={pick.variant.id} disabled={locked} onChange={(event) => pick.setVariant(event.target.value)}>
                    {pick.variantChoices.map((variant) => (
                        <option key={variant.id} value={variant.id} disabled={!variant.available}>
                            {variant.title}
                        </option>
                    ))}
                </select>
            </label>
        );
    }
    if (pick.options.length === 0) return null;
    return (
        <div className="gft-options">
            {pick.options.map((option) =>
                chips || isColourOption(option.name) ? (
                    <OptionChips key={option.name} option={option} pick={pick} colour={isColourOption(option.name)} />
                ) : (
                <label key={option.name} className="gft-option" htmlFor={`${id}-${option.name}`}>
                    <span className="gft-option__label">{option.name}</span>
                    <select
                        id={`${id}-${option.name}`}
                        className="gft-select"
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
                ),
            )}
        </div>
    );
}

export function QuantityControl({ pick, product }: { pick: Pick; product: ViewProduct }) {
    const { content, locked } = useBuilder();
    const soldOut = pick.blocked === 'sold-out';
    const refusing = pick.blocked !== null && !soldOut;
    const name = pick.variant.title === 'Default Title' ? product.title : `${product.title}, ${pick.variant.title}`;

    // "Add" becomes a stepper and back, "Choose" becomes "Chosen". The button under the shopper's
    // finger is replaced, so focus is moved to its counterpart, or a keyboard or screen reader user
    // is dropped to the page top.
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

    if (pick.single) {
        // A step that holds one: choose, chosen (press again to take it out), or swap.
        if (pick.quantity > 0) {
            return (
                <button
                    ref={plusRef}
                    type="button"
                    className="gft-button gft-button--chosen gft-add"
                    aria-pressed="true"
                    aria-label={`${text(content, 'remove')} ${name}`}
                    aria-disabled={locked || undefined}
                    onClick={press(pick.remove)}
                >
                    <CheckIcon />
                    {text(content, 'chosen')}
                </button>
            );
        }
        return (
            <button
                ref={addRef}
                type="button"
                className="gft-button gft-button--secondary gft-add"
                data-testid="cc-pick"
                disabled={soldOut}
                aria-disabled={(refusing && !pick.swaps) || locked || undefined}
                aria-label={soldOut ? `${name}: ${text(content, 'soldOut')}` : `${text(content, pick.swaps ? 'swap' : 'choose')}: ${name}`}
                onClick={press(pick.add)}
            >
                {soldOut ? text(content, 'soldOut') : text(content, pick.swaps ? 'swap' : 'choose')}
            </button>
        );
    }

    if (pick.quantity === 0) {
        return (
            <button
                ref={addRef}
                type="button"
                className="gft-button gft-button--secondary gft-add"
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
        <div className="gft-stepper" role="group" aria-label={name}>
            <button type="button" className="gft-stepper__button" aria-label={`${text(content, 'remove')} ${name}`} aria-disabled={locked || undefined} onClick={press(pick.remove)}>
                <MinusIcon />
            </button>
            <output className="gft-stepper__count" aria-live="polite">
                {pick.quantity}
            </output>
            <button
                ref={plusRef}
                type="button"
                className="gft-stepper__button"
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
