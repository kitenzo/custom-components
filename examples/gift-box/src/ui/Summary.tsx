/*
 * What is in the box, what it costs, and the button that buys it: as a rail beside the steps on
 * wide screens and as a bar stuck to the bottom of the widget on narrow ones. The rail opens with
 * the box drawn, filled with what the shopper chose, and lists each item with what was written
 * for it, so an engraving is checked before it is paid for.
 *
 * Both carry `cc-add-to-cart` and CSS decides which one shows. JavaScript never mirrors a CSS
 * breakpoint to decide where a test id or a button goes.
 */
import { useRef, type CSSProperties, type RefObject } from 'react';

import { useBundlePrice, type BundleVariant, type UseBundleCartFlowResult } from '@kitenzo/react';

import { text } from '../content';
import type { ViewProduct, ViewSection } from '../model';
import { normalise } from '../personalisation';
import { countOf } from '../selection';
import { tintFor } from './art';
import { useBuilder } from './context';
import { CloseIcon } from './Icons';
import { ProductArt } from './ProductArt';

export interface BuyState {
    canAdd: boolean;
    /** Why the button will not add yet, or the cart's own sentence after a failed add. */
    status: string;
    statusIsError: boolean;
    onAdd: () => void;
    cart: UseBundleCartFlowResult;
}

