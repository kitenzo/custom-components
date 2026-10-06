/*
 * One product in a step.
 *
 * Carries the test contract on its root (guides/the-contract.md): `data-cc-product` (the
 * Shopify handle), `data-cc-unavailable` when every variant is sold out, `data-cc-quantity` (how
 * many of it are in this step). The suites find and drive products through these, never through
 * class names or copy.
 */
import { memo } from 'react';

import { text } from '../content';
import type { ViewProduct, ViewSection } from '../model';
import { useBuilder, useSelection } from './context';
import { imageAttrs } from './images';
import { OptionPickers, QuantityControl } from './PickControls';
import { usePick } from './usePick';

/*
 * Memoised on the product and its step, both kept by the model between picks. A card is drawn
 * again by its own state or by a change to either context, never by the Builder alone.
 */
export const ProductCard = memo(function ProductCard({ product, section }: { product: ViewProduct; section: ViewSection }) {
    const { money, content, openDetails } = useBuilder();
    const { selections } = useSelection();
    const pick = usePick(product, section);
    const photo = product.photos[0];
    const price = content.hidePrices ? null : money.format(money.unitPrice(pick.variant));
    const inStep = (selections[section.id] ?? [])
        .filter((entry) => product.variants.some((variant) => variant.id === entry.variantId))
        .reduce((total, entry) => total + entry.quantity, 0);

    return (
        <article
            className={`kst-card${product.soldOut ? ' kst-card--sold-out' : ''}${inStep > 0 ? ' kst-card--chosen' : ''}`}
            data-cc-product={product.handle}
            data-cc-unavailable={product.soldOut ? 'true' : undefined}
            data-cc-quantity={inStep}
        >
            <button type="button" className="kst-card__media" onClick={() => openDetails(product.id, section.id)} aria-label={`${text(content, 'details')}: ${product.title}${product.soldOut ? `, ${text(content, 'soldOut')}` : ''}`}>
                {photo ? (
                    <img {...imageAttrs(photo.url, 320)} alt={photo.alt} loading="lazy" decoding="async" width={320} height={320} />
                ) : (
                    <span className="kst-card__placeholder" aria-hidden="true">
                        {product.title.slice(0, 1)}
                    </span>
                )}
                {product.soldOut ? <span className="kst-badge kst-badge--muted">{text(content, 'soldOut')}</span> : null}
            </button>
            <div className="kst-card__body">
                <h4 className="kst-card__title">{product.title}</h4>
                {price ? (
                    <p className="kst-card__price" data-price-value={money.unitPrice(pick.variant).toFixed(2)}>
                        {price}
                    </p>
                ) : null}
                <OptionPickers pick={pick} product={product} />
                <div className="kst-card__actions">
                    <QuantityControl pick={pick} product={product} />
                </div>
                <p className="kst-card__message" role="status">
                    {pick.message ?? ''}
                </p>
            </div>
        </article>
    );
});
