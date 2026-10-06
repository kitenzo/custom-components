import { describe, expect, it } from 'vitest';

import { photosOf, toViewModel } from '../src/model';
import { asRequired, load, soldOut, withProduct } from './support';

const handles = (model: ReturnType<typeof toViewModel>, index: number) => model.sections[index]!.products.map((product) => product.handle);

describe('toViewModel', () => {
    it('draws the offer: each step with its count, its own auto-advance setting and its products, and no problems', async () => {
        const { bundle, settings } = await load();
        const model = toViewModel(bundle, settings);
        expect(model.sections.map((section) => [section.name, section.limits.min, section.limits.max, section.autoNext, section.products.length])).toEqual([
            ['Cleanse', 1, 1, true, 4],
            ['Treat', 1, 1, true, 4],
            ['Moisturise', 1, 1, false, 4],
        ]);
        expect(handles(model, 0)[0]).toBe('squalane-camellia-cleansing-oil-balm');
        expect(model.sections[1]!.products.find((product) => product.handle === 'retinal-squalane-overnight-serum')?.soldOut).toBe(true);
        expect(model.required).toEqual([]);
        expect(model.problems).toEqual([]);
    });

    it('keeps each product\'s Shopify tags, which the quiz scores on', async () => {
        const { bundle, settings } = await load();
        const balm = toViewModel(bundle, settings).sections[2]!.products.find((product) => product.handle === 'centella-panthenol-barrier-balm');
        expect(balm?.tags).toEqual(expect.arrayContaining(['barrier-repair', 'sensitive-skin']));
    });

    it('passes on what the merchant has to fix, and keeps a sold-out included product in view', async () => {
        const { bundle, settings } = await load((fixture) => withProduct(asRequired(fixture, 'ceramide-peptide-daily-moisturiser'), 'ceramide-peptide-daily-moisturiser', soldOut));
        const model = toViewModel(bundle, { ...settings, hideOutOfStockProducts: true });
        expect(model.required.map((entry) => [entry.product.handle, entry.quantity, entry.product.soldOut])).toEqual([['ceramide-peptide-daily-moisturiser', 1, true]]);
        expect(model.problems).toEqual([{ blocking: true, detail: expect.stringContaining('Ceramide + Peptide') }]);
    });

    it('leaves out the steps and products the conditions engine hides, and a step left with nothing to show', async () => {
        const { bundle, settings } = await load();
        const all = toViewModel(bundle, settings);
        const [cleanse, treat, moisturise] = all.sections as [(typeof all.sections)[number], (typeof all.sections)[number], (typeof all.sections)[number]];
        const gel = cleanse.products.find((product) => product.handle === 'amino-acid-gentle-gel-cleanser')!;

        const stepHidden = toViewModel(bundle, settings, { hiddenSectionIds: [treat.id], hiddenProducts: [{ productId: gel.id, sectionId: cleanse.id }] });
        expect(stepHidden.sections.map((section) => section.id)).toEqual([cleanse.id, moisturise.id]);
        expect(handles(stepHidden, 0)).toEqual(handles(all, 0).filter((handle) => handle !== 'amino-acid-gentle-gel-cleanser'));
        expect(stepHidden.sections[0]!.byVariantId.has(gel.variants[0]!.id)).toBe(false);

        const emptied = toViewModel(bundle, settings, { hiddenSectionIds: [], hiddenProducts: moisturise.products.map((product) => ({ productId: product.id, sectionId: null })) });
        expect(emptied.sections.map((section) => section.id)).toEqual([cleanse.id, treat.id]);
    });

    it('finds the product and the size behind any pick a step can hold', async () => {
        const { bundle, settings } = await load();
        const moisturise = toViewModel(bundle, settings).sections[2]!;
        const product = moisturise.products[1]!;
        const variant = product.variants.at(-1)!;
        expect(moisturise.byVariantId.size).toBe(moisturise.products.reduce((count, entry) => count + entry.variants.length, 0));
        expect(moisturise.byVariantId.get(variant.id)).toEqual({ product, variant });
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
            withProduct(fixture, 'amino-acid-gentle-gel-cleanser', (product) => ({ ...product, descriptionHtml: '<p>Calm &amp; <b>gentle</b></p><script>alert(1)</script>' })),
        );
        const gel = toViewModel(bundle, settings).sections[0]!.products.find((product) => product.handle === 'amino-acid-gentle-gel-cleanser');
        expect(gel?.description).toBe('Calm & gentle');
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
