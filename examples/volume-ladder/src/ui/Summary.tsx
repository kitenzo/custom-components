/*
 * What the bundle costs and the button that buys it.
 *
 * One buy panel, not a rail plus a mobile bar: the ladder is already a summary (it says how many
 * and what they save), so the panel is only the money and the button, and it sits where a
 * product form's buy button sits. On a phone it sticks to the bottom of the viewport while the
 * widget is on screen, so the total stays in view as the shopper climbs the ladder. It carries
 * both `cc-add-to-cart` and `cc-mobile-bar`: it is the only buy surface at every width.
 */
import { useBundlePrice, type UseBundleCartFlowResult } from '@kitenzo/react';

import { text } from '../content';
import { useBuilder } from './context';

export interface BuyState {
    canAdd: boolean;
    /** Why the button will not add yet, or the cart's own sentence after a failed add. */
    status: string;
    statusIsError: boolean;
    onAdd: () => void;
    cart: UseBundleCartFlowResult;
}

function PriceBlock() {
    const { model, selection, money, content } = useBuilder();
    const price = useBundlePrice(model.bundle, selection.selections);
    if (content.hidePrices || price.discountedPrice === null) return null;
    const total = Number(price.discountedPrice);
    const original = price.originalPrice === null ? null : Number(price.originalPrice);
    const saving = original !== null && original > total ? original - total : 0;
    return (
        <div className="vol-price">
            <span className="vol-price__label">{text(content, 'total')}</span>
            <span className="vol-price__amounts">
                {saving > 0 && original !== null ? (
                    <s className="vol-price__compare" data-testid="cc-compare-at" data-vol-amount="" data-price-value={original.toFixed(2)}>
                        {money.format(original)}
                    </s>
                ) : null}
                <strong className="vol-price__total" data-testid="cc-price" data-vol-amount="" data-price-value={total.toFixed(2)}>
                    {money.format(total)}
                </strong>
            </span>
            {saving > 0 ? (
                <span className="vol-price__saving" data-testid="cc-saving" data-vol-amount="" data-price-value={saving.toFixed(2)}>
                    {text(content, 'saving', { amount: money.format(saving) })}
                </span>
            ) : null}
        </div>
    );
}

export function BuyPanel({ buy }: { buy: BuyState }) {
    const { content } = useBuilder();
    const label = buy.cart.isAdding ? text(content, 'adding') : buy.cart.isAdded ? text(content, 'added') : text(content, 'addToCart');
    return (
        <div className="vol-buy" data-testid="cc-mobile-bar">
            <PriceBlock />
            <button
                type="button"
                className="vol-button vol-button--primary vol-buy__button"
                data-testid="cc-add-to-cart"
                aria-disabled={!buy.canAdd || buy.cart.isAdding || undefined}
                aria-busy={buy.cart.isAdding || undefined}
                onClick={buy.onAdd}
            >
                {label}
            </button>
            {/* Two live regions, both always in the page. A screen reader announces a change to a
                region it already knows about; an element that turns into an alert in the same render
                as its text often goes unannounced. */}
            <div className="vol-status-wrap">
                <p className="vol-status" role="status">
                    {buy.statusIsError ? '' : buy.status}
                </p>
                <p className="vol-status vol-status--error" role="alert" data-testid="cc-cart-error">
                    {buy.statusIsError ? buy.status : ''}
                </p>
            </div>
        </div>
    );
}
