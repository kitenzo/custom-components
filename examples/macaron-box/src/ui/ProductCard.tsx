/*
 * One product in a step.
 *
 * Carries the test contract on its root (guides/the-contract.md): `data-cc-product` (the
 * Shopify handle), `data-cc-unavailable` when every variant is sold out, `data-cc-quantity` (how
 * many of it are in this step). The suites find and drive products through these, never through
 * class names or copy.
 */
import { text } from '../content';
import type { ViewProduct, ViewSection } from '../model';
import { useBuilder } from './context';
import { imageAttrs } from './images';
import { OptionPickers, QuantityControl } from './PickControls';
import { usePick } from './usePick';

export function ProductCard({ product, section }: { product: ViewProduct; section: ViewSection }) {
    const { money, content, openDetails, selection, box } = useBuilder();
    const pick = usePick(product, section);
    const photo = product.photos[0];
    // In a box sold at a set price per size, one macaron's own price is not what anyone pays, so
    // the card leaves it out and the size cards carry the price. Anywhere else, it shows.
    const setPriced = box?.section.id === section.id && box.setPriced;
    const price = content.hidePrices || setPriced ? null : money.format(money.unitPrice(pick.variant));
    const inStep = (selection.selections[section.id] ?? [])
        .filter((entry) => product.variants.some((variant) => variant.id === entry.variantId))
        .reduce((total, entry) => total + entry.quantity, 0);

    return (
        <article
            className={`mcb-card${product.soldOut ? ' mcb-card--sold-out' : ''}${inStep > 0 ? ' mcb-card--chosen' : ''}`}
            data-cc-product={product.handle}
            data-cc-unavailable={product.soldOut ? 'true' : undefined}
            data-cc-quantity={inStep}
        >
            <button type="button" className="mcb-card__media" onClick={() => openDetails(product.id, section.id)} aria-label={`${text(content, 'details')}: ${product.title}${product.soldOut ? `, ${text(content, 'soldOut')}` : ''}`}>
                {photo ? (
                    <img {...imageAttrs(photo.url, 320)} alt={photo.alt} loading="lazy" decoding="async" width={320} height={320} />
                ) : (
                    <span className="mcb-card__placeholder" aria-hidden="true">
                        {product.title.slice(0, 1)}
                    </span>
                )}
                {product.soldOut ? <span className="mcb-badge mcb-badge--muted">{text(content, 'soldOut')}</span> : null}
                {inStep > 0 ? (
                    <span className="mcb-card__count" aria-hidden="true">
                        {inStep}
                    </span>
                ) : null}
            </button>
            <div className="mcb-card__body">
                <h4 className="mcb-card__title">{product.title}</h4>
                {price ? (
                    <p className="mcb-card__price" data-price-value={money.unitPrice(pick.variant).toFixed(2)}>
                        {price}
                    </p>
                ) : null}
                <OptionPickers pick={pick} product={product} />
                <div className="mcb-card__actions">
                    <QuantityControl pick={pick} product={product} />
                </div>
                <p className="mcb-card__message" role="status">
                    {pick.message ?? ''}
                </p>
            </div>
        </article>
    );
}
