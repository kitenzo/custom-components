/*
 * Ask Shopify's CDN for an image at the size it is drawn, not the 4000px original.
 *
 * Only Shopify-hosted URLs take a `width` parameter. Anything else (a data URI, another CDN) is
 * returned untouched, because appending a query string to it can break it.
 */
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

/** `src` and `srcSet` for an image drawn `width` CSS pixels wide, at 1x and 2x. */
export function imageAttrs(src: string, width: number): { src: string; srcSet?: string } {
    const one = sized(src, width);
    const two = sized(src, width * 2);
    return one === src ? { src } : { src: one, srcSet: `${one} 1x, ${two} 2x` };
}
