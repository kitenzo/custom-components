/*
 * A piece's details: its photographs, its description and the same controls as its card.
 *
 * A native <dialog> opened with showModal(). It renders in the browser's top layer, so a theme
 * ancestor with `transform` or `container-type` (which traps `position: fixed`) cannot pull it off
 * screen, and the browser gives it focus trapping, Escape and a backdrop for free.
 *
 * The product is looked up from the live model by id on every render, never captured when the
 * dialog opened, so a stock change or a market switch shows up while it is open. Its choice is
 * the card's (usePieces), so a colour picked here is the colour on the card underneath.
 */
import { useEffect, useRef, useState } from 'react';

import { text } from '../content';
import type { ViewProduct, ViewSection } from '../model';
import { useBuilder } from './context';
import { CloseIcon } from './Icons';
import { imageAttrs } from './images';
import { AddControl, OptionPickers } from './PickControls';
import { usePiece } from './usePiece';

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
            className="aws-dialog"
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

const bare = (url: string) => url.split('?')[0];

function DialogBody({ product, section, onClose }: { product: ViewProduct; section: ViewSection; onClose: () => void }) {
    const { content, money, idPrefix } = useBuilder();
    const piece = usePiece(product, section);
    // The gallery opens on the chosen colour's photograph and follows the colour as it changes;
    // a thumbnail press overrides that until the next colour change.
    const [picked, setPicked] = useState<string | null>(null);
    useEffect(() => setPicked(null), [piece.image]);
    const shown = picked ?? piece.image ?? product.photos[0]?.url;
    const price = content.hidePrices ? null : money.format(money.unitPrice(piece.variant));

    return (
        <div className="aws-dialog__inner">
            <button type="button" className="aws-dialog__close" onClick={onClose} aria-label={text(content, 'close')}>
                <CloseIcon />
            </button>
            <div className="aws-dialog__gallery">
                {shown ? <img {...imageAttrs(shown, 640)} alt={product.photos.find((entry) => bare(entry.url) === bare(shown))?.alt || product.title} width={640} height={800} /> : null}
                {product.photos.length > 1 ? (
                    <div className="aws-dialog__thumbs">
                        {product.photos.map((entry, position) => (
                            <button
                                key={entry.url}
                                type="button"
                                className="aws-dialog__thumb"
                                aria-label={entry.alt || `${product.title}, ${position + 1} of ${product.photos.length}`}
                                aria-current={(shown ? bare(entry.url) === bare(shown) : false) || undefined}
                                onClick={() => setPicked(entry.url)}
                            >
                                <img {...imageAttrs(entry.url, 64)} alt="" width={64} height={80} />
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
            <div className="aws-dialog__details">
                <p className="aws-dialog__step">{section.name}</p>
                <h3 id={`${idPrefix}-dialog-title`} className="aws-dialog__title">
                    {product.title}
                </h3>
                {price ? <p className="aws-piece__price">{price}</p> : null}
                {product.description ? <p className="aws-dialog__description">{product.description}</p> : null}
                <OptionPickers piece={piece} product={product} />
                {piece.surcharge && !content.hidePrices ? (
                    <p className="aws-piece__surcharge">{text(content, 'surchargeNote', { value: piece.surcharge.cause, amount: money.format(piece.surcharge.amount) })}</p>
                ) : null}
                <AddControl piece={piece} product={product} />
                <p className="aws-piece__message" role="status">
                    {piece.message ?? ''}
                </p>
            </div>
        </div>
    );
}
