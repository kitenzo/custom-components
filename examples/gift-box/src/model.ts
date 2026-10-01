/*
 * The bundle, as this widget renders it.
 *
 * `toViewModel` is the one place that decides what is offered: which products appear, which are
 * pickable, what each step needs, and what a merchant has to fix. Components below it render the
 * result and never re-derive any of it.
 *
 * The widget invents nothing. Every count comes from the bundle's limit rules (through the SDK's
 * `getSectionLimits` / `getBundleLimits`, which translate all five operators), every product from
 * its sections, every rule about stock and drafts from the shop's own settings. A step with no
 * rule is optional; nothing is preselected; no count is hardcoded.
 */
import {
    getBundleLimits,
    getSectionLimits,
    htmlToPlainText,
    type BundleDetail,
    type BundleProduct,
    type BundleSection,
    type BundleVariant,
    type PickLimits,
    type ShopSettings,
} from '@kitenzo/react';

import { definedFields, fieldsFor, unsupportedReason, type Field } from './personalisation';

export interface Photo {
    url: string;
    alt: string;
}

export interface ViewProduct {
    id: string;
    handle: string;
    title: string;
    /** Plain text, never markup: descriptions are merchant HTML and render as text here. */
    description: string;
    photos: Photo[];
    tags: string[];
    product: BundleProduct;
    /** Variants that can be picked. */
    variants: BundleVariant[];
    /** Every variant sold out. Rendered, marked, and impossible to pick. */
    soldOut: boolean;
    /** The personalisation fields this widget collects for it, from the bundle. Often none. */
    fields: Field[];
}

export interface ViewSection {
    id: number;
    name: string;
    description: string;
    imageUrl: string;
    autoNext: boolean;
    limits: PickLimits;
    products: ViewProduct[];
}

export interface ViewRequired {
    product: ViewProduct;
    quantity: number;
    /** Every variant sold out: the set cannot be sold, and the widget says why. */
    soldOut: boolean;
}

/** Something the merchant has to fix. `blocking` problems keep the bundle off sale. */
export interface Problem {
    blocking: boolean;
    /** For the merchant, in the theme editor: what is wrong and how to fix it. */
    detail: string;
}

export interface ViewModel {
    bundle: BundleDetail;
    sections: ViewSection[];
    required: ViewRequired[];
    bundleLimits: PickLimits;
    /**
     * How many items the required products add to the bundle-wide count. The engine counts them
     * against a bundle-wide rule ("exactly 6 in the box"), so a widget that counted only the
     * shopper's picks would ask for one too many.
     */
    requiredCount: number;
    problems: Problem[];
}

export interface ModelOptions {
    /** `null` while settings load. */
    settings: ShopSettings | null;
}

/**
 * Every photograph, with the one a grid shows first.
 *
 * `image` (the featured one) and `images` (the gallery) are stored apart, and a re-upload can
 * restamp one URL's `?v=` and not the other's, so they are compared without the query string.
 * An API too old to serve galleries still gets its single photograph.
 */
export function photosOf(product: BundleProduct): Photo[] {
    const gallery = (product.images ?? []).filter((image) => image.url).map((image) => ({ url: image.url, alt: image.alt }));
    if (!product.image) return gallery;
    const bare = (url: string) => url.split('?')[0];
    const featured = gallery.find((photo) => bare(photo.url) === bare(product.image!));
    return [featured ?? { url: product.image, alt: '' }, ...gallery.filter((photo) => bare(photo.url) !== bare(product.image!))];
}

function toViewProduct(product: BundleProduct, bundle: BundleDetail): ViewProduct {
    return {
        id: product.id,
        handle: product.handle || product.id,
        title: product.title,
        description: htmlToPlainText(product.descriptionHtml ?? '', { preserveLineBreaks: true }),
        photos: photosOf(product),
        tags: product.tags ?? [],
        product,
        variants: product.variants,
        soldOut: !product.variants.some((variant) => variant.available),
        fields: fieldsFor(bundle, product.id),
    };
}

/**
 * Whether the shop allows this product to be offered at all.
 *
 * Archived is never offered: it cannot be bought. A draft follows the shop's own setting. Only an
 * explicit status counts, because an older API sends none, and reading "no status" as "not
 * active" would take every product off sale.
 */
function isOffered(product: BundleProduct, settings: ShopSettings | null): boolean {
    if (product.variants.length === 0) return false;
    if (product.status === 'ARCHIVED') return false;
    if (product.status === 'DRAFT' && settings?.hideDraftProducts) return false;
    return true;
}

function sectionProducts(bundle: BundleDetail, section: BundleSection, needsPicks: boolean, settings: ShopSettings | null): ViewProduct[] {
    const offered = section.products.filter((product) => isOffered(product, settings)).map((product) => toViewProduct(product, bundle));
    if (!settings?.hideOutOfStockProducts) return offered;
    const inStock = offered.filter((product) => !product.soldOut);
    // Hiding sold-out products is a preference, not a hard block. If honouring it would leave the
    // step empty when picks are needed from it, keep them visible and unpickable: a greyed-out
    // product explains itself, an empty step does not.
    return needsPicks && inStock.length === 0 ? offered : inStock;
}

function describeLimits(limits: PickLimits): string {
    return limits.max === Number.POSITIVE_INFINITY ? `at least ${limits.min}` : `${limits.min} to ${limits.max}`;
}

