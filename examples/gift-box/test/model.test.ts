import { describe, expect, it } from 'vitest';

import { photosOf, toViewModel } from '../src/model';
import { load, soldOut, withProduct } from './support';
import type { Fixture } from '../dev/mock/wire';

const handles = (model: ReturnType<typeof toViewModel>, index: number) => model.sections[index]!.products.map((product) => product.handle);
const idOf = (fixture: Fixture, handle: string) => fixture.products.find((product) => product.handle === handle)!.shopifyProductId;

/** The bath soak taken out of its step and carried in every box instead. */
function bathSoakRequired(fixture: Fixture): Fixture {
    const id = idOf(fixture, 'botanical-bath-soak');
    return {
        ...fixture,
        bundle: {
            ...fixture.bundle,
            sections: fixture.bundle.sections.map((section) => ({ ...section, products: section.products.filter((ref) => ref.shopifyProductId !== id) })),
            requiredProducts: [{ quantity: 1, shopifyProductId: id, variantIds: [] }],
        },
    };
}

/** Image upload fields on the candle, which this widget cannot collect, beside two it can. */
function candleWithUploads(fixture: Fixture): Fixture {
    return {
        ...fixture,
        bundle: {
            ...fixture.bundle,
            personalisation: {
                ...fixture.bundle.personalisation,
                [idOf(fixture, 'hand-poured-soy-candle')]: [
                    { id: 'photo', key: 'Photo', label: 'Label photo', type: 'image', required: true },
                    { id: 'sketch', key: 'Sketch', label: 'Your sketch', type: 'image', required: false },
                    { id: 'gold', key: 'Gold leaf', label: 'Gold leaf lettering', type: 'text', required: false, feeOptionId: 7 },
                    { id: 'name', key: 'Name', label: 'Name on the label', type: 'text', required: false, characterLimit: 15 },
                ],
            },
        },
    };
}

describe('toViewModel', () => {
    it('draws the offer: each step with its count and products, what every box includes, and no problems', async () => {
        const { bundle, settings } = await load(bathSoakRequired);
        const model = toViewModel(bundle, settings);
        expect(model.sections.map((section) => [section.name, section.limits.min, section.limits.max, section.autoNext, section.products.length])).toEqual([
            ['Choose your box', 1, 1, true, 1],
            ['Fill it', 2, 5, false, 5],
            ['Add a card', 0, 1, false, 6],
        ]);
        expect(handles(model, 1)[0]).toBe('hand-poured-soy-candle');
        expect(model.sections[2]!.products.find((product) => product.handle === 'get-well-soon-letterpress-card')?.soldOut).toBe(true);
        expect(model.required.map((entry) => [entry.product.handle, entry.quantity, entry.product.soldOut])).toEqual([['botanical-bath-soak', 1, false]]);
        expect(model.problems).toEqual([]);
    });

    it('passes on what the merchant has to fix, and keeps a sold-out included product in view', async () => {
        const { bundle, settings } = await load((fixture) => withProduct(bathSoakRequired(fixture), 'botanical-bath-soak', soldOut));
        const model = toViewModel(bundle, { ...settings, hideOutOfStockProducts: true });
        expect(model.required[0]?.product.soldOut).toBe(true);
        expect(model.problems).toEqual([{ blocking: true, detail: expect.stringContaining('Botanical Bath Soak') }]);
    });

    it('leaves out the steps and products the conditions engine hides, and a step left with nothing to show', async () => {
        const { bundle, settings } = await load();
        const all = toViewModel(bundle, settings);
        const [boxes, fill, cards] = all.sections as [(typeof all.sections)[number], (typeof all.sections)[number], (typeof all.sections)[number]];
        const tea = fill.products.find((product) => product.handle === 'loose-leaf-tea-tin')!;

        const stepHidden = toViewModel(bundle, settings, { hiddenSectionIds: [cards.id], hiddenProducts: [{ productId: tea.id, sectionId: fill.id }] });
        expect(stepHidden.sections.map((section) => section.id)).toEqual([boxes.id, fill.id]);
        expect(handles(stepHidden, 1)).toEqual(handles(all, 1).filter((handle) => handle !== 'loose-leaf-tea-tin'));
        expect(stepHidden.sections[1]!.byVariantId.has(tea.variants[0]!.id)).toBe(false);

        const emptied = toViewModel(bundle, settings, { hiddenSectionIds: [], hiddenProducts: cards.products.map((product) => ({ productId: product.id, sectionId: null })) });
        expect(emptied.sections.map((section) => section.id)).toEqual([boxes.id, fill.id]);
    });

    it('finds the product and the variant behind any pick a step can hold', async () => {
        const { bundle, settings } = await load();
        const fill = toViewModel(bundle, settings).sections[1]!;
        const product = fill.products[2]!;
        const variant = product.variants.at(-1)!;
        expect(fill.byVariantId.size).toBe(fill.products.reduce((count, entry) => count + entry.variants.length, 0));
        expect(fill.byVariantId.get(variant.id)).toEqual({ product, variant });
    });

    it('reads each product\'s personalisation fields from the bundle, and only those', async () => {
        const { bundle, settings } = await load();
        const model = toViewModel(bundle, settings);
        const find = (handle: string) => model.sections.flatMap((section) => section.products).find((product) => product.handle === handle)!;
        expect(find('engravable-brass-matchbox').fields.map((field) => [field.key, field.label, field.required, field.characterLimit])).toEqual([['Engraving', 'Lid engraving', true, 12]]);
        expect(find('new-home-letterpress-card').fields.map((field) => [field.key, field.required, field.characterLimit])).toEqual([['Card message', false, 200]]);
        expect(find('hand-poured-soy-candle').fields).toEqual([]);
    });

    it('holds the bundle off sale for a required image upload, leaves out an optional one, and collects a field with a fee', async () => {
        const { bundle, settings } = await load(candleWithUploads);
        const model = toViewModel(bundle, settings);
        expect(model.problems).toEqual([
            { blocking: true, detail: expect.stringContaining('"Label photo"') },
            { blocking: false, detail: expect.stringContaining('"Your sketch"') },
        ]);
        const candle = model.sections[1]!.products.find((product) => product.handle === 'hand-poured-soy-candle')!;
        expect(candle.fields.map((field) => field.key)).toEqual(['Gold leaf', 'Name']);
    });

    it('says the same about an upload it cannot collect while a condition hides its product', async () => {
        const { bundle, settings } = await load(candleWithUploads);
        const all = toViewModel(bundle, settings);
        const candle = all.sections[1]!.products.find((product) => product.handle === 'hand-poured-soy-candle')!;
        const hidden = toViewModel(bundle, settings, { hiddenSectionIds: [], hiddenProducts: [{ productId: candle.id, sectionId: null }] });
        expect(handles(hidden, 1)).not.toContain('hand-poured-soy-candle');
        expect(hidden.problems).toEqual(all.problems);
    });

    it('turns descriptions into text, so merchant markup never renders as markup', async () => {
        const { bundle, settings } = await load((fixture) =>
            withProduct(fixture, 'loose-leaf-tea-tin', (product) => ({ ...product, descriptionHtml: '<p>Tart &amp; <b>bright</b></p><script>alert(1)</script>' })),
        );
        const tea = toViewModel(bundle, settings).sections[1]!.products.find((product) => product.handle === 'loose-leaf-tea-tin');
        expect(tea?.description).toBe('Tart & bright');
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
