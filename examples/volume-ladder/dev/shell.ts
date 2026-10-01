/*
 * The markup the Liquid section renders AROUND the mount element, for the dev page and the e2e
 * harness: the product's photos beside the ladder, or a page-width frame for the grid.
 *
 * It mirrors theme/kitenzo-volume-ladder.liquid class for class, so the dev page and the suite
 * test the widget in the column it ships in, not in a page-wide box it will never get. Change
 * one, change the other.
 *
 * The mount elements go into the element marked `data-mount-here` (the info column, or the
 * frame). Shopify wraps the whole section in `.shopify-section`; dev/page.ts wraps each mount
 * instead, so the theme editor's reload can be simulated without wiping the photos.
 */
import type { Fixture } from './mock/wire';

export type DevLayout = 'ladder' | 'grid';

const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function sized(url: string, width: number): string {
    return url.includes('cdn.shopify.com') ? `${url}${url.includes('?') ? '&' : '?'}width=${width}` : url;
}

/**
 * The bundle product's photos as `product.media` would list them. A merchant selling a mix
 * photographs what is in it, so the stand-in is each flavour's own photo from the demo store.
 */
export function galleryPhotos(fixture: Fixture): { url: string; alt: string }[] {
    return fixture.products.map((product) => ({ url: product.imageUrl, alt: product.title })).filter((photo) => photo.url).slice(0, 6);
}

export function sectionShell(layout: DevLayout, photos: { url: string; alt: string }[]): string {
    if (layout === 'grid' || photos.length === 0) {
        const narrow = layout === 'ladder' ? ' vol-section--narrow' : '';
        return `<div class="vol-section vol-section--${layout}${narrow}" data-mount-here></div>`;
    }
    const items = photos
        .map(
            (photo, index) =>
                `<li class="vol-pdp__photo"><img src="${escapeAttr(sized(photo.url, 1000))}" alt="${escapeAttr(photo.alt)}" width="1000" height="1000" loading="${index === 0 ? 'eager' : 'lazy'}"></li>`,
        )
        .join('');
    return `<div class="vol-section vol-section--ladder"><div class="vol-pdp"><ul class="vol-pdp__media" role="list">${items}</ul><div class="vol-pdp__info" data-mount-here></div></div></div>`;
}
