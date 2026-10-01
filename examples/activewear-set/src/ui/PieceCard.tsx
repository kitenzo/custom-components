/*
 * One piece of the set: a large photograph that follows the chosen colour, the colour swatches,
 * the size row, and the add.
 *
 * Carries the test contract on its root (guides/the-contract.md): `data-cc-product` (the
 * Shopify handle), `data-cc-unavailable` when every variant is sold out, `data-cc-quantity` (how
 * many of it are in this step). The suites find and drive pieces through these, never through
 * class names or copy.
 */
import { text } from '../content';
import type { ViewProduct, ViewSection } from '../model';
import { useBuilder } from './context';
import { CheckIcon } from './Icons';
import { imageAttrs } from './images';
import { AddControl, OptionPickers } from './PickControls';
import { usePiece } from './usePiece';

export function PieceCard({ product, section, index }: { product: ViewProduct; section: ViewSection; index: number }) {
    const { money, content, openDetails } = useBuilder();
    const piece = usePiece(product, section);
    const price = content.hidePrices ? null : money.format(money.unitPrice(piece.variant));
    const photo = piece.image;
    const alt = product.photos.find((entry) => entry.url === photo)?.alt || `${product.title}${piece.options.find((state) => state.swatch)?.value ? `, ${piece.options.find((state) => state.swatch)!.value}` : ''}`;

    return (
        <article
            className={`aws-piece${product.soldOut ? ' aws-piece--sold-out' : ''}${piece.inSet ? ' aws-piece--chosen' : ''}`}
            data-cc-product={product.handle}
            data-cc-unavailable={product.soldOut ? 'true' : undefined}
            data-cc-quantity={piece.quantity}
        >
            <button type="button" className="aws-piece__media" onClick={() => openDetails(product.id, section.id)} aria-label={`${text(content, 'details')}: ${product.title}${product.soldOut ? `, ${text(content, 'soldOut')}` : ''}`}>
                {photo ? (
                    // Keyed by URL so a colour change swaps the photograph rather than morphing it.
                    <img key={photo} {...imageAttrs(photo, 480)} alt={alt} loading={index === 0 ? 'eager' : 'lazy'} decoding="async" width={480} height={600} />
                ) : (
                    <span className="aws-piece__placeholder" aria-hidden="true">
                        {product.title.slice(0, 1)}
                    </span>
                )}
                {product.soldOut ? <span className="aws-badge">{text(content, 'soldOut')}</span> : null}
                {piece.inSet ? (
                    <span className="aws-badge aws-badge--chosen">
                        <CheckIcon />
                        {text(content, 'inSet')}
                    </span>
                ) : null}
                <span className="aws-piece__details">{text(content, 'details')}</span>
            </button>
            <div className="aws-piece__body">
                <div className="aws-piece__heading">
                    <h4 className="aws-piece__title">{product.title}</h4>
                    {price ? (
                        <p className="aws-piece__price" data-price-value={money.unitPrice(piece.variant).toFixed(2)}>
                            {price}
                        </p>
                    ) : null}
                </div>
                <OptionPickers piece={piece} product={product} />
                {piece.surcharge && !content.hidePrices ? (
                    <p className="aws-piece__surcharge" data-testid="aws-surcharge-note">
                        {text(content, 'surchargeNote', { value: piece.surcharge.cause, amount: money.format(piece.surcharge.amount) })}
                    </p>
                ) : null}
                <AddControl piece={piece} product={product} />
                <p className="aws-piece__message" role="status">
                    {piece.message ?? ''}
                </p>
            </div>
        </article>
    );
}
