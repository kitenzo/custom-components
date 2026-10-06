import { describe, expect, it } from 'vitest';

import { photosOf, toViewModel } from '../src/model';
import { load, soldOut, withProduct, withRequired } from './support';

const handles = (model: ReturnType<typeof toViewModel>, index: number) => model.sections[index]!.products.map((product) => product.handle);

describe('toViewModel', () => {
    it('draws the offer: the step with its count and flavours, what every box includes, and no problems', async () => {
        const { bundle, settings } = await load((fixture) => withRequired(fixture, 'english-toffee'));
        const model = toViewModel(bundle, settings);
        expect(model.sections.map((section) => [section.name, section.limits.min, section.limits.max, section.products.length])).toEqual([['Choose your macarons', 6, 24, 9]]);
        expect(model.sections[0]!.limits.allowedCounts).toEqual([6, 12, 24]);
        expect(handles(model, 0)[0]).toBe('vanilla-macaron');
        expect(model.sections[0]!.products.find((product) => product.handle === 'lavender-macaron')?.soldOut).toBe(true);
        expect(model.required.map((entry) => [entry.product.handle, entry.quantity, entry.product.soldOut])).toEqual([['english-toffee', 1, false]]);
        expect(model.requiredQuantity).toBe(1);
        expect(model.problems).toEqual([]);
    });

    it('passes on what the merchant has to fix, and keeps a sold-out included product in view', async () => {
        const { bundle, settings } = await load((fixture) => withProduct(withRequired(fixture, 'english-toffee'), 'english-toffee', soldOut));
        const model = toViewModel(bundle, { ...settings, hideOutOfStockProducts: true });
        expect(model.required[0]?.product.soldOut).toBe(true);
        expect(model.problems).toEqual([{ blocking: true, detail: expect.stringContaining('English Toffee') }]);
    });

    it('leaves out the flavours the conditions engine hides, and a step left with nothing to show', async () => {
        const { bundle, settings } = await load();
        const all = toViewModel(bundle, settings);
        const box = all.sections[0]!;
        const lemon = box.products.find((product) => product.handle === 'lemon-macaron')!;

        const flavourHidden = toViewModel(bundle, settings, { hiddenSectionIds: [], hiddenProducts: [{ productId: lemon.id, sectionId: box.id }] });
        expect(handles(flavourHidden, 0)).toEqual(handles(all, 0).filter((handle) => handle !== 'lemon-macaron'));
        expect(flavourHidden.sections[0]!.byVariantId.has(lemon.variants[0]!.id)).toBe(false);

        expect(toViewModel(bundle, settings, { hiddenSectionIds: [box.id], hiddenProducts: [] }).sections).toEqual([]);
        const emptied = toViewModel(bundle, settings, { hiddenSectionIds: [], hiddenProducts: box.products.map((product) => ({ productId: product.id, sectionId: null })) });
        expect(emptied.sections).toEqual([]);
    });

    it('finds the flavour and the variant behind any pick the step can hold', async () => {
        const { bundle, settings } = await load();
        const box = toViewModel(bundle, settings).sections[0]!;
        const product = box.products[3]!;
        const variant = product.variants.at(-1)!;
        expect(box.byVariantId.size).toBe(box.products.reduce((count, entry) => count + entry.variants.length, 0));
        expect(box.byVariantId.get(variant.id)).toEqual({ product, variant });
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
            withProduct(fixture, 'pistachio-macaron', (product) => ({ ...product, descriptionHtml: '<p>Nutty &amp; <b>green</b></p><script>alert(1)</script>' })),
        );
        const pistachio = toViewModel(bundle, settings).sections[0]!.products.find((product) => product.handle === 'pistachio-macaron');
        expect(pistachio?.description).toBe('Nutty & green');
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
