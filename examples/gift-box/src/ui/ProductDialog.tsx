/*
 * A product's details: its photographs, its description and the same controls as its card.
 *
 * A native <dialog> opened with showModal(). It renders in the browser's top layer, so a theme
 * ancestor with `transform` or `container-type` (which traps `position: fixed`) cannot pull it off
 * screen, and the browser gives it focus trapping, Escape and a backdrop for free.
 *
 * The product is looked up from the live model by id on every render, never captured when the
 * dialog opened, so a stock change or a market switch shows up while it is open.
 */
import { useEffect, useRef, useState } from 'react';

import { text } from '../content';
import { useBuilder } from './context';
import { CloseIcon } from './Icons';
import { imageAttrs } from './images';
import { OptionPickers, QuantityControl } from './PickControls';
import { FieldsTag } from './ProductCard';
import { ProductArt } from './ProductArt';
import { usePick } from './usePick';
import type { ViewProduct, ViewSection } from '../model';

export interface OpenProduct {
    productId: string;
    sectionId: number;
}

export function ProductDialog({ open, onClose }: { open: OpenProduct | null; onClose: () => void }) {
    const ref = useRef<HTMLDialogElement>(null);
    const { model, idPrefix } = useBuilder();
    const section = open ? model.sections.find((candidate) => candidate.id === open.sectionId) : undefined;
    const product = section?.products.find((candidate) => candidate.id === open?.productId);

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (product && !dialog.open) dialog.showModal();
        if (!product && dialog.open) dialog.close();
    }, [product]);

    return (
        <dialog
            ref={ref}
            className="gft-dialog"
            data-testid="cc-dialog"
            aria-labelledby={`${idPrefix}-dialog-title`}
            onClose={onClose}
            onClick={(event) => {
                // A click on the backdrop lands on the dialog element itself.
                if (event.target === ref.current) ref.current?.close();
            }}
        >
            {product && section ? <DialogBody key={product.id} product={product} section={section} onClose={() => ref.current?.close()} /> : null}
        </dialog>
    );
}

function DialogBody({ product, section, onClose }: { product: ViewProduct; section: ViewSection; onClose: () => void }) {
    const { content, money, idPrefix } = useBuilder();
    const pick = usePick(product, section);
    const [index, setIndex] = useState(0);
    const photo = product.photos[index] ?? product.photos[0];
    const price = content.hidePrices ? null : money.format(money.unitPrice(pick.variant));

    return (
        <div className="gft-dialog__inner">
            <button type="button" className="gft-dialog__close" onClick={onClose} aria-label={text(content, 'close')}>
                <CloseIcon />
            </button>
            <div className="gft-dialog__gallery">
                {photo ? (
                    <img {...imageAttrs(photo.url, 560)} alt={photo.alt || product.title} width={560} height={560} />
                ) : (
                    <ProductArt product={product} variant={pick.variant} width={560} className="gft-dialog__art" />
                )}
                {product.photos.length > 1 ? (
                    <div className="gft-dialog__thumbs">
                        {product.photos.map((entry, position) => (
                            <button
                                key={entry.url}
                                type="button"
                                className="gft-dialog__thumb"
                                aria-label={entry.alt || `${product.title}, ${position + 1} of ${product.photos.length}`}
                                aria-current={position === index || undefined}
                                onClick={() => setIndex(position)}
                            >
                                <img {...imageAttrs(entry.url, 64)} alt="" width={64} height={64} />
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
            <div className="gft-dialog__details">
                <h3 id={`${idPrefix}-dialog-title`} className="gft-dialog__title">
                    {product.title}
                </h3>
                {price ? <p className="gft-card__price">{price}</p> : null}
                {product.description ? <p className="gft-dialog__description">{product.description}</p> : null}
                <FieldsTag product={product} />
                <OptionPickers pick={pick} product={product} chips />
                <div className="gft-card__actions">
                    <QuantityControl pick={pick} product={product} />
                </div>
                <p className="gft-card__message" role="status">
                    {pick.message ?? ''}
                </p>
            </div>
        </div>
    );
}