export function toViewModel(bundle: BundleDetail, options: ModelOptions): ViewModel {
    const { settings } = options;
    const problems: Problem[] = [];

    const bundleLimits = getBundleLimits(bundle);
    // A bundle-wide minimum ("any 6 across the steps") needs picks from somewhere. When no step has
    // anything in stock, every step counts as needing them, so none of them renders empty.
    const anyInStock = bundle.sections.some((section) =>
        section.products.some((product) => isOffered(product, settings) && product.variants.some((variant) => variant.available)),
    );

    const sections = [...bundle.sections]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map<ViewSection>((section) => {
            const limits = getSectionLimits(bundle, section.id);
            const needsPicks = limits.min > 0 || (bundleLimits.min > 0 && !anyInStock);
            return {
                id: section.id,
                name: section.name,
                description: section.description,
                imageUrl: section.imageUrl ?? '',
                autoNext: section.autoNextSection === true,
                limits,
                products: sectionProducts(bundle, section, needsPicks, settings),
            };
        });

    const required = (bundle.requiredProducts ?? []).flatMap<ViewRequired>((entry) => {
        if (!entry.product) {
            problems.push({
                blocking: true,
                detail: `A required product (Shopify id ${entry.shopifyProductId}) did not come back from the API. Check it is still active and in the bundle.`,
            });
            return [];
        }
        const product = toViewProduct(entry.product, bundle);
        // Required products stay visible even when sold out and the shop hides sold-out products:
        // hiding one while still sending it to the cart sells a set the merchant cannot pack.
        return [{ product, quantity: entry.quantity || 1, soldOut: product.soldOut }];
    });

    for (const section of sections) {
        if (section.limits.min > section.limits.max) {
            problems.push({
                blocking: true,
                detail: `The step "${section.name}" has limit rules that contradict each other (at least ${section.limits.min}, at most ${section.limits.max}), so no selection can be added to the cart. Fix the step's limits in Kitenzo.`,
            });
        }
        if (section.limits.min > 0 && !section.products.some((product) => !product.soldOut)) {
            problems.push({
                blocking: true,
                detail: `The step "${section.name}" needs ${describeLimits(section.limits)} picks but has no product that can be bought right now. Add products to the step or restock them.`,
            });
        }
    }
    if (bundleLimits.min > 0 && !anyInStock) {
        problems.push({
            blocking: true,
            detail: `The bundle needs at least ${bundleLimits.min} picks but none of its products can be bought right now. Restock them or add products.`,
        });
    }
    if (bundleLimits.min > bundleLimits.max) {
        problems.push({
            blocking: true,
            detail: `The bundle's own limit rules contradict each other (at least ${bundleLimits.min}, at most ${bundleLimits.max}), so no selection can be added to the cart. Fix the bundle's limits in Kitenzo.`,
        });
    }
    if (sections.every((section) => section.products.length === 0) && required.length === 0) {
        problems.push({ blocking: true, detail: 'This bundle has no products. Add products to its steps in Kitenzo.' });
    }
    for (const entry of required) {
        if (entry.soldOut) {
            problems.push({
                blocking: true,
                detail: `"${entry.product.title}" is included in every bundle and is sold out, so the bundle is held off sale. Restock it or remove it from the bundle's required products.`,
            });
        }
    }

    // Personalisation this widget cannot collect. A required one would reach the order empty (sold
    // as engraved, packed without the engraving), so it holds the bundle off sale; an optional one
    // is left out, and the merchant is told so.
    const titles = new Map(
        [...sections.flatMap((section) => section.products), ...required.map((entry) => entry.product)].map((product) => [product.id, product.title]),
    );
    for (const [productId, title] of titles) {
        for (const field of definedFields(bundle, productId)) {
            const reason = unsupportedReason(field);
            if (!reason) continue;
            const why = reason === 'image' ? 'asks for an image upload, which this section cannot host' : 'carries a fee, which this section cannot add to the cart';
            problems.push(
                field.required
                    ? {
                          blocking: true,
                          detail: `The personalisation field "${field.label}" on "${title}" is required and ${why}, so the bundle is held off sale. Make the field optional or remove it in Kitenzo.`,
                      }
                    : {
                          blocking: false,
                          detail: `The personalisation field "${field.label}" on "${title}" ${why}, so shoppers are not shown it here.`,
                      },
            );
        }
    }
    if (bundle.conditionsPartial) {
        problems.push({
            blocking: false,
            detail: 'Some of this bundle\'s conditions (variant cascades) cannot run outside Kitenzo\'s own builder, so they are skipped here. Check the bundle behaves as you expect.',
        });
    }

    // A required product that is also offered in a step is covered by the shopper's own picks of it;
    // only the rest are added on top, as the SDK adds them.
    const inSteps = new Set(bundle.sections.flatMap((section) => section.products.map((product) => product.id)));
    const requiredCount = required.filter((entry) => !inSteps.has(entry.product.id)).reduce((total, entry) => total + entry.quantity, 0);

    return { bundle, sections, required, bundleLimits, requiredCount, problems };
}

/** A section's products minus any the conditions engine hides right now. */
export function visibleProducts(section: ViewSection, hidden: { productId: string; sectionId: number | null }[]): ViewProduct[] {
    if (hidden.length === 0) return section.products;
    return section.products.filter(
        (product) => !hidden.some((entry) => entry.productId === product.id && (entry.sectionId === null || entry.sectionId === section.id)),
    );
}
