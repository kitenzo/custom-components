/*
 * A product's picture: its photograph when it has one, a drawn tile when it does not (art.ts says
 * why and how the drawing is chosen).
 *
 * The drawings are inline SVG, line work only, with `vector-effect: non-scaling-stroke` so a 40px
 * thumbnail and a 560px dialog hero have the same hairline. Fills come from CSS custom properties
 * (`--gft-paper`, `--gft-tint`), so a theme's accent never repaints a product and the colour the
 * shopper picked always does.
 */
import type { CSSProperties, ReactNode } from 'react';

import type { BundleVariant } from '@kitenzo/react';

import type { ViewProduct } from '../model';
import { artKind, cardFront, initialOf, paperFor, tintFor, type ArtKind } from './art';
import { imageAttrs } from './images';

const svg = {
    viewBox: '0 0 120 120',
    fill: 'none',
    'aria-hidden': true,
    focusable: false,
} as const;

/** `b` = the product's body (tinted), `l` = a light part, `s` = stroke only. */
function Drawing({ kind, inscription }: { kind: Exclude<ArtKind, 'card' | 'initial'>; inscription?: string }): ReactNode {
    switch (kind) {
        case 'box':
            return (
                <svg {...svg} className="gft-art__svg">
                    <path className="gft-art__b" d="M28 54h64v42H28z" />
                    <path className="gft-art__b gft-art__b--lid" d="M23 42h74v13H23z" />
                    <path className="gft-art__s" d="M56 42v54M64 42v54" />
                    <path className="gft-art__l" d="M60 42c-5-9-19-14-21-7-2 6 12 7 21 7zM60 42c5-9 19-14 21-7 2 6-12 7-21 7z" />
                </svg>
            );
        case 'candle':
            return (
                <svg {...svg} className="gft-art__svg">
                    <path className="gft-art__glow" d="M60 25c5 6 7.5 10 5.5 14.5a5.6 5.6 0 0 1-11 0C52.5 35 55 31 60 25z" />
                    <path className="gft-art__s" d="M60 45v-6" />
                    <rect className="gft-art__b" x="37" y="45" width="46" height="52" rx="8" />
                    <path className="gft-art__s" d="M37 55h46" />
                    <rect className="gft-art__l" x="45" y="64" width="30" height="20" rx="1.5" />
                    <path className="gft-art__s" d="M51 71h18M54 77h12" />
                </svg>
            );
        case 'tea':
            return (
                <svg {...svg} className="gft-art__svg">
                    <rect className="gft-art__b" x="38" y="38" width="44" height="60" rx="4" />
                    <rect className="gft-art__b gft-art__b--lid" x="35" y="30" width="50" height="12" rx="3" />
                    <path className="gft-art__s" d="M38 56h44M38 86h44" />
                    <path className="gft-art__l" d="M51 79c0-8.5 7.5-14.5 17-14.5 0 8.5-6.5 14.5-17 14.5z" />
                    <path className="gft-art__s" d="M51 79l12-10" />
                </svg>
            );
        case 'chocolate':
            return (
                <svg {...svg} className="gft-art__svg">
                    <rect className="gft-art__l" x="33" y="24" width="54" height="64" rx="3" />
                    <path className="gft-art__s" d="M51 24v34M69 24v34M33 41h54" />
                    <path className="gft-art__b" d="M31 58l5-3 5 3 5-3 5 3 5-3 5 3 5-3 5 3 5-3 5 3 5-3 5 3V97H31z" />
                    <rect className="gft-art__l" x="45" y="70" width="30" height="15" rx="1" />
                </svg>
            );
        case 'socks':
            return (
                <svg {...svg} className="gft-art__svg">
                    <path className="gft-art__b" d="M47 22h25v44c0 6 4 9 10 12l8 4c7 4 8 12 3 16-4 3-10 3-15 0l-22-12c-6-3-9-9-9-15z" />
                    <path className="gft-art__s" d="M47 33h25M53 22v11M59.5 22v11M66 22v11" />
                    <path className="gft-art__s" d="M83 79c-4 5-3 12 2 16" />
                </svg>
            );
        case 'bath':
            return (
                <svg {...svg} className="gft-art__svg">
                    <rect className="gft-art__l gft-art__cork" x="45" y="29" width="30" height="15" rx="2" />
                    <rect className="gft-art__b" x="36" y="42" width="48" height="56" rx="11" />
                    <path className="gft-art__s" d="M40 53h40" />
                    <path className="gft-art__s" d="M60 62v22M60 69c-5 0-8-3-8-7.5 5 0 8 3 8 7.5zM60 77c5 0 8-3 8-7.5-5 0-8 3-8 7.5z" />
                    <path className="gft-art__s gft-art__dots" d="M46 90h.01M52 87h.01M68 88h.01M74 91h.01M57 92h.01" />
                </svg>
            );
        case 'matchbox':
            return (
                <svg {...svg} className="gft-art__svg">
                    <rect className="gft-art__l" x="46" y="38" width="56" height="30" rx="2" />
                    <path className="gft-art__s" d="M58 44h40M58 52h40M58 60h40" />
                    <path className="gft-art__heads" d="M56 44h.01M56 52h.01M56 60h.01" />
                    <rect className="gft-art__b" x="18" y="50" width="66" height="40" rx="3" />
                    <rect className="gft-art__plate" x="28" y="61" width="46" height="18" rx="1.5" />
                    {inscription ? (
                        <text className="gft-art__inscription" x="51" y="72.5" textAnchor="middle">
                            {inscription}
                        </text>
                    ) : null}
                </svg>
            );
    }
}

export interface ProductArtProps {
    product: ViewProduct;
    /** The variant on show, for its colour. Defaults to the first. */
    variant?: BundleVariant;
    /** Text to set on the drawing where the product carries some (an engraving on a lid). */
    inscription?: string;
    /** The width it is drawn at, for the photograph's `srcset`. */
    width: number;
    className?: string;
    /** Beside the product's name already (a summary line): hidden from screen readers. */
    decorative?: boolean;
}

export function ProductArt({ product, variant, inscription, width, className = '', decorative = false }: ProductArtProps) {
    const photo = product.photos[0];
    if (photo) {
        return (
            <span className={`gft-art gft-art--photo ${className}`}>
                <img {...imageAttrs(photo.url, width)} alt={decorative ? '' : photo.alt} loading="lazy" decoding="async" width={width} height={width} />
            </span>
        );
    }
    const kind = artKind(product);
    const tint = tintFor(product.product, variant ?? product.variants[0]);
    const style = { '--gft-paper': paperFor(product.handle), ...(tint ? { '--gft-tint': tint } : {}) } as CSSProperties;
    return (
        <span className={`gft-art gft-art--${kind}${tint ? ' gft-art--tinted' : ''} ${className}`} style={style} {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': product.title })}>
            {kind === 'card' ? (
                <span className="gft-art__card" aria-hidden="true">
                    <span className="gft-art__card-front">{cardFront(product.title)}</span>
                </span>
            ) : kind === 'initial' ? (
                <span className="gft-art__initial" aria-hidden="true">
                    {initialOf(product.title)}
                </span>
            ) : (
                <Drawing kind={kind} inscription={inscription} />
            )}
        </span>
    );
}
