/*
 * One product in a step.
 *
 * Carries the test contract on its root (guides/the-contract.md): `data-cc-product` (the
 * Shopify handle), `data-cc-unavailable` when every variant is sold out, `data-cc-quantity` (how
 * many of it are in this step). The suites find and drive products through these, never through
 * class names or copy.
 *
 * After the quiz, a card says what it has to do with the shopper's answers: "Recommended for
 * you" on the product the quiz chose for this step, and "Matches: dry skin" on any product whose
 * tags agree with an answer, so swapping to another good fit is as easy as keeping the first.
 */
import { memo } from 'react';

import { text } from '../content';
import type { ViewProduct, ViewSection } from '../model';
import { matchProduct, tagAsWords } from '../quiz';
import { useBuilder, useSelection } from './context';
import { imageAttrs } from './images';
import { splitTitle } from './names';
import { OptionPickers, PickControl } from './PickControls';
import { usePick } from './usePick';

/*
 * Memoised on the product and its step, both kept by the model between picks. A card is drawn
 * again by its own state or by a change to either context, never by the Routine alone.
 */
export const ProductCard = memo(function ProductCard({ product, section }: { product: ViewProduct; section: ViewSection }) {
    const { money, content, openDetails, answers, recommended } = useBuilder();
    const { selections } = useSelection();
    const pick = usePick(product, section);
    const photo = product.photos[0];
    const price = content.hidePrices ? null : money.format(money.unitPrice(pick.variant));
    const inStep = (selections[section.id] ?? [])
        .filter((entry) => product.variants.some((variant) => variant.id === entry.variantId))
        .reduce((total, entry) => total + entry.quantity, 0);
    const { name, kind } = splitTitle(product.title);
    const match = product.soldOut ? null : matchProduct(product, answers);
    const isRecommended = !product.soldOut && recommended.some((entry) => entry.sectionId === section.id && entry.productId === product.id);

    return (
        <article
            className={`skr-card${product.soldOut ? ' skr-card--sold-out' : ''}${inStep > 0 ? ' skr-card--chosen' : ''}`}
            data-cc-product={product.handle}
            data-cc-unavailable={product.soldOut ? 'true' : undefined}
            data-cc-quantity={inStep}
        >
            <button type="button" className="skr-card__media" onClick={() => openDetails(product.id, section.id)} aria-label={`${text(content, 'details')}: ${product.title}${product.soldOut ? `, ${text(content, 'soldOut')}` : ''}`}>
                {photo ? (
                    <img {...imageAttrs(photo.url, 320)} alt={photo.alt} loading="lazy" decoding="async" width={320} height={320} />
                ) : (
                    <span className="skr-card__placeholder" aria-hidden="true">
                        {product.title.slice(0, 1)}
                    </span>
                )}
                {product.soldOut ? (
                    <span className="skr-badge skr-badge--muted">{text(content, 'soldOut')}</span>
                ) : isRecommended ? (
                    <span className="skr-badge">{text(content, 'recommended')}</span>
                ) : null}
            </button>
            <div className="skr-card__body">
                <h4 className="skr-card__title">
                    <span className="skr-card__name">{name}</span>
                    {kind ? <span className="skr-card__kind">{kind}</span> : null}
                </h4>
                {match && match.score > 0 ? (
                    <p className="skr-reason" data-testid="cc-reason">
                        {text(content, 'routineReason', { reasons: match.tags.map(tagAsWords).join(', ') })}
                    </p>
                ) : null}
                <div className="skr-card__meta">
                    {price ? (
                        <p className="skr-card__price" data-price-value={money.unitPrice(pick.variant).toFixed(2)}>
                            {price}
                        </p>
                    ) : null}
                    <OptionPickers pick={pick} product={product} />
                </div>
                <div className="skr-card__actions">
                    <PickControl pick={pick} product={product} section={section} />
                </div>
                <p className="skr-card__message" role="status">
                    {pick.message ?? ''}
                </p>
            </div>
        </article>
    );
});
