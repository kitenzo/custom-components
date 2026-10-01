/*
 * What is in the routine, what it costs, and the button that buys it: as a rail beside the steps
 * on wide screens and as a bar stuck to the bottom of the widget on narrow ones.
 *
 * Both carry `cc-add-to-cart` and CSS decides which one shows. JavaScript never mirrors a CSS
 * breakpoint to decide where a test id or a button goes.
 *
 * The rail lists the routine step by step, including the steps still empty, so the shopper always
 * sees the whole shape of what they are building. Each line says why it is there (the quiz's
 * reason) and opens its step in the wizard to change it.
 */
import { useBundlePrice, type BundleVariant, type UseBundleCartFlowResult } from '@kitenzo/react';

import { text } from '../content';
import type { ViewProduct, ViewSection } from '../model';
import { matchProduct, tagAsWords } from '../quiz';
import { countOf } from '../selection';
import { useBuilder } from './context';
import { imageAttrs } from './images';
import { splitTitle } from './names';

export interface BuyState {
    canAdd: boolean;
    /** Why the button will not add yet, or the cart's own sentence after a failed add. */
    status: string;
    statusIsError: boolean;
    onAdd: () => void;
    cart: UseBundleCartFlowResult;
}

export interface RoutineLine {
    section: ViewSection;
    product: ViewProduct;
    variant: BundleVariant;
    quantity: number;
}

/** The picks, step by step, in step order. */
export function useRoutineLines(sections: ViewSection[]): { section: ViewSection; lines: RoutineLine[] }[] {
    const { selection } = useBuilder();
    return sections.map((section) => ({
        section,
        lines: (selection.selections[section.id] ?? []).flatMap((pick) => {
            const product = section.products.find((candidate) => candidate.variants.some((variant) => variant.id === pick.variantId));
            const variant = product?.variants.find((candidate) => candidate.id === pick.variantId);
            return product && variant ? [{ section, product, variant, quantity: pick.quantity }] : [];
        }),
    }));
}

/**
 * Why a product is in the routine: the answers it matched, or, when the quiz chose it with nothing
 * to match, that it is the quiz's fallback. A product the shopper picked that matches nothing gets
 * no reason at all: the widget never claims a fit it did not find.
 */
export function useReason(section: ViewSection, product: ViewProduct): string | null {
    const { answers, recommended, content } = useBuilder();
    if (answers.length === 0) return null;
    const match = matchProduct(product, answers);
    if (match.score > 0) return text(content, 'routineReason', { reasons: match.tags.map(tagAsWords).join(', ') });
    const fallback = recommended.some((entry) => entry.sectionId === section.id && entry.productId === product.id && entry.matched.length === 0);
    return fallback ? text(content, 'routineFallback') : null;
}

