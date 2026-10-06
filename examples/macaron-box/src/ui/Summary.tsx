/*
 * The box, what it costs, and the button that buys it: as a rail beside the flavours on wide
 * screens and as a bar stuck to the bottom of the widget on narrow ones, where the box shrinks to
 * a strip of dots.
 *
 * Both carry `cc-add-to-cart` and CSS decides which one shows. JavaScript never mirrors a CSS
 * breakpoint to decide where a test id or a button goes.
 */
import { useBundlePrice, type UseBundleCartFlowResult } from '@kitenzo/react';

import { text } from '../content';
import { useBuilder, useSelection } from './context';
import { CloseIcon } from './Icons';
import { imageAttrs } from './images';
import { Tray, TrayStrip } from './Tray';

export interface BuyState {
    canAdd: boolean;
    /** The box is full and the SDK accepts it: the price shown is the price charged. */
    complete: boolean;
    /** Why the button will not add yet, or the cart's own sentence after a failed add. */
    status: string;
    statusIsError: boolean;
    onAdd: () => void;
    cart: UseBundleCartFlowResult;
}

/**
 * The total. Once the box is complete it is the SDK's price for exactly what is in it, with the
 * test contract's ids. Until then, a box of 12 holding 7 has no meaningful total (the tier for
 * "at least 6" would price it as a box of 6), so the rail shows what the chosen box will cost:
 * the same SDK price, computed for that size in box.ts.
 */
