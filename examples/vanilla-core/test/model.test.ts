import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { caseSize, photosOf, toViewModel } from '../src/model';
import { countRule, load, soldOut, withProduct, withRequired, withTwoSteps } from './support';

const handles = (model: ReturnType<typeof toViewModel>, index: number) => model.sections[index]!.products.map((product) => product.handle);

describe('toViewModel', () => {
    it('draws the offer: each step with its count and wines, what every case includes, and no problems', async () => {
        const { bundle, settings } = await load((fixture) => withRequired(fixture, 'pinot-gris'));
        const model = toViewModel(bundle, settings);
        expect(model.sections.map((section) => [section.name, section.limits.min, section.limits.max, section.products.length])).toEqual([['Choose your six', 6, 6, 7]]);
        expect(handles(model, 0)[0]).toBe('californian-reisling-blend');
        expect(model.sections[0]!.products.find((product) => product.handle === 'californian-semillion')?.soldOut).toBe(true);
        expect(model.required.map((entry) => [entry.product.handle, entry.quantity, entry.product.soldOut])).toEqual([['pinot-gris', 1, false]]);
        expect(model.problems).toEqual([]);
    });

    it('passes on what the merchant has to fix, and keeps a sold-out included wine in view', async () => {
        const { bundle, settings } = await load((fixture) => withProduct(withRequired(fixture, 'pinot-gris'), 'pinot-gris', soldOut));
        const model = toViewModel(bundle, { ...settings, hideOutOfStockProducts: true });
        expect(model.required[0]?.product.soldOut).toBe(true);
        expect(model.problems).toEqual([{ blocking: true, detail: expect.stringContaining('Pinot Gris') }]);
    });

    it('leaves out the steps and wines the conditions engine hides, and a step left with nothing to show', async () => {
        const { bundle, settings } = await load((fixture) => withTwoSteps(fixture, (first) => [countRule('eq', 6, first)]));
        const all = toViewModel(bundle, settings);
        const [wines, cellar] = all.sections as [(typeof all.sections)[number], (typeof all.sections)[number]];
        const chardonnay = wines.products.find((product) => product.handle === 'californian-chardonnay')!;

        const stepHidden = toViewModel(bundle, settings, { hiddenSectionIds: [cellar.id], hiddenProducts: [{ productId: chardonnay.id, sectionId: wines.id }] });
        expect(stepHidden.sections.map((section) => section.id)).toEqual([wines.id]);
        expect(handles(stepHidden, 0)).toEqual(handles(all, 0).filter((handle) => handle !== 'californian-chardonnay'));
        expect(stepHidden.sections[0]!.byVariantId.has(chardonnay.variants[0]!.id)).toBe(false);

        const emptied = toViewModel(bundle, settings, { hiddenSectionIds: [], hiddenProducts: cellar.products.map((product) => ({ productId: product.id, sectionId: null })) });
        expect(emptied.sections.map((section) => section.id)).toEqual([wines.id]);
    });

    it('finds the wine and the variant behind any pick a step can hold', async () => {
        const { bundle, settings } = await load();
        const wines = toViewModel(bundle, settings).sections[0]!;
        const product = wines.products[3]!;
        const variant = product.variants.at(-1)!;
        expect(wines.byVariantId.size).toBe(wines.products.reduce((count, entry) => count + entry.variants.length, 0));
        expect(wines.byVariantId.get(variant.id)).toEqual({ product, variant });
    });

    it('refuses a bundle with required personalisation it cannot collect, and takes one whose fields are optional', async () => {
        const withField = (required: boolean) =>
            load((fixture) => ({
                ...fixture,
                bundle: {
                    ...fixture.bundle,
                    personalisation: { [fixture.products[0]!.shopifyProductId]: [{ id: 'f1', key: 'Gift note', label: 'Gift note', type: 'text', required }] },
                },
            }));
        const asked = await withField(true);
        expect(toViewModel(asked.bundle, asked.settings).problems).toEqual([{ blocking: true, detail: expect.stringMatching(/personalisation \(Gift note\)/) }]);
        const optional = await withField(false);
        expect(toViewModel(optional.bundle, optional.settings).problems).toEqual([]);
    });

    it('turns descriptions into text, so merchant markup never renders as markup', async () => {
        const { bundle, settings } = await load((fixture) =>
            withProduct(fixture, 'californian-chardonnay', (product) => ({ ...product, descriptionHtml: '<p>Oak &amp; <b>butter</b></p><script>alert(1)</script>' })),
        );
        const wine = toViewModel(bundle, settings).sections[0]!.products.find((product) => product.handle === 'californian-chardonnay');
        expect(wine?.description).toBe('Oak & butter');
    });
});

