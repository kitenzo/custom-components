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
import { matchProduct, tagAsWords } from '../quiz';
import { splitTitle } from './names';
import { OptionPickers, PickControl } from './PickControls';
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
            className="skr-dialog"
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
    const { content, money, answers, idPrefix } = useBuilder();
    const pick = usePick(product, section);
    const match = product.soldOut ? null : matchProduct(product, answers);
    const { name, kind } = splitTitle(product.title);
    const [index, setIndex] = useState(0);
    const photo = product.photos[index] ?? product.photos[0];
    const price = content.hidePrices ? null : money.format(money.unitPrice(pick.variant));

    return (
        <div className="skr-dialog__inner">
            <button type="button" className="skr-dialog__close" onClick={onClose} aria-label={text(content, 'close')}>
                <CloseIcon />
            </button>
            <div className="skr-dialog__gallery">
                {photo ? <img {...imageAttrs(photo.url, 560)} alt={photo.alt || product.title} width={560} height={560} /> : null}
                {product.photos.length > 1 ? (
                    <div className="skr-dialog__thumbs">
                        {product.photos.map((entry, position) => (
                            <button
                                key={entry.url}
                                type="button"
                                className="skr-dialog__thumb"
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
            <div className="skr-dialog__details">
                <p className="skr-eyebrow">{section.name}</p>
                <h3 id={`${idPrefix}-dialog-title`} className="skr-dialog__title">
                    <span className="skr-dialog__name">{name}</span>
                    {kind ? <span className="skr-dialog__kind">{kind}</span> : null}
                </h3>
                {match && match.score > 0 ? (
                    <p className="skr-reason">{text(content, 'routineReason', { reasons: match.tags.map(tagAsWords).join(', ') })}</p>
                ) : null}
                {price ? <p className="skr-card__price">{price}</p> : null}
                {product.description ? <p className="skr-dialog__description">{product.description}</p> : null}
                <OptionPickers pick={pick} product={product} />
                <div className="skr-card__actions">
                    <PickControl pick={pick} product={product} section={section} />
                </div>
                <p className="skr-card__message" role="status">
                    {pick.message ?? ''}
                </p>
            </div>
        </div>
    );
}
