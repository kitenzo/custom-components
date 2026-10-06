/*
 * The bundle, as this widget renders it.
 *
 * What is offered is the SDK's decision (`getBundleOffer`): which steps and products appear, which
 * are sold out, what the conditions engine hides as the shopper picks, what every bundle includes,
 * and what a merchant has to fix before anything can be sold, all from the bundle's limit rules
 * and the shop's own settings. `toViewModel` adds only what a design needs on top: photographs,
 * plain-text descriptions, each product's personalisation fields, and the one thing the SDK leaves
 * to the widget, whether it can collect them.
 *
 * The widget invents nothing. A step with no rule is optional; nothing is preselected; no count
 * is hardcoded.
 */
import { getBundleOffer, htmlToPlainText, type BundleDetail, type BundleOfferOptions, type BundleProduct, type BundleVariant, type PickLimits, type ShopSettings } from '@kitenzo/react';

import { definedFields, fieldsFor, isCollectable, type Field } from './personalisation';

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
    product: BundleProduct;
    variants: BundleVariant[];
    /** No variant can be bought. Rendered, marked, and impossible to pick. */
    soldOut: boolean;
    /** The personalisation fields this widget collects for it, from the bundle. Often none. */
    fields: Field[];
}

export interface ViewSection {
    id: number;
    name: string;
    description: string;
    autoNext: boolean;
    limits: PickLimits;
    products: ViewProduct[];
    /** Every variant the step offers, with its product: what a pick in the selection refers to. */
    byVariantId: Map<string, { product: ViewProduct; variant: BundleVariant }>;
}

export interface ViewRequired {
    /** `soldOut` here means its variants cannot supply `quantity`: the set cannot be sold. */
    product: ViewProduct;
    quantity: number;
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
    problems: Problem[];
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

function toViewProduct(bundle: BundleDetail, product: BundleProduct, soldOut: boolean): ViewProduct {
    return {
        id: product.id,
        handle: product.handle || product.id,
        title: product.title,
        description: htmlToPlainText(product.descriptionHtml ?? '', { preserveLineBreaks: true }),
        photos: photosOf(product),
        product,
        variants: product.variants,
        soldOut,
        fields: fieldsFor(bundle, product.id),
    };
}

/**
 * `conditions` is the builder's, so a step or product the conditions engine hides leaves the
 * model. The builder keeps that object until something in it changes, so a memo on it holds.
 * `problems` are the merchant's to fix and do not depend on what the shopper picks.
 */
export function toViewModel(bundle: BundleDetail, settings: ShopSettings, conditions?: BundleOfferOptions['conditions']): ViewModel {
    const offer = getBundleOffer(bundle, { settings, conditions });

    const sections = offer.sections
        // A step with nothing to show is not drawn.
        .filter((offered) => offered.products.length > 0)
        .map<ViewSection>(({ section, limits, products: offered }) => {
            const products = offered.map((entry) => toViewProduct(bundle, entry.product, entry.soldOut));
            return {
                id: section.id,
                name: section.name,
                description: section.description,
                autoNext: section.autoNextSection === true,
                limits,
                products,
                byVariantId: new Map(products.flatMap((product) => product.variants.map((variant) => [variant.id, { product, variant }]))),
            };
        });

    // A required product the API did not return has nothing to draw; the offer reports it as a
    // blocking issue. One that is sold out stays visible even when the shop hides sold-out
    // products: hiding it while still sending it to the cart sells a set the merchant cannot pack.
    const required = offer.requiredProducts.flatMap<ViewRequired>((entry) =>
        entry.product ? [{ product: toViewProduct(bundle, entry.product, entry.soldOut), quantity: entry.quantity }] : [],
    );

    const problems: Problem[] = offer.issues.map((issue) => ({ blocking: issue.blocking, detail: issue.message }));

    // An image field is the one kind this widget cannot collect. The SDK refuses to add a bundle
    // while a required field has no answer, so a required one holds the bundle off sale with an
    // explanation, rather than offering a button that can never work; an optional one is left
    // out, and the merchant is told so. Asked of everything the bundle can offer, hidden by a
    // condition or not, so the answer does not change as the shopper picks.
    const everything = conditions ? getBundleOffer(bundle, { settings }) : offer;
    const titles = new Map(
        [...everything.sections.flatMap((offered) => offered.products), ...everything.requiredProducts].flatMap((entry) => (entry.product ? [[entry.product.id, entry.product.title] as const] : [])),
    );
    for (const [productId, title] of titles) {
        for (const field of definedFields(bundle, productId)) {
            if (isCollectable(field)) continue;
            problems.push(
                field.required
                    ? {
                          blocking: true,
                          detail: `The personalisation field "${field.label}" on "${title}" is required and asks for an image upload, which this section cannot host, so the bundle is held off sale. Make the field optional or remove it in Kitenzo.`,
                      }
                    : {
                          blocking: false,
                          detail: `The personalisation field "${field.label}" on "${title}" asks for an image upload, which this section cannot host, so shoppers are not shown it here.`,
                      },
            );
        }
    }

    return { bundle, sections, required, problems };
}
