import { createBundleBuilder, selectionsFromSaved } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { withRequiredVariantIds } from '../src/sdkFixes';
import { asRequired, load } from './support';

// The routine has no required product of its own; the bug needs one that sits in no step.
const withRequired = (fixture: Parameters<typeof asRequired>[0]) => asRequired(fixture, 'ceramide-peptide-daily-moisturiser');

/** One pick in each step: a complete routine apart from the required product. */
function pickEveryStep(builder: ReturnType<typeof createBundleBuilder>, bundle: Awaited<ReturnType<typeof load>>['bundle']) {
    for (const section of bundle.sections) {
        const variant = section.products.flatMap((product) => product.variants).find((candidate) => candidate.available)!;
        builder.addItem(section.id, variant.id, 1);
    }
}

describe('withRequiredVariantIds', () => {
    it('the SDK still needs this: a required product with variantIds [] blocks isSatisfied (delete the fix when this fails)', async () => {
        const { bundle } = await load(withRequired);
        expect(bundle.requiredProducts?.[0]?.variantIds).toEqual([]);
        const builder = createBundleBuilder(bundle);
        pickEveryStep(builder, bundle);
        expect(builder.getState().isSatisfied).toBe(false);
    });

    it('with the fix, the same selection is satisfied', async () => {
        const { bundle } = await load(withRequired);
        const fixed = withRequiredVariantIds(bundle);
        const builder = createBundleBuilder(fixed);
        pickEveryStep(builder, fixed);
        expect(builder.getState().isSatisfied).toBe(true);
    });

    it('with the fix, a basket Edit no longer reports the required product as missing', async () => {
        const { bundle } = await load(withRequired);
        const required = bundle.requiredProducts![0]!.product!.variants[0]!.id;
        const cleanser = bundle.sections[0]!.products[0]!.variants[0]!.id;
        const saved = [
            { variantId: cleanser, count: 1, sectionId: bundle.sections[0]!.id },
            { variantId: required, count: 1, sectionId: null },
        ];
        expect(selectionsFromSaved(bundle, saved).missing.length).toBe(1);
        expect(selectionsFromSaved(withRequiredVariantIds(bundle), saved).missing).toEqual([]);
    });

    it('leaves a bundle with no required products, or with listed variants, untouched', async () => {
        const { bundle } = await load((fixture) => ({ ...fixture, bundle: { ...fixture.bundle, requiredProducts: [] } }));
        expect(withRequiredVariantIds(bundle)).toBe(bundle);
    });
});
