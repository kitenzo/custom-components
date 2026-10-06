import { describe, expect, it } from 'vitest';

import { photosOf, toViewModel } from '../src/model';
import { load, soldOut, withProduct } from './support';

const handles = (model: ReturnType<typeof toViewModel>, index: number) => model.sections[index]!.products.map((product) => product.handle);

describe('toViewModel', () => {
    it('draws the offer: each step with its count and products, what every bundle includes, and no problems', async () => {
        const { bundle, settings } = await load();
        const model = toViewModel(bundle, settings);
        expect(model.sections.map((section) => [section.name, section.limits.min, section.limits.max, section.products.length])).toEqual([
            ['Choose your smoothies', 3, 6, 6],
            ['Add a vitamin shot', 0, 2, 6],
        ]);
        expect(handles(model, 0)[0]).toBe('strawberries-cream');
        expect(model.required.map((entry) => [entry.product.handle, entry.quantity, entry.product.soldOut])).toEqual([['almond-oat-sample', 1, false]]);
        expect(model.problems).toEqual([]);
    });

    it('passes on what the merchant has to fix, and keeps a sold-out included product in view', async () => {
        const { bundle, settings } = await load((fixture) => withProduct(fixture, 'almond-oat-sample', soldOut));
        const model = toViewModel(bundle, { ...settings, hideOutOfStockProducts: true });
        expect(model.required[0]?.product.soldOut).toBe(true);
        expect(model.problems).toEqual([{ blocking: true, detail: expect.stringContaining('Almond & Oats Sample') }]);
    });

    it('leaves out the steps and products the conditions engine hides, and a step left with nothing to show', async () => {
        const { bundle, settings } = await load();
        const all = toViewModel(bundle, settings);
        const [smoothies, shots] = all.sections as [(typeof all.sections)[number], (typeof all.sections)[number]];
        const ginger = smoothies.products.find((product) => product.handle === 'ginger-pear')!;

        const stepHidden = toViewModel(bundle, settings, { hiddenSectionIds: [shots.id], hiddenProducts: [{ productId: ginger.id, sectionId: smoothies.id }] });
        expect(stepHidden.sections.map((section) => section.id)).toEqual([smoothies.id]);
        expect(handles(stepHidden, 0)).toEqual(handles(all, 0).filter((handle) => handle !== 'ginger-pear'));
        expect(stepHidden.sections[0]!.byVariantId.has(ginger.variants[0]!.id)).toBe(false);

        const emptied = toViewModel(bundle, settings, { hiddenSectionIds: [], hiddenProducts: shots.products.map((product) => ({ productId: product.id, sectionId: null })) });
        expect(emptied.sections.map((section) => section.id)).toEqual([smoothies.id]);
    });

    it('finds the product and the variant behind any pick a step can hold', async () => {
        const { bundle, settings } = await load();
        const shots = toViewModel(bundle, settings).sections[1]!;
        const product = shots.products[1]!;
        const variant = product.variants.at(-1)!;
        expect(shots.byVariantId.size).toBe(shots.products.reduce((count, entry) => count + entry.variants.length, 0));
        expect(shots.byVariantId.get(variant.id)).toEqual({ product, variant });
    });

    it('refuses a bundle with required personalisation it cannot collect, and takes one whose fields are optional', async () => {
        const withField = (required: boolean) =>
            load((fixture) => ({
                ...fixture,
                bundle: {
                    ...fixture.bundle,
                    personalisation: { [fixture.products[0]!.shopifyProductId]: [{ id: 'f1', key: 'Engraving', label: 'Engraving', type: 'text', required }] },
                },
            }));
        const asked = await withField(true);
        expect(toViewModel(asked.bundle, asked.settings).problems).toEqual([{ blocking: true, detail: expect.stringMatching(/personalisation \(Engraving\)/) }]);
        const optional = await withField(false);
        expect(toViewModel(optional.bundle, optional.settings).problems).toEqual([]);
    });

    it('turns descriptions into text, so merchant markup never renders as markup', async () => {
        const { bundle, settings } = await load((fixture) =>
            withProduct(fixture, 'ginger-pear', (product) => ({ ...product, descriptionHtml: '<p>Tart &amp; <b>bright</b></p><script>alert(1)</script>' })),
        );
        const ginger = toViewModel(bundle, settings).sections[0]!.products.find((product) => product.handle === 'ginger-pear');
        expect(ginger?.description).toBe('Tart & bright');
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

    it('still shows the one photograph of a product that has no gallery', async () => {
        expect(photosOf(await product({ image: 'https://cdn.shopify.com/s/files/a.jpg', images: undefined }))).toEqual([{ url: 'https://cdn.shopify.com/s/files/a.jpg', alt: '' }]);
        expect(photosOf(await product({ image: null, images: [] }))).toEqual([]);
    });
});
