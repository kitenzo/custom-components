/*
 * Ask Shopify's CDN for an image at the size it is drawn, not the 4000px original.
 *
 * Only Shopify-hosted URLs take a `width` parameter. Anything else (a data URI, another CDN) is
 * returned untouched, because appending a query string to it can break it.
 */
import { h } from '../dom';

function isShopifyCdn(url: URL): boolean {
    return url.hostname === 'cdn.shopify.com' || url.pathname.startsWith('/cdn/shop/');
}

export function sized(src: string, width: number): string {
    try {
        const url = new URL(src, 'https://placeholder.invalid');
        if (!isShopifyCdn(url)) return src;
        url.searchParams.set('width', String(Math.round(width)));
        return url.toString();
    } catch {
        return src;
    }
}

/** An image drawn `width` CSS pixels wide (and square), at 1x and 2x. */
export function image(src: string, width: number, alt: string, lazy = false): HTMLImageElement {
    const one = sized(src, width);
    return h('img', {
        src: one,
        srcset: one === src ? null : `${one} 1x, ${sized(src, width * 2)} 2x`,
        alt,
        width,
        height: width,
        loading: lazy ? 'lazy' : null,
        decoding: 'async',
    });
}