describe('photosOf', () => {
    const product = async (change: object) => {
        const { bundle } = await load();
        return { ...bundle.sections[0]!.products[0]!, ...change };
    };

    it('puts the featured photograph first, once, even when its `?v=` differs from the gallery\'s copy', async () => {
        const photos = photosOf(
            await product({
                image: 'https://cdn.shopify.com/s/files/b.jpg?v=2',
                images: [
                    { url: 'https://cdn.shopify.com/s/files/a.jpg?v=1', alt: 'A' },
                    { url: 'https://cdn.shopify.com/s/files/b.jpg?v=1', alt: 'B' },
                    { url: 'https://cdn.shopify.com/s/files/c.jpg?v=1', alt: 'C' },
                ],
            }),
        );
        expect(photos.map((photo) => photo.alt)).toEqual(['B', 'A', 'C']);
    });

    it('still shows the one photograph of a wine that has no gallery', async () => {
        expect(photosOf(await product({ image: 'https://cdn.shopify.com/s/files/a.jpg', images: undefined }))).toEqual([{ url: 'https://cdn.shopify.com/s/files/a.jpg', alt: '' }]);
        expect(photosOf(await product({ image: null, images: [] }))).toEqual([]);
    });
});

describe('caseSize', () => {
    type Rule = Parameters<typeof countRule>;
    /** The case the page draws for a bundle nobody has picked from yet. */
    async function emptyCase(change: Parameters<typeof load>[0]) {
        const { bundle, settings } = await load(change);
        return caseSize(toViewModel(bundle, settings), createBundleBuilder(bundle).getState().progress.requiredQuantity);
    }
    const withRules = (...rules: Rule[]) => emptyCase((fixture) => ({ ...fixture, bundle: { ...fixture.bundle, limitRules: rules.map((rule) => countRule(...rule)) } }));

    it('draws the case the step asks for: 6 slots, all 6 required', async () => {
        expect(await emptyCase((fixture) => fixture)).toEqual({ slots: 6, required: 6 });
    });

    it('reads a bundle-wide count the same way, so the merchant can set the 6 on either', async () => {
        expect(await withRules(['eq', 6, null])).toEqual({ slots: 6, required: 6 });
    });

    it('draws the largest of several allowed sizes, and leaves which counts are valid to the engine', async () => {
        expect(await withRules(['eq', 6, 71], ['eq', 12, 71])).toEqual({ slots: 12, required: 6 });
    });

    it('adds up the steps of a case that has several', async () => {
        expect(await emptyCase((fixture) => withTwoSteps(fixture, (first, second) => [countRule('eq', 4, first), countRule('lte', 2, second)]))).toEqual({ slots: 6, required: 4 });
    });

    it('counts a required bottle into the case for as long as the SDK is the one adding it', async () => {
        const { bundle, settings } = await load((fixture) => {
            const required = withRequired(fixture, 'pinot-gris');
            // Still on the shelf too, so the shopper can pick it themselves.
            return { ...required, bundle: { ...required.bundle, sections: fixture.bundle.sections } };
        });
        const model = toViewModel(bundle, settings);
        const builder = createBundleBuilder(bundle);
        // The step still asks for 6 picks; the required bottle rides in the same case.
        expect(caseSize(model, builder.getState().progress.requiredQuantity)).toEqual({ slots: 7, required: 7 });
        const wines = model.sections[0]!;
        builder.addItem(wines.id, wines.products.find((product) => product.handle === 'pinot-gris')!.variants[0]!.id, 1);
        expect(caseSize(model, builder.getState().progress.requiredQuantity)).toEqual({ slots: 6, required: 6 });
    });

    it('draws no case when nothing caps it, or when it is too big to be a picture', async () => {
        expect(await withRules(['gte', 3, 71])).toBeNull();
        expect(await withRules(['eq', 48, null])).toBeNull();
        expect(await withRules(['eq', 48, 71])).toBeNull();
    });

    it('draws no case for rules that contradict each other: there is no size to draw', async () => {
        expect(await withRules(['gte', 5, null], ['lte', 3, null])).toBeNull();
    });
});
