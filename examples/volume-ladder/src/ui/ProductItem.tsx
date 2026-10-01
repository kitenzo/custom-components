/*
 * One product: a compact row (ladder layout) or a card (grid layout).
 *
 * Both carry the test contract on their root (guides/the-contract.md): `data-cc-product` (the
 * Shopify handle), `data-cc-unavailable` when every variant is sold out, `data-cc-quantity` (how
 * many of it are in this step). The suites find and drive products through these, never through
 * class names or copy. Both share `usePick` and the controls, so a row and a card can never
 * disagree about what one more of a product means.
 */
import { text } from '../content';
import type { ViewProduct, ViewSection } from '../model';
import { useBuilder } from './context';
import { imageAttrs } from './images';
import { OptionPickers, QuantityControl } from './PickControls';
import { usePick } from './usePick';

function useItem(product: ViewProduct, section: ViewSection) {
    const { money, content, selection } = useBuilder();
    const pick = usePick(product, section);
    const unit = money.unitPrice(pick.variant);
    const price = content.hidePrices ? null : money.format(unit);
    const inStep = (selection.selections[section.id] ?? [])
        .filter((entry) => product.variants.some((variant) => variant.id === entry.variantId))
        .reduce((total, entry) => total + entry.quantity, 0);
    const attributes = {
        'data-cc-product': product.handle,
        'data-cc-unavailable': product.soldOut ? 'true' : undefined,
        'data-cc-quantity': inStep,
    };
    return { pick, unit, price, inStep, attributes };
}

export function ProductRow({ product, section }: { product: ViewProduct; section: ViewSection }) {
    const { content, openDetails } = useBuilder();
    const { pick, unit, price, inStep, attributes } = useItem(product, section);
    const photo = product.photos[0];
    return (
        <article className={`vol-row${product.soldOut ? ' vol-row--sold-out' : ''}${inStep > 0 ? ' vol-row--chosen' : ''}`} {...attributes}>
            <button type="button" className="vol-row__media vol-details" onClick={() => openDetails(product.id, section.id)} aria-label={`${text(content, 'details')}: ${product.title}${product.soldOut ? `, ${text(content, 'soldOut')}` : ''}`}>
                {photo ? (
                    <img {...imageAttrs(photo.url, 56)} alt="" loading="lazy" decoding="async" width={56} height={56} />
                ) : (
                    <span className="vol-placeholder" aria-hidden="true">
                        {product.title.slice(0, 1)}
                    </span>
                )}
            </button>
            <div className="vol-row__text">
                <h4 className="vol-row__title">{product.title}</h4>
                <p className="vol-row__meta">
                    {product.soldOut ? (
                        <span className="vol-row__sold-out">{text(content, 'soldOut')}</span>
                    ) : price ? (
                        <span data-vol-amount="" data-price-value={unit.toFixed(2)}>
                            {price}
                        </span>
                    ) : null}
                </p>
                <OptionPickers pick={pick} product={product} />
                <p className="vol-message" role="status">
                    {pick.message ?? ''}
                </p>
            </div>
            <div className="vol-row__actions">
                <QuantityControl pick={pick} product={product} />
            </div>
        </article>
    );
}

export function ProductCard({ product, section }: { product: ViewProduct; section: ViewSection }) {
    const { content, openDetails } = useBuilder();
    const { pick, unit, price, inStep, attributes } = useItem(product, section);
    const photo = product.photos[0];
    return (
        <article className={`vol-card${product.soldOut ? ' vol-card--sold-out' : ''}${inStep > 0 ? ' vol-card--chosen' : ''}`} {...attributes}>
            <button type="button" className="vol-card__media vol-details" onClick={() => openDetails(product.id, section.id)} aria-label={`${text(content, 'details')}: ${product.title}${product.soldOut ? `, ${text(content, 'soldOut')}` : ''}`}>
                {photo ? (
                    <img {...imageAttrs(photo.url, 360)} alt={photo.alt} loading="lazy" decoding="async" width={360} height={360} />
                ) : (
                    <span className="vol-placeholder" aria-hidden="true">
                        {product.title.slice(0, 1)}
                    </span>
                )}
                {product.soldOut ? <span className="vol-badge">{text(content, 'soldOut')}</span> : null}
                {inStep > 0 ? (
                    <span className="vol-card__qty" aria-hidden="true">
                        {inStep}
                    </span>
                ) : null}
            </button>
            <div className="vol-card__body">
                <h4 className="vol-card__title">{product.title}</h4>
                {price ? (
                    <p className="vol-card__price" data-vol-amount="" data-price-value={unit.toFixed(2)}>
                        {price}
                    </p>
                ) : null}
                <OptionPickers pick={pick} product={product} />
                {/* Above the control, so a message never pushes one card's button out of line with its neighbours'. */}
                <p className="vol-message" role="status">
                    {pick.message ?? ''}
                </p>
                <div className="vol-card__actions">
                    <QuantityControl pick={pick} product={product} />
                </div>
            </div>
        </article>
    );
}
