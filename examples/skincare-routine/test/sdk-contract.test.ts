/*
 * What this widget takes from the SDK on trust.
 *
 * None of this is the widget's code. Each case is a behaviour the widget has no fallback for, so
 * an SDK upgrade that changes one fails here, by name, rather than as a wrong routine on the page.
 */
import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { load } from './support';

async function setUp(change?: Parameters<typeof load>[0]) {
    const { bundle } = await load(change);
    const [cleanse, treat, moisturise] = bundle.sections as [(typeof bundle.sections)[number], (typeof bundle.sections)[number], (typeof bundle.sections)[number]];
    const variant = (section: typeof cleanse, handle: string, title?: string) => {
        const product = section.products.find((entry) => entry.handle === handle)!;
        return title ? product.variants.find((entry) => entry.title === title)! : product.variants.find((entry) => entry.available)!;
    };
    return { bundle, cleanse, treat, moisturise, variant };
}

describe('the SDK contract this widget relies on', () => {
    it('swaps a pick in a full step, where adding the new one beside it is refused', async () => {
        const { bundle, cleanse, variant } = await setUp();
        const builder = createBundleBuilder(bundle);
        const gel = variant(cleanse, 'amino-acid-gentle-gel-cleanser');
        const pha = variant(cleanse, 'pha-zinc-exfoliating-cleanser');
        builder.addItem(cleanse.id, gel.id, 1);
        expect(builder.blockedReason(cleanse.id, pha.id)).toBe('section-full');
        expect(builder.addItem(cleanse.id, pha.id, 1)).toBe(0);

        expect(builder.swapBlockedReason(cleanse.id, gel.id, pha.id)).toBeNull();
        expect(builder.swapItem(cleanse.id, gel.id, pha.id)).toBe(true);
        expect(builder.getState().selections[cleanse.id]).toEqual([{ variantId: pha.id, quantity: 1 }]);
        // The swap is judged with the old pick gone, and a sold-out size is still refused.
        expect(builder.swapBlockedReason(cleanse.id, pha.id, variant(cleanse, 'ceramide-oat-cream-cleanser', '75ml').id)).toBe('sold-out');
    });

    it('lets a chosen product change size under "one per product": the swap is not one more of it', async () => {
        const { bundle, moisturise, variant } = await setUp((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, limitRules: [...fixture.bundle.limitRules, { operation: 'lte' as const, sectionId: null, type: 'amount-of-one-product' as const, value: '1.00' }] },
        }));
        const builder = createBundleBuilder(bundle);
        const small = variant(moisturise, 'hyaluronic-aloe-gel-cream', '30ml');
        const large = variant(moisturise, 'hyaluronic-aloe-gel-cream', '50ml');
        builder.addItem(moisturise.id, small.id, 1);
        expect(builder.swapBlockedReason(moisturise.id, small.id, large.id)).toBeNull();
        expect(builder.swapItem(moisturise.id, small.id, large.id)).toBe(true);
        expect(builder.getState().selections[moisturise.id]).toEqual([{ variantId: large.id, quantity: 1 }]);
    });

    it('trims an opening selection (a quiz result, a basket Edit) to what could be picked by hand: nothing sold out, no sold-out size, nothing over a step maximum', async () => {
        const { bundle, cleanse, treat, variant } = await setUp();
        const retinal = treat.products.find((product) => product.handle === 'retinal-squalane-overnight-serum')!.variants[0]!;
        const builder = createBundleBuilder(bundle, {
            initialSelections: {
                [cleanse.id]: [
                    { variantId: variant(cleanse, 'ceramide-oat-cream-cleanser', '75ml').id, quantity: 1 }, // sold-out size
                    { variantId: variant(cleanse, 'amino-acid-gentle-gel-cleanser').id, quantity: 3 }, // step max 1
                    { variantId: variant(cleanse, 'pha-zinc-exfoliating-cleanser').id, quantity: 1 }, // no room left
                    { variantId: 'gid-the-bundle-no-longer-offers', quantity: 1 },
                ],
                [treat.id]: [{ variantId: retinal.id, quantity: 1 }],
            },
        });
        expect(builder.getState().selections).toEqual({
            [cleanse.id]: [{ variantId: variant(cleanse, 'amino-acid-gentle-gel-cleanser').id, quantity: 1 }],
        });
    });

    it('opens a step by its place in the bundle, and then judges that step: Continue reads `isSectionValid` of the step on screen', async () => {
        const { bundle, cleanse, treat, variant } = await setUp();
        const builder = createBundleBuilder(bundle);
        expect(builder.getState().currentSection?.id).toBe(cleanse.id);
        expect(builder.getState().isSectionValid).toBe(false);
        builder.addItem(cleanse.id, variant(cleanse, 'amino-acid-gentle-gel-cleanser').id, 1);
        expect(builder.getState().isSectionValid).toBe(true);

        builder.goToSection(bundle.sections.findIndex((section) => section.id === treat.id));
        expect(builder.getState().currentSection?.id).toBe(treat.id);
        expect(builder.getState().isSectionValid).toBe(false);
    });

    it('treats a step with no count rule as optional: nothing owed, and the routine can be bought without it', async () => {
        const { bundle, cleanse, treat, moisturise, variant } = await setUp((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, limitRules: fixture.bundle.limitRules.filter((rule) => rule.sectionId !== fixture.bundle.sections[2]!.id) },
        }));
        const builder = createBundleBuilder(bundle);
        expect(builder.getState().progress.sections[moisturise.id]).toEqual({ quantity: 0, missing: 0 });
        builder.addItem(cleanse.id, variant(cleanse, 'amino-acid-gentle-gel-cleanser').id, 1);
        builder.addItem(treat.id, variant(treat, 'niacinamide-zinc-blemish-serum').id, 1);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});
