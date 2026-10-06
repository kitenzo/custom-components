/*
 * "Your set": every step's piece (or that it is still to choose), the set price, a line for each
 * surcharge, the total, and the button that buys it. A rail beside the pieces on wide screens; on
 * narrow ones it sits under them and a bar stuck to the bottom of the widget carries the total and
 * the button.
 *
 * Both buy surfaces carry `cc-add-to-cart` and CSS decides which one shows. JavaScript never
 * mirrors a CSS breakpoint to decide where a test id or a button goes.
 *
 * Every amount is the SDK's: the total is `useBundlePrice`, which for a set price knows the
 * answer before the first pick, the set price is `resolveUpfrontPrice` and each surcharge is
 * `money.surcharge`. The lines above the total explain it, they never compute a different one.
 */
import { useRef } from 'react';

import { useBundlePrice, type UseBundleCartFlowResult } from '@kitenzo/react';

import { text } from '../content';
import { surchargeCause } from '../options';
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
    // Before the first pick only the set price is known: a total, with nothing to compare it to.
    // `hasDiscount` is true only for a total below the pieces bought apart, so a surcharge that
    // lifts the set above them never strikes a lower price through beside a higher one.
    const total = price.amounts?.discounted ?? Number(price.discountedPrice);
    const original = price.hasDiscount ? (price.amounts?.original ?? null) : null;
    const saving = price.hasDiscount ? (price.amounts?.saved ?? 0) : 0;
    return (
        <div className={`aws-price${compact ? ' aws-price--compact' : ''}`}>
            <span className="aws-price__label">{text(content, 'total')}</span>
            <span className="aws-price__amounts">
                {saving > 0 && original !== null ? (
                    <s className="aws-price__compare" data-testid="cc-compare-at" data-price-value={original.toFixed(2)}>
                        {money.format(original)}
                    </s>
                ) : null}
                <strong className="aws-price__total" data-testid="cc-price" data-price-value={total.toFixed(2)}>
                    {money.format(total)}
                </strong>
            </span>
            {saving > 0 && !compact ? (
                <span className="aws-price__saving" data-testid="cc-saving" data-price-value={saving.toFixed(2)}>
                    {text(content, 'saving', { amount: money.format(saving) })}
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
            className="aws-button aws-button--primary aws-buy"
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
        <div className="aws-status-wrap">
            <p className="aws-status" role="status">
                {buy.statusIsError ? '' : buy.status}
            </p>
            <p className="aws-status aws-status--error" role="alert" data-testid="cc-cart-error">
                {buy.statusIsError ? buy.status : ''}
            </p>
        </div>
    );
}

export function SummaryRail({ buy }: { buy: BuyState }) {
    const { model, content, money, setPrice, removeItem } = useBuilder();
    const { selections, locked } = useSelection();
    // One row per step, filled or not: a set is read as its pieces, in order.
    const rows = model.sections.map((section) => {
        const pick = (selections[section.id] ?? []).find((entry) => section.byVariantId.has(entry.variantId));
        const offered = pick ? section.byVariantId.get(pick.variantId) : undefined;
        return { section, product: offered?.product, variant: offered?.variant, quantity: pick?.quantity ?? 0 };
    });
    const surcharges = rows.flatMap(({ section, product, variant, quantity }) => {
        if (!product || !variant) return [];
        const amount = money.surcharge(variant) * quantity;
        return amount > 0 ? [{ section, amount, cause: surchargeCause(product.product, variant, money.surcharge) }] : [];
    });
    const showPrices = !content.hidePrices;
    // Removing a piece removes the button that was pressed; focus goes to the panel's heading
    // rather than falling to the top of the page.
    const headingRef = useRef<HTMLHeadingElement>(null);

    return (
        <aside className="aws-summary" aria-label={text(content, 'summaryHeading')}>
            <h3 className="aws-summary__heading" ref={headingRef} tabIndex={-1}>
                {text(content, 'summaryHeading')}
            </h3>
            <ul className="aws-summary__lines">
                {model.required.map((entry) => (
                    <li key={`required-${entry.product.id}`} className="aws-line">
                        {entry.product.photos[0] ? <img className="aws-line__thumb" {...imageAttrs(entry.product.photos[0].url, 56)} alt="" width={56} height={70} /> : <span className="aws-line__thumb" />}
                        <span className="aws-line__text">
                            <span className="aws-line__title">
                                {entry.quantity > 1 ? `${entry.quantity} × ` : ''}
                                {entry.product.title}
                            </span>
                        </span>
                        <span className="aws-line__tag">{text(content, 'included')}</span>
                    </li>
                ))}
                {rows.map(({ section, product, variant }) => {
                    const image = variant?.image ?? product?.photos[0]?.url;
                    return (
                        <li key={section.id} className={`aws-line${variant ? '' : ' aws-line--empty'}`}>
                            {image ? <img className="aws-line__thumb" {...imageAttrs(image, 56)} alt="" width={56} height={70} /> : <span className="aws-line__thumb" aria-hidden="true" />}
                            <span className="aws-line__text">
                                <span className="aws-line__step">{section.name}</span>
                                {product && variant ? (
                                    <>
                                        <span className="aws-line__title">{product.title}</span>
                                        {variant.title !== 'Default Title' ? <span className="aws-line__variant">{variant.title}</span> : null}
                                    </>
                                ) : (
                                    <span className="aws-line__title aws-line__title--muted">{section.limits.min === 0 ? text(content, 'stepOptional') : text(content, 'summaryNotChosen')}</span>
                                )}
                            </span>
                            {product && variant ? (
                                <button
                                    type="button"
                                    className="aws-icon-button"
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
                            ) : null}
                        </li>
                    );
                })}
            </ul>
            {showPrices && (setPrice !== null || surcharges.length > 0) ? (
                <dl className="aws-breakdown">
                    {setPrice !== null ? (
                        <div className="aws-breakdown__row">
                            <dt>{text(content, 'setPrice')}</dt>
                            <dd data-price-value={setPrice.toFixed(2)}>{money.format(setPrice)}</dd>
                        </div>
                    ) : null}
                    {surcharges.map((entry) => (
                        <div key={entry.section.id} className="aws-breakdown__row aws-breakdown__row--extra" data-testid="aws-surcharge-line">
                            <dt>{text(content, 'surchargeLine', { step: entry.section.name, value: entry.cause })}</dt>
                            <dd data-price-value={entry.amount.toFixed(2)}>+{money.format(entry.amount)}</dd>
                        </div>
                    ))}
                </dl>
            ) : null}
            <PriceBlock />
            <BuyButton buy={buy} />
            <Status buy={buy} />
        </aside>
    );
}

export function MobileBar({ buy }: { buy: BuyState }) {
    const { model } = useBuilder();
    const { progress } = useSelection();
    return (
        <div className="aws-mobile-bar" data-testid="cc-mobile-bar">
            <div className="aws-mobile-bar__info">
                <span className="aws-mobile-bar__count">
                    {pickedCount(progress)}/{model.sections.length}
                </span>
                <PriceBlock compact />
            </div>
            <BuyButton buy={buy} />
            <Status buy={buy} />
        </div>
    );
}