function PriceBlock({ buy, compact = false }: { buy: BuyState; compact?: boolean }) {
    const { model, money, content, box } = useBuilder();
    const { selections, size } = useSelection();
    const price = useBundlePrice(model.bundle, selections, { locale: document.documentElement.lang || undefined });
    if (content.hidePrices) return null;

    const offer = size !== null ? box?.offers.find((candidate) => candidate.size === size) : undefined;
    if (!buy.complete && box && box.sizes.length > 0) {
        if (!offer) return null;
        return (
            <div className={`mcb-price mcb-price--pending${compact ? ' mcb-price--compact' : ''}`}>
                <span className="mcb-price__label">{text(content, 'sizeOption', { count: offer.size })}</span>
                <span className="mcb-price__amounts">
                    {offer.compareAt && !compact ? <s className="mcb-price__compare">{money.format(offer.compareAt)}</s> : null}
                    <strong className="mcb-price__total">{offer.exact ? money.format(offer.price) : text(content, 'sizeFrom', { amount: money.format(offer.price) ?? '' })}</strong>
                </span>
            </div>
        );
    }

    if (price.discountedPrice === null) return null;
    const total = price.amounts?.discounted ?? Number(price.discountedPrice);
    const original = price.hasDiscount ? (price.amounts?.original ?? null) : null;
    const saving = price.hasDiscount ? (price.amounts?.saved ?? 0) : 0;
    return (
        <div className={`mcb-price${compact ? ' mcb-price--compact' : ''}`}>
            <span className="mcb-price__label">{text(content, 'total')}</span>
            <span className="mcb-price__amounts">
                {saving > 0 && original !== null ? (
                    <s className="mcb-price__compare" data-testid="cc-compare-at" data-price-value={original.toFixed(2)}>
                        {money.format(original)}
                    </s>
                ) : null}
                <strong className="mcb-price__total" data-testid="cc-price" data-price-value={total.toFixed(2)}>
                    {money.format(total)}
                </strong>
            </span>
            {saving > 0 && !compact ? (
                <span className="mcb-price__saving" data-testid="cc-saving" data-price-value={saving.toFixed(2)}>
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
            className="mcb-button mcb-button--primary mcb-buy"
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
        <div className="mcb-status-wrap">
            <p className="mcb-status" role="status">
                {buy.statusIsError ? '' : buy.status}
            </p>
            <p className="mcb-status mcb-status--error" role="alert" data-testid="cc-cart-error">
                {buy.statusIsError ? buy.status : ''}
            </p>
        </div>
    );
}

/** Required products and picks from any step that is not the box: listed, as the starter lists them. */
function OtherLines() {
    const { model, content, box, idPrefix, removeItem } = useBuilder();
    const { selections, locked } = useSelection();
    const lines = model.sections
        .filter((section) => section.id !== box?.section.id)
        .flatMap((section) =>
            (selections[section.id] ?? []).flatMap((pick) => {
                const offered = section.byVariantId.get(pick.variantId);
                return offered ? [{ section, ...offered, quantity: pick.quantity }] : [];
            }),
        );
    if (lines.length === 0 && model.required.length === 0) return null;
    return (
        <ul className="mcb-lines">
            {model.required.map((entry) => (
                <li key={`required-${entry.product.id}`} className="mcb-line">
                    {entry.product.photos[0] ? <img className="mcb-line__thumb" {...imageAttrs(entry.product.photos[0].url, 40)} alt="" width={40} height={40} /> : <span className="mcb-line__thumb" />}
                    <span className="mcb-line__title">
                        {entry.quantity > 1 ? `${entry.quantity} × ` : ''}
                        {entry.product.title}
                    </span>
                    <span className="mcb-line__tag">{text(content, 'included')}</span>
                </li>
            ))}
            {lines.map(({ section, product, variant, quantity }) => (
                <li key={`${section.id}-${variant.id}`} className="mcb-line">
                    {product.photos[0] ? <img className="mcb-line__thumb" {...imageAttrs(product.photos[0].url, 40)} alt="" width={40} height={40} /> : <span className="mcb-line__thumb" />}
                    <span className="mcb-line__title">
                        {quantity > 1 ? `${quantity} × ` : ''}
                        {product.title}
                        {variant.title !== 'Default Title' ? <span className="mcb-line__variant">{variant.title}</span> : null}
                    </span>
                    <button
                        type="button"
                        className="mcb-icon-button"
                        aria-label={`${text(content, 'remove')} ${product.title}`}
                        aria-disabled={locked || undefined}
                        onClick={() => {
                            if (locked) return;
                            removeItem(section.id, variant.id);
                            // The pressed button is gone; focus the box's heading, not the page top.
                            document.getElementById(`${idPrefix}-summary-heading`)?.focus();
                        }}
                    >
                        <CloseIcon />
                    </button>
                </li>
            ))}
        </ul>
    );
}

function TrayHeader() {
    const { box, content, idPrefix } = useBuilder();
    const { progress, size, slots } = useSelection();
    const count = box ? (progress.sections[box.section.id]?.quantity ?? 0) : 0;
    return (
        <header className="mcb-summary__header">
            <div>
                {/* Focusable from script only: removing a macaron removes the button pressed, and
                    focus lands here rather than falling to the top of the page. */}
                <h3 className="mcb-eyebrow mcb-summary__heading" id={`${idPrefix}-summary-heading`} tabIndex={-1}>
                    {text(content, 'summaryHeading')}
                </h3>
                {size !== null ? <p className="mcb-summary__title">{text(content, 'sizeOption', { count: size })}</p> : null}
            </div>
            {slots !== null ? (
                <span className="mcb-summary__count" data-testid="mcb-tray-count">
                    {text(content, 'trayCount', { count, size: slots })}
                </span>
            ) : null}
            {slots !== null ? (
                <span className="mcb-progress" aria-hidden="true">
                    <span className="mcb-progress__bar" style={{ transform: `scaleX(${slots > 0 ? Math.min(1, count / slots) : 0})` }} />
                </span>
            ) : null}
        </header>
    );
}

export function SummaryRail({ buy, trayId }: { buy: BuyState; trayId: string }) {
    const { content, box } = useBuilder();
    const { selections, size } = useSelection();
    // The hint for an empty box. Not while no size is chosen: the tray asks for one instead.
    const waitingForSize = box !== null && box.sizes.length > 0 && size === null;
    const nothing = !waitingForSize && Object.values(selections).every((picks) => picks.length === 0);
    return (
        <aside className="mcb-summary" aria-label={text(content, 'summaryHeading')}>
            <TrayHeader />
            <Tray id={trayId} />
            {nothing ? <p className="mcb-summary__empty">{text(content, 'summaryEmpty')}</p> : null}
            <OtherLines />
            <PriceBlock buy={buy} />
            <BuyButton buy={buy} />
            <Status buy={buy} />
        </aside>
    );
}

export function MobileBar({ buy, trayId }: { buy: BuyState; trayId: string }) {
    return (
        <div className="mcb-mobile-bar" data-testid="cc-mobile-bar">
            <TrayStrip target={trayId} />
            <div className="mcb-mobile-bar__row">
                <PriceBlock buy={buy} compact />
                <BuyButton buy={buy} />
            </div>
            <Status buy={buy} />
        </div>
    );
}
