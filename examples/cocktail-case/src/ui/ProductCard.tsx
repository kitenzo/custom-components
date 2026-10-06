/*
 * One can in the grid.
 *
 * Carries the test contract on its root (guides/the-contract.md): `data-cc-product` (the
 * Shopify handle), `data-cc-unavailable` when every variant is sold out, `data-cc-quantity` (how
 * many of it are in this step). The suites find and drive products through these, never through
 * class names or copy.
 *
 * `outsideFilter` is a can the active filters would hide but that is in the case: it stays, marked
 * "In your case", so the shopper can still see it and take it out.
 */
import { memo } from 'react';

import { text } from '../content';
import { facetLabelsOf } from '../facets';
import type { ViewProduct, ViewSection } from '../model';
import { useBuilder, useSelection } from './context';
import { imageAttrs } from './images';
import { OptionPickers, QuantityControl } from './PickControls';
import { usePick } from './usePick';

/*
 * Memoised on the product and its step, both kept by the model between picks. A card is drawn
 * again by its own state or by a change to either context, never by the Builder alone.
 */
export const ProductCard = memo(function ProductCard({ product, section, outsideFilter = false }: { product: ViewProduct; section: ViewSection; outsideFilter?: boolean }) {
    const { money, content, openDetails, facets } = useBuilder();
    const { selections } = useSelection();
    const pick = usePick(product, section);
    const photo = product.photos[0];
    const price = content.hidePrices ? null : money.format(money.unitPrice(pick.variant));
    const inStep = (selections[section.id] ?? [])
        .filter((entry) => product.variants.some((variant) => variant.id === entry.variantId))
        .reduce((total, entry) => total + entry.quantity, 0);
    const labels = facetLabelsOf(product.id, facets);

    return (
        <article
            className={`ckc-card${product.soldOut ? ' ckc-card--sold-out' : ''}${inStep > 0 ? ' ckc-card--chosen' : ''}${outsideFilter ? ' ckc-card--outside' : ''}`}
            data-cc-product={product.handle}
            data-cc-unavailable={product.soldOut ? 'true' : undefined}
            data-cc-quantity={inStep}
            data-ckc-outside-filter={outsideFilter || undefined}
        >
            <button type="button" className="ckc-card__media" onClick={() => openDetails(product.id, section.id)} aria-label={`${text(content, 'details')}: ${product.title}${product.soldOut ? `, ${text(content, 'soldOut')}` : ''}`}>
                {photo ? (
                    <img {...imageAttrs(photo.url, 360)} alt={photo.alt} loading="lazy" decoding="async" width={360} height={360} />
                ) : (
                    <span className="ckc-card__placeholder" aria-hidden="true">
                        {product.title.slice(0, 1)}
                    </span>
                )}
                {product.soldOut ? <span className="ckc-badge ckc-badge--muted">{text(content, 'soldOut')}</span> : null}
                {inStep > 0 ? (
                    <span className="ckc-badge ckc-badge--case">
                        {text(content, 'inCase')}
                        <span className="ckc-badge__count">{inStep}</span>
                    </span>
                ) : null}
            </button>
            <div className="ckc-card__body">
                <h4 className="ckc-card__title">{product.title}</h4>
                {labels.length > 0 || price ? (
                    <div className="ckc-card__meta">
                        {price ? (
                            <span className="ckc-card__price" data-price-value={money.unitPrice(pick.variant).toFixed(2)}>
                                {price}
                            </span>
                        ) : null}
                        {labels.map((label) => (
                            <span key={label} className="ckc-card__tag">
                                {label}
                            </span>
                        ))}
                    </div>
                ) : null}
                <OptionPickers pick={pick} product={product} />
                <div className="ckc-card__actions">
                    <QuantityControl pick={pick} product={product} />
                </div>
                <p className="ckc-card__message" role="status">
                    {pick.message ?? ''}
                </p>
            </div>
        </article>
    );
});
