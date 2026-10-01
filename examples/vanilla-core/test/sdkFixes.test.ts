import { createBundleBuilder, selectionsFromSaved } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { withRequiredVariantIds } from '../src/sdkFixes';
import { load, withRequired } from './support';

/** The wine case with one bottle made required, as the API would serve it. */
const loadWithRequired = () => load((fixture) => withRequired(fixture, 'pinot-gris'));

describe('withRequiredVariantIds', () => {
    it('the SDK still needs this: a required product with variantIds [] blocks isSatisfied (delete the fix when this fails)', async () => {
        const { bundle } = await loadWithRequired();
        expect(bundle.requiredProducts?.[0]?.variantIds).toEqual([]);
        const builder = createBundleBuilder(bundle);
        builder.addItem(bundle.sections[0]!.id, bundle.sections[0]!.products[0]!.variants[0]!.id, 6);
        expect(builder.getState().isSatisfied).toBe(false);
    });

    it('with the fix, the same selection is satisfied', async () => {
        const { bundle } = await loadWithRequired();
        const fixed = withRequiredVariantIds(bundle);
        const builder = createBundleBuilder(fixed);
        builder.addItem(fixed.sections[0]!.id, fixed.sections[0]!.products[0]!.variants[0]!.id, 6);
        expect(builder.getState().isSatisfied).toBe(true);
    });

    it('with the fix, a basket Edit no longer reports the required product as missing', async () => {
        const { bundle } = await loadWithRequired();
        const required = bundle.requiredProducts![0]!.product!.variants[0]!.id;
        const wine = bundle.sections[0]!.products[0]!.variants[0]!.id;
        const saved = [
            { variantId: wine, count: 6, sectionId: bundle.sections[0]!.id },
            { variantId: required, count: 1, sectionId: null },
        ];
        expect(selectionsFromSaved(bundle, saved).missing.length).toBe(1);
        expect(selectionsFromSaved(withRequiredVariantIds(bundle), saved).missing).toEqual([]);
    });

    it('puts a buyable variant first, because the SDK sends variantIds[0]', async () => {
        const { bundle } = await load((fixture) => ({
            ...withRequired(fixture, 'pinot-gris'),
            products: fixture.products.map((product) =>
                product.handle === 'pinot-gris'
                    ? {
                          ...product,
                          variants: [
                              { ...product.variants[0]!, shopifyVariantId: '111', shopifyVariantGid: 'gid://shopify/ProductVariant/111', available: false },
                              { ...product.variants[0]!, shopifyVariantId: '222', shopifyVariantGid: 'gid://shopify/ProductVariant/222', available: true },
                          ],
                      }
                    : product,
            ),
        }));
        expect(withRequiredVariantIds(bundle).requiredProducts![0]!.variantIds[0]).toBe('222');
    });

    it('leaves a bundle with no required products, or with listed variants, untouched', async () => {
        const { bundle } = await load((fixture) => ({ ...fixture, bundle: { ...fixture.bundle, requiredProducts: [] } }));
        expect(withRequiredVariantIds(bundle)).toBe(bundle);
    });
});
