import { describe, expect, it } from 'vitest';

import { photosOf, toViewModel } from '../src/model';
import { load, soldOut, withProduct, withRequired } from './support';

const handles = (model: ReturnType<typeof toViewModel>) => model.sections[0]!.products.map((product) => product.handle);

describe('toViewModel', () => {
    it('draws the offer: the step with its count and cans, the count across the case, what every case includes, and no problems', async () => {
        const { bundle, settings } = await load((fixture) => withRequired(fixture, 'yuzu-elderflower'));
        const model = toViewModel(bundle, settings);
        expect(model.sections.map((section) => [section.name, section.limits.min, section.limits.max, section.products.length])).toEqual([['Pick your cans', 0, null, 9]]);
        expect(handles(model)).not.toContain('yuzu-elderflower');
        expect([model.bundleLimits.min, model.bundleLimits.max]).toEqual([6, 24]);
        expect(model.required.map((entry) => [entry.product.handle, entry.quantity, entry.product.soldOut])).toEqual([['yuzu-elderflower', 1, false]]);
        expect(model.problems).toEqual([]);
    });

    it('passes on what the merchant has to fix, and keeps a sold-out included product in view', async () => {
        const { bundle, settings } = await load((fixture) => withProduct(withRequired(fixture, 'yuzu-elderflower'), 'yuzu-elderflower', soldOut));
        const model = toViewModel(bundle, { ...settings, hideOutOfStockProducts: true });
        expect(model.required[0]?.product.soldOut).toBe(true);
        expect(model.problems).toEqual([{ blocking: true, detail: expect.stringContaining('Yuzu & Elderflower Spritz') }]);
    });

    it('leaves out the cans the conditions engine hides, and a step left with nothing to show', async () => {
        const { bundle, settings } = await load();
        const all = toViewModel(bundle, settings);
        const cans = all.sections[0]!;
        const pear = cans.products.find((product) => product.handle === 'pear-cardamom')!;

        const oneHidden = toViewModel(bundle, settings, { hiddenSectionIds: [], hiddenProducts: [{ productId: pear.id, sectionId: cans.id }] });
        expect(handles(oneHidden)).toEqual(handles(all).filter((handle) => handle !== 'pear-cardamom'));
        expect(oneHidden.sections[0]!.byVariantId.has(pear.variants[0]!.id)).toBe(false);

        expect(toViewModel(bundle, settings, { hiddenSectionIds: [cans.id], hiddenProducts: [] }).sections).toEqual([]);
        const emptied = toViewModel(bundle, settings, { hiddenSectionIds: [], hiddenProducts: cans.products.map((product) => ({ productId: product.id, sectionId: null })) });
        expect(emptied.sections).toEqual([]);
    });

    it('finds the can behind any pick the step can hold', async () => {
        const { bundle, settings } = await load();
        const cans = toViewModel(bundle, settings).sections[0]!;
        const product = cans.products[3]!;
        const variant = product.variants.at(-1)!;
        expect(cans.byVariantId.size).toBe(cans.products.reduce((count, entry) => count + entry.variants.length, 0));
        expect(cans.byVariantId.get(variant.id)).toEqual({ product, variant });
    });

    it('keeps the tags, which the filters are built from', async () => {
        const { bundle, settings } = await load();
        const pear = toViewModel(bundle, settings).sections[0]!.products.find((product) => product.handle === 'pear-cardamom')!;
        expect(pear.tags).toEqual(expect.arrayContaining(['Flavor_Bold', 'Flavor_Fruity', 'Strength_Stronger', 'Fruity']));
    });

    it('tells the merchant (without blocking) about each tier the ladder leaves out', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...fixture,
            bundle: {
                ...fixture.bundle,
                discount: {
                    ...fixture.bundle.discount!,
                    tiers: [
                        ...fixture.bundle.discount!.tiers,
                        { customText: null, discount: '20.00', operation: 'gte', type: 'total_price', value: '150.00' },
                        { customText: null, discount: '25.00', operation: 'gte', type: 'total_products', value: '30.00' },
                    ],
                },
            },
        }));
        expect(toViewModel(bundle, settings).problems).toEqual([
            { blocking: false, detail: expect.stringMatching(/^A tier on the case's value /) },
            { blocking: false, detail: expect.stringMatching(/^The tier for at least 30 cans /) },
        ]);
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
            withProduct(fixture, 'pear-cardamom', (product) => ({ ...product, descriptionHtml: '<p>Tart &amp; <b>bright</b></p><script>alert(1)</script>' })),
        );
        const pear = toViewModel(bundle, settings).sections[0]!.products.find((product) => product.handle === 'pear-cardamom');
        expect(pear?.description).toBe('Tart & bright');
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
