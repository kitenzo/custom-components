/*
 * A piece's option grid and its add control, shared by the card and the dialog.
 *
 * Colour is drawn as swatches and every other option (Size) as a row of buttons. A value that
 * cannot be chosen is disabled, never hidden: a shopper needs to see that Moss exists before they
 * can work out what to change to reach it. It stays focusable (`aria-disabled`, not `disabled`),
 * says why when pressed, and the reason is also written under the row, so nobody has to press
 * anything to find out. Only a sold-out piece's add button is truly `disabled`, because there is
 * nothing the shopper can do about it.
 */
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';

import { isVariantBuyable } from '@kitenzo/react';

import { text } from '../content';
import type { ViewProduct } from '../model';
import { swatchFor, valueSurcharge, type OptionState } from '../options';
import { unreachableText } from './copy';
import { useBuilder, useSelection } from './context';
import { CheckIcon } from './Icons';
import type { Piece } from './usePiece';

function Swatches({ state, piece, product }: { state: OptionState; piece: Piece; product: ViewProduct }) {
    const { content, money, swatchColours } = useBuilder();
    const { locked } = useSelection();
    return (
        <div className="aws-swatches">
            {state.values.map((entry) => {
                const swatch = swatchFor(product.product, state.option, entry.value, swatchColours);
                const extra = content.hidePrices ? 0 : valueSurcharge(product.product, state.option, entry.value, money.surcharge);
                const why = entry.why ? unreachableText(content, entry.value, entry.why) : null;
                const style = { '--aws-swatch': swatch.color ?? undefined, backgroundImage: swatch.image ? `url("${swatch.image.replace(/"/g, '%22')}")` : undefined } as CSSProperties;
                return (
                    <button
                        key={entry.value}
                        type="button"
                        className={`aws-swatch${swatch.color || swatch.image ? '' : ' aws-swatch--blank'}`}
                        data-option={state.option.name}
                        data-value={entry.value}
                        aria-pressed={state.value === entry.value}
                        aria-disabled={!entry.reachable || locked || undefined}
                        aria-label={why ?? entry.value}
                        title={why ?? entry.value}
                        onClick={() => (entry.why ? piece.explain(entry.value, entry.why) : piece.setOption(state.option.name, entry.value))}
                    >
                        <span className="aws-swatch__chip" style={style} aria-hidden="true">
                            {swatch.color || swatch.image ? null : entry.value.slice(0, 1)}
                        </span>
                        {extra > 0 ? (
                            <span className="aws-swatch__extra" aria-hidden="true">
                                +{money.format(extra)}
                            </span>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
}

function ValueButtons({ state, piece }: { state: OptionState; piece: Piece }) {
    const { content } = useBuilder();
    const { locked } = useSelection();
    // Draw the eye to the row the shopper skipped, once per "choose your size first".
    const [flash, setFlash] = useState(false);
    useEffect(() => {
        if (piece.nudge === 0 || state.value) return undefined;
        setFlash(true);
        const timer = window.setTimeout(() => setFlash(false), 700);
        return () => window.clearTimeout(timer);
    }, [piece.nudge, state.value]);
    return (
        <div className={`aws-values${flash ? ' aws-values--nudged' : ''}`}>
            {state.values.map((entry) => {
                const why = entry.why ? unreachableText(content, entry.value, entry.why) : null;
                return (
                    <button
                        key={entry.value}
                        type="button"
                        className="aws-value"
                        data-option={state.option.name}
                        data-value={entry.value}
                        aria-pressed={state.value === entry.value}
                        aria-disabled={!entry.reachable || locked || undefined}
                        aria-label={why ?? entry.value}
                        title={why ?? undefined}
                        onClick={() => (entry.why ? piece.explain(entry.value, entry.why) : piece.setOption(state.option.name, entry.value))}
                    >
                        {entry.value}
                    </button>
                );
            })}
        </div>
    );
}

export function OptionPickers({ piece, product }: { piece: Piece; product: ViewProduct }) {
    const id = useId();
    const { content } = useBuilder();
    const { locked } = useSelection();
    if (piece.variantChoices) {
        return (
            <label className="aws-option">
                <span className="aws-option__label">{product.product.options?.[0]?.name ?? 'Option'}</span>
                <select className="aws-select" value={piece.variant.id} disabled={locked} onChange={(event) => piece.setVariant(event.target.value)}>
                    {piece.variantChoices.map((variant) => (
                        <option key={variant.id} value={variant.id} disabled={!isVariantBuyable(variant)}>
                            {variant.title}
                        </option>
                    ))}
                </select>
            </label>
        );
    }
    if (piece.options.length === 0) return null;
    return (
        <div className="aws-options">
            {piece.options.map((state) => {
                const labelId = `${id}-${state.option.name}`;
                // The reasons for this row, written out: the shopper should not have to press a
                // greyed-out value to learn why it is grey.
                // A piece sold out in everything says so once, on its photograph and its button,
                // rather than once per value.
                const reasons = product.soldOut ? [] : state.values.filter((entry) => entry.why).map((entry) => unreachableText(content, entry.value, entry.why!));
                return (
                    <div key={state.option.name} className="aws-option" role="group" aria-labelledby={labelId}>
                        <div className="aws-option__head">
                            <p className="aws-option__label" id={labelId}>
                                <span>{state.option.name}</span>
                                {state.value ? <span className="aws-option__value">{state.value}</span> : null}
                            </p>
                            {reasons.length > 0 ? <p className="aws-option__note">{reasons.join(' ')}</p> : null}
                        </div>
                        {state.swatch ? <Swatches state={state} piece={piece} product={product} /> : <ValueButtons state={state} piece={piece} />}
                    </div>
                );
            })}
        </div>
    );
}

export function AddControl({ piece, product }: { piece: Piece; product: ViewProduct }) {
    const { content } = useBuilder();
    const { locked } = useSelection();
    const name = piece.complete && piece.variant.title !== 'Default Title' ? `${product.title}, ${piece.variant.title}` : product.title;

    // "Add to set" becomes "In your set" and back. The button under the shopper's finger is
    // replaced, so focus is moved to its counterpart, or a keyboard or screen reader user is
    // dropped to the top of the page.
    const addRef = useRef<HTMLButtonElement>(null);
    const inSetRef = useRef<HTMLButtonElement>(null);
    const moveFocus = useRef(false);
    const previous = useRef(piece.inSet);
    useEffect(() => {
        const was = previous.current;
        previous.current = piece.inSet;
        if (!moveFocus.current) return;
        moveFocus.current = false;
        if (!was && piece.inSet) inSetRef.current?.focus();
        if (was && !piece.inSet) addRef.current?.focus();
    }, [piece.inSet]);
    const press = (action: () => void) => () => {
        moveFocus.current = true;
        action();
    };

    if (product.soldOut) {
        return (
            <button type="button" className="aws-button aws-button--secondary aws-add" data-testid="cc-pick" disabled aria-label={`${product.title}: ${text(content, 'soldOut')}`}>
                {text(content, 'soldOut')}
            </button>
        );
    }
    if (piece.inSet) {
        return (
            <div className="aws-in-set">
                <button
                    ref={inSetRef}
                    type="button"
                    className="aws-button aws-button--chosen aws-add"
                    data-testid="cc-pick"
                    aria-disabled="true"
                    aria-label={`${text(content, 'inSet')}: ${name}`}
                    onClick={piece.add}
                >
                    <CheckIcon />
                    {text(content, 'inSet')}
                </button>
                <button type="button" className="aws-link" aria-disabled={locked || undefined} aria-label={`${text(content, 'remove')} ${product.title}`} onClick={press(piece.remove)}>
                    {text(content, 'remove')}
                </button>
            </div>
        );
    }
    // A complete choice that cannot be bought at all: nothing the shopper can do about it here.
    const unbuyable = piece.blocked === 'sold-out' || piece.blocked === 'not-offered';
    const soldOut = piece.complete && unbuyable;
    const refusing = piece.blocked !== null && !unbuyable;
    return (
        <button
            ref={addRef}
            type="button"
            className="aws-button aws-button--secondary aws-add"
            data-testid="cc-pick"
            disabled={soldOut}
            aria-disabled={refusing || locked || undefined}
            aria-label={soldOut ? `${name}: ${text(content, 'soldOut')}` : `${text(content, 'add')}: ${name}`}
            onClick={press(piece.add)}
        >
            {soldOut ? text(content, 'soldOut') : text(content, 'add')}
        </button>
    );
}