function PriceBlock({ compact = false }: { compact?: boolean }) {
    const { model, selection, money, content } = useBuilder();
    const price = useBundlePrice(model.bundle, selection.selections);
    if (content.hidePrices || price.discountedPrice === null) return null;
    const total = Number(price.discountedPrice);
    const original = price.originalPrice === null ? null : Number(price.originalPrice);
    const saving = original !== null && original > total ? original - total : 0;
    return (
        <div className={`gft-price${compact ? ' gft-price--compact' : ''}`}>
            <span className="gft-price__label">{text(content, 'total')}</span>
            <span className="gft-price__amounts">
                {saving > 0 && original !== null ? (
                    <s className="gft-price__compare" data-testid="cc-compare-at" data-price-value={original.toFixed(2)}>
                        {money.format(original)}
                    </s>
                ) : null}
                <strong className="gft-price__total" data-testid="cc-price" data-price-value={total.toFixed(2)}>
                    {money.format(total)}
                </strong>
            </span>
            {saving > 0 && !compact ? (
                <span className="gft-price__saving" data-testid="cc-saving" data-price-value={saving.toFixed(2)}>
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
            className="gft-button gft-button--primary gft-buy"
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
        <div className="gft-status-wrap">
            <p className="gft-status" role="status">
                {buy.statusIsError ? '' : buy.status}
            </p>
            <p className="gft-status gft-status--error" role="alert" data-testid="cc-cart-error">
                {buy.statusIsError ? buy.status : ''}
            </p>
        </div>
    );
}

interface Line {
    section: ViewSection | null;
    product: ViewProduct;
    variant: BundleVariant | undefined;
    quantity: number;
    required: boolean;
}

/** What the shopper wrote for a product, as "label: answer" pairs, blank answers left out. */
function useWritten(product: ViewProduct): { label: string; value: string }[] {
    const { answers } = useBuilder();
    return product.fields.flatMap((field) => {
        const value = normalise(field, answers[product.id]?.[field.id]);
        return value ? [{ label: field.label, value }] : [];
    });
}

function SummaryLine({ line, heading }: { line: Line; heading: RefObject<HTMLHeadingElement> }) {
    const { content, locked, selection } = useBuilder();
    const { section, product, variant, quantity, required } = line;
    const written = useWritten(product);
    return (
        <li className="gft-line">
            <ProductArt product={product} variant={variant} width={48} className="gft-line__thumb" decorative />
            <span className="gft-line__title">
                {quantity > 1 ? `${quantity} × ` : ''}
                {product.title}
                {variant && variant.title !== 'Default Title' ? <span className="gft-line__variant">{variant.title}</span> : null}
                {written.map((entry) => (
                    <span key={entry.label} className="gft-line__written">
                        <span className="gft-line__written-label">{entry.label}</span> “{entry.value}”
                    </span>
                ))}
            </span>
            {required || !section || !variant ? (
                <span className="gft-line__tag">{text(content, 'included')}</span>
            ) : (
                <button
                    type="button"
                    className="gft-icon-button"
                    aria-label={`${text(content, 'remove')} ${product.title}`}
                    aria-disabled={locked || undefined}
                    onClick={() => {
                        if (locked) return;
                        selection.builder.removeItem(section.id, variant.id);
                        heading.current?.focus();
                    }}
                >
                    <CloseIcon />
                </button>
            )}
        </li>
    );
}

/**
 * The box, drawn: the first step's choice is the box (its colour paints the tray), everything
 * else sits inside it, one tile per item. A preview, not a promise of arrangement: it says "this
 * is what is going in", at a glance, before the list says it in words.
 */
function BoxPreview({ lines }: { lines: Line[] }) {
    const { model, content, answers } = useBuilder();
    const first = model.sections[0];
    const frame = first ? lines.find((line) => line.section?.id === first.id) : undefined;
    const tint = frame ? tintFor(frame.product.product, frame.variant) : null;
    const contents = lines.filter((line) => line !== frame).flatMap((line) => Array.from({ length: Math.min(line.quantity, 6) }, (_, index) => ({ line, index })));
    const inscription = (product: ViewProduct) => {
        const field = product.fields.find((candidate) => candidate.type === 'text' && candidate.characterLimit && candidate.characterLimit <= 40);
        return field ? (answers[product.id]?.[field.id] ?? '').trim() : '';
    };
    return (
        <div
            className={`gft-tray${frame ? '' : ' gft-tray--empty'}`}
            style={tint ? ({ '--gft-tray': tint } as CSSProperties) : undefined}
            aria-hidden="true"
        >
            {frame || contents.length > 0 ? (
                <div className="gft-tray__inside">
                    {contents.map(({ line, index }) => (
                        <ProductArt
                            key={`${line.section?.id ?? 'required'}-${line.variant?.id ?? line.product.id}-${index}`}
                            product={line.product}
                            variant={line.variant}
                            inscription={inscription(line.product)}
                            width={72}
                            className="gft-tray__item"
                            decorative
                        />
                    ))}
                </div>
            ) : (
                <p className="gft-tray__empty">{text(content, 'summaryEmpty')}</p>
            )}
            {frame ? (
                <p className="gft-tray__label">
                    {frame.product.title}
                    {frame.variant && frame.variant.title !== 'Default Title' ? ` · ${frame.variant.title}` : ''}
                </p>
            ) : null}
        </div>
    );
}

export function SummaryRail({ buy }: { buy: BuyState }) {
    const { model, selection, content } = useBuilder();
    // Removing a line removes the button that was pressed; focus goes to the summary's heading
    // rather than to the top of the page.
    const headingRef = useRef<HTMLHeadingElement>(null);
    const lines: Line[] = [
        ...model.sections.flatMap((section) =>
            (selection.selections[section.id] ?? []).flatMap((pick) => {
                const product = section.products.find((candidate) => candidate.variants.some((variant) => variant.id === pick.variantId));
                const variant = product?.variants.find((candidate) => candidate.id === pick.variantId);
                return product && variant ? [{ section, product, variant, quantity: pick.quantity, required: false }] : [];
            }),
        ),
        ...model.required.map((entry) => ({ section: null, product: entry.product, variant: undefined, quantity: entry.quantity, required: true })),
    ];

    return (
        <aside className="gft-summary" aria-label={text(content, 'summaryHeading')}>
            <h3 className="gft-summary__heading" ref={headingRef} tabIndex={-1}>
                {text(content, 'summaryHeading')}
            </h3>
            <BoxPreview lines={lines} />
            {lines.length > 0 ? (
                <ul className="gft-summary__lines">
                    {lines.map((line) => (
                        <SummaryLine key={`${line.section?.id ?? 'required'}-${line.variant?.id ?? line.product.id}`} line={line} heading={headingRef} />
                    ))}
                </ul>
            ) : null}
            <PriceBlock />
            <BuyButton buy={buy} />
            <Status buy={buy} />
        </aside>
    );
}

export function MobileBar({ buy }: { buy: BuyState }) {
    const { selection } = useBuilder();
    return (
        <div className="gft-mobile-bar" data-testid="cc-mobile-bar">
            <div className="gft-mobile-bar__info">
                <span className="gft-mobile-bar__count">{countOf(selection.selections)}</span>
                <PriceBlock compact />
            </div>
            <BuyButton buy={buy} />
            <Status buy={buy} />
        </div>
    );
}
