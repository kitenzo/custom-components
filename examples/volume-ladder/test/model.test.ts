import { describe, expect, it } from 'vitest';

import { photosOf, toViewModel } from '../src/model';
import { load, soldOut, withProduct, withRequiredUnflavoured } from './support';

const handles = (model: ReturnType<typeof toViewModel>, index: number) => model.sections[index]!.products.map((product) => product.handle);

describe('toViewModel', () => {
    it('draws the offer: the one step with its flavours, nothing included, and no problems', async () => {
        const { bundle, settings } = await load();
        const model = toViewModel(bundle, settings);
        expect(model.sections.map((section) => section.name)).toEqual(['Choose your flavours']);
        expect(handles(model, 0)).toEqual(['chocolate-whey-protein', 'vanilla-whey-protein', 'peanut-butter-whey-protein', 'unflavoured-whey-protein']);
        expect(model.required).toEqual([]);
        expect(model.problems).toEqual([]);
    });

    it('passes on what the merchant has to fix, and keeps a sold-out included product in view', async () => {
        const { bundle, settings } = await load((fixture) => withProduct(withRequiredUnflavoured(fixture), 'unflavoured-whey-protein', soldOut));
        const model = toViewModel(bundle, { ...settings, hideOutOfStockProducts: true });
        expect(model.required.map((entry) => [entry.product.handle, entry.quantity, entry.product.soldOut])).toEqual([['unflavoured-whey-protein', 1, true]]);
        expect(model.problems).toEqual([{ blocking: true, detail: expect.stringContaining('Unflavoured') }]);
    });

    it('leaves out the products and steps the conditions engine hides, and a step left with nothing to show', async () => {
        const { bundle, settings } = await load();
        const all = toViewModel(bundle, settings);
        const flavours = all.sections[0]!;
        const vanilla = flavours.products.find((product) => product.handle === 'vanilla-whey-protein')!;

        const oneHidden = toViewModel(bundle, settings, { hiddenSectionIds: [], hiddenProducts: [{ productId: vanilla.id, sectionId: flavours.id }] });
        expect(handles(oneHidden, 0)).toEqual(handles(all, 0).filter((handle) => handle !== 'vanilla-whey-protein'));

        const emptied = toViewModel(bundle, settings, { hiddenSectionIds: [], hiddenProducts: flavours.products.map((product) => ({ productId: product.id, sectionId: null })) });
        expect(emptied.sections).toEqual([]);
        expect(toViewModel(bundle, settings, { hiddenSectionIds: [flavours.id], hiddenProducts: [] }).sections).toEqual([]);
    });

    it('tells the merchant, without blocking the sale, about a discount that cannot be a ladder and a tier the ladder leaves out', async () => {
        const flat = await load((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, discount: { flatOrTiered: 'flat', minimum: null, operator: 'max', tiers: [], type: 'percentage', value: '10.00' } },
        }));
        expect(toViewModel(flat.bundle, flat.settings).problems).toEqual([{ blocking: false, detail: expect.stringContaining('ladder is hidden') }]);

        const capped = await load((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, limitRules: [...fixture.bundle.limitRules, { operation: 'lte', sectionId: null, type: 'total-number-of-products', value: '4.00' }] },
        }));
        expect(toViewModel(capped.bundle, capped.settings).problems).toEqual([{ blocking: false, detail: expect.stringContaining('at least 6 products') }]);
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
            withProduct(fixture, 'vanilla-whey-protein', (product) => ({ ...product, descriptionHtml: '<p>Smooth &amp; <b>creamy</b></p><script>alert(1)</script>' })),
        );
        const vanilla = toViewModel(bundle, settings).sections[0]!.products.find((product) => product.handle === 'vanilla-whey-protein');
        expect(vanilla?.description).toBe('Smooth & creamy');
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
