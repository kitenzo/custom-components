/*
 * What is in the bundle, what it costs, and the button that buys it: as a rail beside the steps
 * on wide screens and as a bar stuck to the bottom of the widget on narrow ones.
 *
 * Both carry `cc-add-to-cart` and CSS decides which one shows. JavaScript never mirrors a CSS
 * breakpoint to decide where a test id or a button goes.
 */
import { useRef } from 'react';

import { useBundlePrice, type UseBundleCartFlowResult } from '@kitenzo/react';

import { text } from '../content';
import { pickedCount } from '../selection';
import { useBuilder, useSelection } from './context';
import { CloseIcon } from './Icons';
import { imageAttrs } from './images';

export interface BuyState {
    canAdd: boolean;
    /** Why the button will not add yet, or the cart's own sentence after a failed add. */
    status: string;
    statusIsError: boolean;
    onAdd: () => void;
    cart: UseBundleCartFlowResult;
}

function PriceBlock({ compact = false }: { compact?: boolean }) {
    const { model, money, content } = useBuilder();
    const { selections } = useSelection();
    const price = useBundlePrice(model.bundle, selections, { locale: document.documentElement.lang || undefined });
    if (content.hidePrices || price.discountedPrice === null) return null;
    // Before the first pick only a flat set price is known: a total, with nothing to compare it to.
    const total = price.amounts?.discounted ?? Number(price.discountedPrice);
    const original = price.hasDiscount ? (price.amounts?.original ?? null) : null;
    const saving = price.hasDiscount ? (price.amounts?.saved ?? 0) : 0;
    return (
        <div className={`kst-price${compact ? ' kst-price--compact' : ''}`}>
            <span className="kst-price__label">{text(content, 'total')}</span>
            <span className="kst-price__amounts">
                {saving > 0 && original !== null ? (
                    <s className="kst-price__compare" data-testid="cc-compare-at" data-price-value={original.toFixed(2)}>
                        {money.format(original)}
                    </s>
                ) : null}
                <strong className="kst-price__total" data-testid="cc-price" data-price-value={total.toFixed(2)}>
                    {money.format(total)}
                </strong>
            </span>
            {saving > 0 && !compact ? (
                <span className="kst-price__saving" data-testid="cc-saving" data-price-value={saving.toFixed(2)}>
                    {text(content, 'saving', { amount: money.format(saving) ?? '' })}
                </span>
            ) : null}
        </div>
    );
}

function BuyButton({ buy }: { buy: BuyState }) {
    const { content } = useBuilder();
    const label = buy.cart.isAdding ? text(content, 'adding') : buy.cart.isAdded ? text(content, 'added') : text(content, 'addToCart');
    return (
        <button
            type="button"
            className="kst-button kst-button--primary kst-buy"
            data-testid="cc-add-to-cart"
            aria-disabled={!buy.canAdd || buy.cart.isAdding || undefined}
            aria-busy={buy.cart.isAdding || undefined}
            onClick={buy.onAdd}
        >
            {label}
        </button>
    );
}

/*
 * Two live regions, both always in the page. A screen reader announces a change to a region it
 * already knows about; an element that turns into an alert in the same render as its text often
 * goes unannounced.
 */
function Status({ buy }: { buy: BuyState }) {
    return (
        <div className="kst-status-wrap">
            <p className="kst-status" role="status">
                {buy.statusIsError ? '' : buy.status}
            </p>
            <p className="kst-status kst-status--error" role="alert" data-testid="cc-cart-error">
                {buy.statusIsError ? buy.status : ''}
            </p>
        </div>
    );
}

export function SummaryRail({ buy }: { buy: BuyState }) {
    const { model, content, removeItem } = useBuilder();
    const { selections, locked } = useSelection();
    const lines = model.sections.flatMap((section) =>
        (selections[section.id] ?? []).flatMap((pick) => {
            const offered = section.byVariantId.get(pick.variantId);
            return offered ? [{ section, ...offered, quantity: pick.quantity }] : [];
        }),
    );

    // Removing a line removes the button that was pressed; focus goes to the summary's heading
    // rather than falling to the top of the page.
    const headingRef = useRef<HTMLHeadingElement>(null);
    return (
        <aside className="kst-summary" aria-label={text(content, 'summaryHeading')}>
            <h3 className="kst-summary__heading" ref={headingRef} tabIndex={-1}>
                {text(content, 'summaryHeading')}
            </h3>
            {lines.length === 0 && model.required.length === 0 ? <p className="kst-summary__empty">{text(content, 'summaryEmpty')}</p> : null}
            <ul className="kst-summary__lines">
                {model.required.map((entry) => (
                    <li key={`required-${entry.product.id}`} className="kst-line">
                        {entry.product.photos[0] ? <img className="kst-line__thumb" {...imageAttrs(entry.product.photos[0].url, 48)} alt="" width={48} height={48} /> : <span className="kst-line__thumb" />}
                        <span className="kst-line__title">
                            {entry.quantity > 1 ? `${entry.quantity} × ` : ''}
                            {entry.product.title}
                        </span>
                        <span className="kst-line__tag">{text(content, 'included')}</span>
                    </li>
                ))}
                {lines.map(({ section, product, variant, quantity }) => (
                    <li key={`${section.id}-${variant.id}`} className="kst-line">
                        {product.photos[0] ? <img className="kst-line__thumb" {...imageAttrs(product.photos[0].url, 48)} alt="" width={48} height={48} /> : <span className="kst-line__thumb" />}
                        <span className="kst-line__title">
                            {quantity > 1 ? `${quantity} × ` : ''}
                            {product.title}
                            {variant.title !== 'Default Title' ? <span className="kst-line__variant">{variant.title}</span> : null}
                        </span>
                        <button
                            type="button"
                            className="kst-icon-button"
                            aria-label={`${text(content, 'remove')} ${product.title}`}
                            aria-disabled={locked || undefined}
                            onClick={() => {
                                if (locked) return;
                                removeItem(section.id, variant.id);
                                headingRef.current?.focus();
                            }}
                        >
                            <CloseIcon />
                        </button>
                    </li>
                ))}
            </ul>
            <PriceBlock />
            <BuyButton buy={buy} />
            <Status buy={buy} />
        </aside>
    );
}

export function MobileBar({ buy }: { buy: BuyState }) {
    const { progress } = useSelection();
    return (
        <div className="kst-mobile-bar" data-testid="cc-mobile-bar">
            <div className="kst-mobile-bar__info">
                <span className="kst-mobile-bar__count">{pickedCount(progress)}</span>
                <PriceBlock compact />
            </div>
            <BuyButton buy={buy} />
            <Status buy={buy} />
        </div>
    );
}
