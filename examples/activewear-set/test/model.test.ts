import { describe, expect, it } from 'vitest';

import { CATALOG_DEFS } from '../dev/catalog';
import { defineCatalog, type StoreProduct } from '../dev/mock/catalog';
import snapshot from '../dev/mock/demo-store.json' with { type: 'json' };
import type { Fixture } from '../dev/mock/wire';
import { photosOf, toViewModel } from '../src/model';
import { load, soldOut, withProduct } from './support';

type Rule = Fixture['bundle']['limitRules'][number];
const withRules = (change: (rules: Rule[]) => Rule[]) => (fixture: Fixture): Fixture => ({ ...fixture, bundle: { ...fixture.bundle, limitRules: change(fixture.bundle.limitRules) } });

describe('toViewModel', () => {
    it('draws the offer: three steps of exactly one piece, each with its piece, and no problems', async () => {
        const { bundle, settings } = await load();
        const model = toViewModel(bundle, settings);
        expect(model.sections.map((section) => [section.name, section.limits.min, section.limits.max, section.products.map((product) => product.handle)])).toEqual([
            ['Top', 1, 1, ['oversized-drop-tee']],
            ['Bra', 1, 1, ['form-sports-bra']],
            ['Leggings', 1, 1, ['power-leggings']],
        ]);
        expect(model.required).toEqual([]);
        expect(model.problems).toEqual([]);
    });

    it('passes on what the merchant has to fix, and keeps a sold-out included piece in view', async () => {
        const { bundle, settings } = await load(() => {
            // Leggings carried in every set rather than chosen, then sold out.
            const def = { ...CATALOG_DEFS[0]!, sections: CATALOG_DEFS[0]!.sections.slice(0, 2), required: [{ handle: 'power-leggings' }] };
            return withProduct(defineCatalog(def, snapshot as unknown as StoreProduct[]), 'power-leggings', soldOut);
        });
        const model = toViewModel(bundle, { ...settings, hideOutOfStockProducts: true });
        expect(model.required.map((entry) => [entry.product.handle, entry.quantity, entry.product.soldOut])).toEqual([['power-leggings', 1, true]]);
        expect(model.problems).toEqual([{ blocking: true, detail: expect.stringContaining('Power Leggings') }]);
    });

    it('leaves out the steps and pieces the conditions engine hides, and a step left with nothing to show', async () => {
        const { bundle, settings } = await load();
        const all = toViewModel(bundle, settings);
        const [top, bra, leggings] = all.sections as [(typeof all.sections)[number], (typeof all.sections)[number], (typeof all.sections)[number]];

        const stepHidden = toViewModel(bundle, settings, { hiddenSectionIds: [bra.id], hiddenProducts: [] });
        expect(stepHidden.sections.map((section) => section.id)).toEqual([top.id, leggings.id]);

        const emptied = toViewModel(bundle, settings, { hiddenSectionIds: [], hiddenProducts: [{ productId: leggings.products[0]!.id, sectionId: leggings.id }] });
        expect(emptied.sections.map((section) => section.id)).toEqual([top.id, bra.id]);
    });

    it('finds the piece and the variant behind any pick a step can hold', async () => {
        const { bundle, settings } = await load();
        const leggings = toViewModel(bundle, settings).sections[2]!;
        const product = leggings.products[0]!;
        const variant = product.variants.at(-1)!;
        expect(leggings.byVariantId.size).toBe(product.variants.length);
        expect(leggings.byVariantId.get(variant.id)).toEqual({ product, variant });
    });

    it('refuses, out loud, a step that takes more than one piece, whether or not the step is drawn', async () => {
        const { bundle, settings } = await load(withRules((rules) => [...rules.filter((entry) => entry.sectionId !== 51), { operation: 'lte', sectionId: 51, type: 'total-number-of-products', value: '3.00' }]));
        const problem = [{ blocking: true, detail: expect.stringMatching(/"Top" allows up to 3 picks.*exactly 1/) }];
        expect(toViewModel(bundle, settings).problems).toEqual(problem);
        expect(toViewModel(bundle, settings, { hiddenSectionIds: [51], hiddenProducts: [] }).problems).toEqual(problem);
    });

    it('accepts an optional piece (at most 1)', async () => {
        const { bundle, settings } = await load(withRules((rules) => rules.map((entry) => (entry.sectionId === 52 ? { ...entry, operation: 'lte' } : entry))));
        const model = toViewModel(bundle, settings);
        expect(model.sections[1]!.limits).toMatchObject({ min: 0, max: 1 });
        expect(model.problems).toEqual([]);
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
            withProduct(fixture, 'power-leggings', (product) => ({ ...product, descriptionHtml: '<p>High &amp; <b>tight</b></p><script>alert(1)</script>' })),
        );
        const leggings = toViewModel(bundle, settings).sections[2]!.products[0];
        expect(leggings?.description).toBe('High & tight');
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