export function PriceBlock({ compact = false }: { compact?: boolean }) {
    const { model, selection, money, content } = useBuilder();
    const price = useBundlePrice(model.bundle, selection.selections);
    if (content.hidePrices || price.discountedPrice === null) return null;
    const total = Number(price.discountedPrice);
    const original = price.originalPrice === null ? null : Number(price.originalPrice);
    const saving = original !== null && original > total ? original - total : 0;
    return (
        <div className={`skr-price${compact ? ' skr-price--compact' : ''}`}>
            <span className="skr-price__label">{text(content, 'total')}</span>
            <span className="skr-price__amounts">
                {saving > 0 && original !== null ? (
                    <s className="skr-price__compare" data-testid="cc-compare-at" data-price-value={original.toFixed(2)}>
                        {money.format(original)}
                    </s>
                ) : null}
                <strong className="skr-price__total" data-testid="cc-price" data-price-value={total.toFixed(2)}>
                    {money.format(total)}
                </strong>
            </span>
            {saving > 0 && !compact ? (
                <span className="skr-price__saving" data-testid="cc-saving" data-price-value={saving.toFixed(2)}>
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
            className="skr-button skr-button--primary skr-buy"
            data-testid="cc-add-to-cart"
            aria-disabled={!buy.canAdd || buy.cart.isAdding || undefined}
            aria-busy={buy.cart.isAdding || undefined}
            onClick={buy.onAdd}
        >
            {label}
        </button>
    );
}

/**
 * Two live regions, always in the page: a screen reader only announces a region it already knew
 * about, so the text changes and the elements never come and go.
 */
function Status({ buy }: { buy: BuyState }) {
    return (
        <div className="skr-status-wrap">
            <p className="skr-status" role="status">
                {buy.statusIsError ? '' : buy.status}
            </p>
            <p className="skr-status skr-status--error" role="alert" data-testid="cc-cart-error">
                {buy.statusIsError ? buy.status : ''}
            </p>
        </div>
    );
}

function Line({ line }: { line: RoutineLine }) {
    const { money, content, goToStep } = useBuilder();
    const reason = useReason(line.section, line.product);
    const { name } = splitTitle(line.product.title);
    const size = line.variant.title !== 'Default Title' ? line.variant.title : '';
    const price = content.hidePrices ? null : money.format(money.unitPrice(line.variant) * line.quantity);
    return (
        <li className="skr-line">
            {line.product.photos[0] ? (
                <img className="skr-line__thumb" {...imageAttrs(line.product.photos[0].url, 56)} alt="" width={56} height={56} />
            ) : (
                <span className="skr-line__thumb" />
            )}
            <span className="skr-line__text">
                <span className="skr-line__step">{line.section.name}</span>
                <span className="skr-line__title">
                    {line.quantity > 1 ? `${line.quantity} × ` : ''}
                    {name}
                </span>
                <span className="skr-line__detail">{[size, price].filter(Boolean).join(' · ')}</span>
                {reason ? <span className="skr-line__reason">{reason}</span> : null}
            </span>
            <button type="button" className="skr-link skr-line__change" onClick={() => goToStep(line.section.id)} aria-label={`${text(content, 'change')}: ${line.section.name}`}>
                {text(content, 'change')}
            </button>
        </li>
    );
}

export function SummaryRail({ buy, sections, showLines }: { buy: BuyState; sections: ViewSection[]; showLines: boolean }) {
    const { model, content, goToStep } = useBuilder();
    const steps = useRoutineLines(sections);

    return (
        <aside className={`skr-summary${showLines ? '' : ' skr-summary--totals'}`} aria-label={text(content, 'summaryHeading')}>
            {showLines ? (
                <>
                    <h3 className="skr-summary__heading">{text(content, 'summaryHeading')}</h3>
                    <ul className="skr-summary__lines">
                        {model.required.map((entry) => (
                            <li key={`required-${entry.product.id}`} className="skr-line">
                                {entry.product.photos[0] ? (
                                    <img className="skr-line__thumb" {...imageAttrs(entry.product.photos[0].url, 56)} alt="" width={56} height={56} />
                                ) : (
                                    <span className="skr-line__thumb" />
                                )}
                                <span className="skr-line__text">
                                    <span className="skr-line__step">{text(content, 'included')}</span>
                                    <span className="skr-line__title">
                                        {entry.quantity > 1 ? `${entry.quantity} × ` : ''}
                                        {splitTitle(entry.product.title).name}
                                    </span>
                                </span>
                            </li>
                        ))}
                        {steps.flatMap(({ section, lines }) =>
                            lines.length > 0
                                ? lines.map((line) => <Line key={`${section.id}-${line.variant.id}`} line={line} />)
                                : [
                                      <li key={`empty-${section.id}`} className="skr-line skr-line--empty">
                                          <span className="skr-line__thumb" />
                                          <span className="skr-line__text">
                                              <span className="skr-line__step">{section.name}</span>
                                              <span className="skr-line__title">{text(content, 'stepEmpty')}</span>
                                          </span>
                                          <button type="button" className="skr-link skr-line__change" onClick={() => goToStep(section.id)} aria-label={`${text(content, 'choose')}: ${section.name}`}>
                                              {text(content, 'choose')}
                                          </button>
                                      </li>,
                                  ],
                        )}
                    </ul>
                </>
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
        <div className="skr-mobile-bar" data-testid="cc-mobile-bar">
            <div className="skr-mobile-bar__info">
                <span className="skr-mobile-bar__count">{countOf(selection.selections)}</span>
                <PriceBlock compact />
            </div>
            <BuyButton buy={buy} />
            <Status buy={buy} />
        </div>
    );
}
