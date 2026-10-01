import { createBundleBuilder, selectionsFromSaved, type BundleDetail } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { withRequiredVariantIds } from '../src/sdkFixes';
import { load } from './support';
import type { Fixture } from '../dev/mock/wire';

/**
 * The gift box has no required product, so the case the fix exists for is built from it: the bath
 * soak taken out of every step and carried in every box, exactly as the API serialises a required
 * product (`variantIds: []`, meaning "any variant").
 */
function bathSoakRequired(fixture: Fixture): Fixture {
    const id = fixture.products.find((product) => product.handle === 'botanical-bath-soak')!.shopifyProductId;
    return {
        ...fixture,
        bundle: {
            ...fixture.bundle,
            sections: fixture.bundle.sections.map((section) => ({ ...section, products: section.products.filter((ref) => ref.shopifyProductId !== id) })),
            requiredProducts: [{ quantity: 1, shopifyProductId: id, variantIds: [] }],
        },
    };
}

function completeBox(bundle: BundleDetail) {
    const builder = createBundleBuilder(bundle);
    builder.addItem(bundle.sections[0]!.id, bundle.sections[0]!.products[0]!.variants[0]!.id, 1);
    builder.addItem(bundle.sections[1]!.id, bundle.sections[1]!.products[0]!.variants[0]!.id, 2);
    return builder.getState().isSatisfied;
}

describe('withRequiredVariantIds', () => {
    it('the SDK still needs this: a required product with variantIds [] blocks isSatisfied (delete the fix when this fails)', async () => {
        const { bundle } = await load(bathSoakRequired);
        expect(bundle.requiredProducts?.[0]?.variantIds).toEqual([]);
        expect(completeBox(bundle)).toBe(false);
    });

    it('with the fix, the same selection is satisfied', async () => {
        const { bundle } = await load(bathSoakRequired);
        expect(completeBox(withRequiredVariantIds(bundle))).toBe(true);
    });

    it('with the fix, a basket Edit no longer reports the required product as missing', async () => {
        const { bundle } = await load(bathSoakRequired);
        const required = bundle.requiredProducts![0]!.product!.variants[0]!.id;
        const box = bundle.sections[0]!.products[0]!.variants[0]!.id;
        const saved = [
            { variantId: box, count: 1, sectionId: bundle.sections[0]!.id },
            { variantId: required, count: 1, sectionId: null },
        ];
        expect(selectionsFromSaved(bundle, saved).missing.length).toBe(1);
        expect(selectionsFromSaved(withRequiredVariantIds(bundle), saved).missing).toEqual([]);
    });

    it('leaves a bundle with no required products, or with listed variants, untouched', async () => {
        const { bundle } = await load();
        expect(withRequiredVariantIds(bundle)).toBe(bundle);
    });

    it('puts a buyable variant first, because the SDK sends variantIds[0]', async () => {
        const { bundle } = await load((fixture) => ({
            ...bathSoakRequired(fixture),
            products: fixture.products.map((product) =>
                product.handle === 'botanical-bath-soak'
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
});
