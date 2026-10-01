import { createBundleBuilder, selectionsFromSaved } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { CATALOG_DEFS } from '../dev/catalog';
import { defineCatalog, type StoreProduct } from '../dev/mock/catalog';
import snapshot from '../dev/mock/demo-store.json' with { type: 'json' };
import { withRequiredVariantIds } from '../src/sdkFixes';
import { load } from './support';

/**
 * The set has no required product, so the fix is proven on a variation of it: a top and a bra to
 * choose, and the leggings carried in every set, in no step, exactly the shape the SDK trips on.
 */
const withRequiredLeggings = () =>
    load(() =>
        defineCatalog(
            { ...CATALOG_DEFS[0]!, sections: CATALOG_DEFS[0]!.sections.slice(0, 2), required: [{ handle: 'power-leggings' }] },
            snapshot as unknown as StoreProduct[],
        ),
    );

const fill = (builder: ReturnType<typeof createBundleBuilder>, bundle: Awaited<ReturnType<typeof load>>['bundle']) => {
    for (const section of bundle.sections) builder.addItem(section.id, section.products[0]!.variants.find((variant) => variant.available)!.id, 1);
};

describe('withRequiredVariantIds', () => {
    it('the SDK still needs this: a required product with variantIds [] blocks isSatisfied (delete the fix when this fails)', async () => {
        const { bundle } = await withRequiredLeggings();
        expect(bundle.requiredProducts?.[0]?.variantIds).toEqual([]);
        const builder = createBundleBuilder(bundle);
        fill(builder, bundle);
        expect(builder.getState().isSatisfied).toBe(false);
    });

    it('with the fix, the same selection is satisfied', async () => {
        const { bundle } = await withRequiredLeggings();
        const fixed = withRequiredVariantIds(bundle);
        const builder = createBundleBuilder(fixed);
        fill(builder, fixed);
        expect(builder.getState().isSatisfied).toBe(true);
    });

    it('with the fix, a basket Edit no longer reports the required product as missing', async () => {
        const { bundle } = await withRequiredLeggings();
        const required = bundle.requiredProducts![0]!.product!.variants[0]!.id;
        const saved = [
            ...bundle.sections.map((section) => ({ variantId: section.products[0]!.variants[0]!.id, count: 1, sectionId: section.id })),
            { variantId: required, count: 1, sectionId: null },
        ];
        expect(selectionsFromSaved(bundle, saved).missing.length).toBe(1);
        expect(selectionsFromSaved(withRequiredVariantIds(bundle), saved).missing).toEqual([]);
    });

    it('puts a buyable variant first, because the SDK sends variantIds[0]', async () => {
        const { bundle } = await load(() => {
            const def = { ...CATALOG_DEFS[0]!, sections: CATALOG_DEFS[0]!.sections.slice(0, 2), required: [{ handle: 'power-leggings' }] };
            // XS in Onyx, the leggings' first variant, sold out.
            return defineCatalog({ ...def, overrides: { 'power-leggings': { variants: [{ title: 'XS / Onyx', soldOut: true }] } } }, snapshot as unknown as StoreProduct[]);
        });
        const first = withRequiredVariantIds(bundle).requiredProducts![0]!.variantIds[0]!;
        const product = bundle.requiredProducts![0]!.product!;
        expect(product.variants[0]!.available).toBe(false);
        expect(product.variants.find((variant) => variant.id === first)!.available).toBe(true);
    });

    it('leaves a bundle with no required products untouched', async () => {
        const { bundle } = await load();
        expect(withRequiredVariantIds(bundle)).toBe(bundle);
    });
});
