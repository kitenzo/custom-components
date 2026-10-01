/*
 * Known SDK issues, patched in the data and nowhere else. Each one names what it fixes, how to
 * tell it is no longer needed, and is deleted the day the SDK ships the fix. Never patch engine
 * logic (selection, validation, pricing, cart) in a widget; at most, hand the SDK the data it
 * should have had.
 */
import type { BundleDetail } from '@kitenzo/core';

/**
 * Required products: fill in `variantIds` when the API sends none.
 *
 * The API serialises a required product with `variantIds: []` (meaning "any variant"). In
 * `@kitenzo/core` 0.9.0 the builder's required-product check resolves an empty list from the
 * bundle's *sections* only, so a required product that sits in no step resolves to no variants,
 * counts as 0, and `isSatisfied` can never be true: the bundle cannot be added to the cart.
 * Basket Edit is hit too, reporting the required product as "missing".
 *
 * The product itself is already merged onto the entry (`requiredProducts[].product`), so its
 * variants are the ones the "any variant" means. No-op for entries that already list variants.
 *
 * Remove when: `test/sdkFixes.test.ts` "the SDK still needs this" fails, which it will once the
 * SDK resolves the variants itself.
 */
/**
 * The SDK sends a required product as `variantIds[0]`, so the order is the choice: an available
 * variant first, or a required product whose first variant sold out is sent anyway and the cart
 * refuses the whole bundle.
 */
function buyableFirst<T extends { available: boolean }>(variants: T[]): T[] {
    return [...variants.filter((variant) => variant.available), ...variants.filter((variant) => !variant.available)];
}

export function withRequiredVariantIds(bundle: BundleDetail): BundleDetail {
    const required = bundle.requiredProducts;
    if (!required?.some((entry) => entry.variantIds.length === 0 && entry.product)) return bundle;
    return {
        ...bundle,
        requiredProducts: required.map((entry) =>
            entry.variantIds.length === 0 && entry.product ? { ...entry, variantIds: buyableFirst(entry.product.variants).map((variant) => variant.id) } : entry,
        ),
    };
}
