import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { load, soldOut, withProduct } from './support';

const handles = (model: ReturnType<typeof toViewModel>, index: number) => model.sections[index]!.products.map((product) => product.handle);

describe('toViewModel', () => {
    it('reads every count from the bundle: 3 to 6, then an optional step of up to 2', async () => {
        const { bundle, settings } = await load();
        const model = toViewModel(bundle, { settings });
        expect(model.sections.map((section) => [section.limits.min, section.limits.max])).toEqual([
            [3, 6],
            [0, 2],
        ]);
        expect(model.problems).toEqual([]);
    });

    it('never offers an archived product, and offers a draft only when the shop shows drafts', async () => {
        const archived = await load((fixture) => withProduct(fixture, 'ginger-pear', (product) => ({ ...product, status: 'ARCHIVED' })));
        expect(handles(toViewModel(archived.bundle, { settings: archived.settings }), 0)).not.toContain('ginger-pear');

        const draft = await load((fixture) => withProduct(fixture, 'ginger-pear', (product) => ({ ...product, status: 'DRAFT' })));
        expect(handles(toViewModel(draft.bundle, { settings: { ...draft.settings, hideDraftProducts: true } }), 0)).not.toContain('ginger-pear');
        expect(handles(toViewModel(draft.bundle, { settings: { ...draft.settings, hideDraftProducts: false } }), 0)).toContain('ginger-pear');
    });

    it('shows sold-out products as sold out, or hides them when the shop says so', async () => {
        const { bundle, settings } = await load();
        const shown = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: false } });
        const ginger = shown.sections[1]!.products.find((product) => product.handle === 'ginger-pear-vitamin-enhanced');
        expect(ginger?.soldOut).toBe(true);
        const hidden = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(handles(hidden, 1)).not.toContain('ginger-pear-vitamin-enhanced');
    });

    it('keeps sold-out products visible when hiding them would leave a required step unfillable', async () => {
        const { bundle, settings } = await load((fixture) => ({ ...fixture, products: fixture.products.map((product) => (product.handle.endsWith('-sample') ? product : soldOut(product))) }));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.sections[0]!.products.length).toBe(6);
        expect(model.problems.some((problem) => problem.blocking && problem.detail.includes('Choose your smoothies'))).toBe(true);
    });

    it('keeps a bundle-wide "pick any N" step from rendering empty when everything is sold out and hidden', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...fixture,
            bundle: {
                ...fixture.bundle,
                sections: fixture.bundle.sections.slice(0, 1),
                limitRules: [{ operation: 'gte', sectionId: null, type: 'total-number-of-products', value: '2.00' }],
            },
            products: fixture.products.map((product) => (product.handle.endsWith('-sample') ? product : soldOut(product))),
        }));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.sections[0]!.products.length).toBe(6);
        expect(model.problems.some((problem) => problem.blocking && /none of its products/.test(problem.detail))).toBe(true);
    });

    it('holds the bundle off sale, visibly, when a required product is sold out', async () => {
        const { bundle, settings } = await load((fixture) => withProduct(fixture, 'almond-oat-sample', soldOut));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.required[0]?.soldOut).toBe(true);
        expect(model.problems.some((problem) => problem.blocking && problem.detail.includes('Almond & Oats Sample'))).toBe(true);
    });

    it('reports contradictory rules instead of rendering a bundle nobody can buy', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...fixture,
            bundle: {
                ...fixture.bundle,
                limitRules: [
                    { operation: 'gte', sectionId: null, type: 'total-number-of-products', value: '5.00' },
                    { operation: 'lte', sectionId: null, type: 'total-number-of-products', value: '3.00' },
                ],
            },
        }));
        expect(toViewModel(bundle, { settings }).problems.some((problem) => problem.blocking && /contradict/.test(problem.detail))).toBe(true);
    });

    it('refuses a bundle with required personalisation it cannot collect', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...fixture,
            bundle: {
                ...fixture.bundle,
                personalisation: { [fixture.products[0]!.shopifyProductId]: [{ id: 'f1', key: 'Engraving', label: 'Engraving', type: 'text', required: true }] },
            },
        }));
        expect(toViewModel(withRequiredVariantIds(bundle), { settings }).problems.some((problem) => problem.blocking && problem.detail.includes('Engraving'))).toBe(true);
    });

    it('turns descriptions into text, so merchant markup never renders as markup', async () => {
        const { bundle, settings } = await load((fixture) =>
            withProduct(fixture, 'ginger-pear', (product) => ({ ...product, descriptionHtml: '<p>Tart &amp; <b>bright</b></p><script>alert(1)</script>' })),
        );
        const ginger = toViewModel(bundle, { settings }).sections[0]!.products.find((product) => product.handle === 'ginger-pear');
        expect(ginger?.description).toBe('Tart & bright');
    });
});
