/*
 * One product in a step: as a card in a grid, or, when a step offers a single product (the box),
 * as a featured panel with room for its options as buttons.
 *
 * Both carry the test contract on their root (guides/the-contract.md): `data-cc-product` (the
 * Shopify handle), `data-cc-unavailable` when every variant is sold out, `data-cc-quantity` (how
 * many of it are in this step). The suites find and drive products through these, never through
 * class names or copy.
 */
import { text } from '../content';
import type { ViewProduct, ViewSection } from '../model';
import { useBuilder } from './context';
import { PenIcon } from './Icons';
import { OptionPickers, QuantityControl } from './PickControls';
import { ProductArt } from './ProductArt';
import { usePick } from './usePick';

function useInStep(product: ViewProduct, section: ViewSection): number {
    const { selection } = useBuilder();
    return (selection.selections[section.id] ?? [])
        .filter((entry) => product.variants.some((variant) => variant.id === entry.variantId))
        .reduce((total, entry) => total + entry.quantity, 0);
}

/** "Lid engraving" under a product's name: the shopper knows before choosing it that it is personal. */
export function FieldsTag({ product }: { product: ViewProduct }) {
    if (product.fields.length === 0) return null;
    return (
        <p className="gft-card__personal">
            <PenIcon />
            {product.fields.map((field) => field.label).join(' · ')}
        </p>
    );
}

export function ProductCard({ product, section }: { product: ViewProduct; section: ViewSection }) {
    const { money, content, openDetails } = useBuilder();
    const pick = usePick(product, section);
    const price = content.hidePrices ? null : money.format(money.unitPrice(pick.variant));
    const inStep = useInStep(product, section);

    return (
        <article
            className={`gft-card${product.soldOut ? ' gft-card--sold-out' : ''}${inStep > 0 ? ' gft-card--chosen' : ''}`}
            data-cc-product={product.handle}
            data-cc-unavailable={product.soldOut ? 'true' : undefined}
            data-cc-quantity={inStep}
        >
            <button
                type="button"
                className="gft-card__media"
                onClick={() => openDetails(product.id, section.id)}
                aria-label={`${text(content, 'details')}: ${product.title}${product.soldOut ? `, ${text(content, 'soldOut')}` : ''}`}
            >
                <ProductArt product={product} variant={pick.variant} width={320} />
                {product.soldOut ? <span className="gft-badge gft-badge--muted">{text(content, 'soldOut')}</span> : null}
                {inStep > 0 && !pick.single ? <span className="gft-badge gft-badge--count">{inStep}</span> : null}
            </button>
            <div className="gft-card__body">
                <h4 className="gft-card__title">{product.title}</h4>
                {price ? (
                    <p className="gft-card__price" data-price-value={money.unitPrice(pick.variant).toFixed(2)}>
                        {price}
                    </p>
                ) : null}
                <FieldsTag product={product} />
                <OptionPickers pick={pick} product={product} />
                <div className="gft-card__actions">
                    <QuantityControl pick={pick} product={product} />
                </div>
                <p className="gft-card__message" role="status">
                    {pick.message ?? ''}
                </p>
            </div>
        </article>
    );
}

/** The only product in its step, given the width of the step: drawing, options as buttons, choose. */
export function FeaturedProduct({ product, section }: { product: ViewProduct; section: ViewSection }) {
    const { money, content, openDetails } = useBuilder();
    const pick = usePick(product, section);
    const price = content.hidePrices ? null : money.format(money.unitPrice(pick.variant));
    const inStep = useInStep(product, section);

    return (
        <article
            className={`gft-featured${product.soldOut ? ' gft-card--sold-out' : ''}${inStep > 0 ? ' gft-featured--chosen' : ''}`}
            data-cc-product={product.handle}
            data-cc-unavailable={product.soldOut ? 'true' : undefined}
            data-cc-quantity={inStep}
        >
            <button type="button" className="gft-featured__media gft-card__media" onClick={() => openDetails(product.id, section.id)} aria-label={`${text(content, 'details')}: ${product.title}${product.soldOut ? `, ${text(content, 'soldOut')}` : ''}`}
            >
                <ProductArt product={product} variant={pick.variant} width={560} />
                {product.soldOut ? <span className="gft-badge gft-badge--muted">{text(content, 'soldOut')}</span> : null}
            </button>
            <div className="gft-featured__body">
                <div className="gft-featured__titles">
                    <h4 className="gft-featured__title">{product.title}</h4>
                    {price ? (
                        <p className="gft-featured__price" data-price-value={money.unitPrice(pick.variant).toFixed(2)}>
                            {price}
                        </p>
                    ) : null}
                </div>
                {product.description ? <p className="gft-featured__description">{product.description}</p> : null}
                <FieldsTag product={product} />
                <OptionPickers pick={pick} product={product} chips />
                <div className="gft-featured__actions">
                    <QuantityControl pick={pick} product={product} />
                </div>
                <p className="gft-card__message" role="status">
                    {pick.message ?? ''}
                </p>
            </div>
        </article>
    );
}
