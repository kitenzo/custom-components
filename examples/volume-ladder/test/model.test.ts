import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { load, soldOut, withProduct } from './support';

const handles = (model: ReturnType<typeof toViewModel>, index: number) => model.sections[index]!.products.map((product) => product.handle);

describe('toViewModel', () => {
    it('reads every count from the bundle: one open step, at least 2 across the bundle, no maximum', async () => {
        const { bundle, settings } = await load();
        const model = toViewModel(bundle, { settings });
        expect(model.sections.map((section) => [section.limits.min, section.limits.max])).toEqual([[0, Number.POSITIVE_INFINITY]]);
        expect([model.bundleLimits.min, model.bundleLimits.max]).toEqual([2, Number.POSITIVE_INFINITY]);
        expect(model.ladder.rungs.map((rung) => rung.count)).toEqual([2, 3, 4, 6]);
        expect(model.problems).toEqual([]);
    });

    it('never offers an archived product, and offers a draft only when the shop shows drafts', async () => {
        const archived = await load((fixture) => withProduct(fixture, 'vanilla-whey-protein', (product) => ({ ...product, status: 'ARCHIVED' })));
        expect(handles(toViewModel(archived.bundle, { settings: archived.settings }), 0)).not.toContain('vanilla-whey-protein');

        const draft = await load((fixture) => withProduct(fixture, 'vanilla-whey-protein', (product) => ({ ...product, status: 'DRAFT' })));
        expect(handles(toViewModel(draft.bundle, { settings: { ...draft.settings, hideDraftProducts: true } }), 0)).not.toContain('vanilla-whey-protein');
        expect(handles(toViewModel(draft.bundle, { settings: { ...draft.settings, hideDraftProducts: false } }), 0)).toContain('vanilla-whey-protein');
    });

    it('shows a sold-out flavour as sold out, or hides it when the shop says so', async () => {
        const { bundle, settings } = await load((fixture) => withProduct(fixture, 'vanilla-whey-protein', soldOut));
        const shown = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: false } });
        expect(shown.sections[0]!.products.find((product) => product.handle === 'vanilla-whey-protein')?.soldOut).toBe(true);
        const hidden = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(handles(hidden, 0)).not.toContain('vanilla-whey-protein');
    });

    it('holds the bundle off sale, visibly, when nothing is left to reach the bundle-wide minimum', async () => {
        const { bundle, settings } = await load((fixture) => ({ ...fixture, products: fixture.products.map(soldOut) }));
        // Even when the shop hides sold-out products: the step has no minimum of its own, but the
        // bundle needs 2, so an empty list would explain nothing.
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.sections[0]!.products).toHaveLength(4);
        expect(model.problems.some((problem) => problem.blocking && problem.detail.includes('at least 2'))).toBe(true);
    });

    it('holds the bundle off sale, visibly, when a required product is sold out', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...withProduct(fixture, 'unflavoured-whey-protein', soldOut),
            bundle: {
                ...fixture.bundle,
                requiredProducts: [{ quantity: 1, shopifyProductId: fixture.products.find((product) => product.handle === 'unflavoured-whey-protein')!.shopifyProductId, variantIds: [] }],
            },
        }));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.required[0]?.soldOut).toBe(true);
        expect(model.problems.some((problem) => problem.blocking && problem.detail.includes('Unflavoured'))).toBe(true);
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

    it('tells the merchant, without blocking the sale, when the discount cannot be a ladder', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, discount: { flatOrTiered: 'flat', minimum: null, operator: 'max', tiers: [], type: 'percentage', value: '10.00' } },
        }));
        const model = toViewModel(bundle, { settings });
        expect(model.ladder.rungs).toEqual([]);
        expect(model.problems).toHaveLength(1);
        expect(model.problems[0]!.blocking).toBe(false);
    });

    it('drops a tier above the bundle\'s maximum, because no shopper can reach it', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, limitRules: [...fixture.bundle.limitRules, { operation: 'lte', sectionId: null, type: 'total-number-of-products', value: '4.00' }] },
        }));
        const model = toViewModel(bundle, { settings });
        expect(model.ladder.rungs.map((rung) => rung.count)).toEqual([2, 3, 4]);
        expect(model.problems.some((problem) => !problem.blocking && problem.detail.includes('maximum of 4'))).toBe(true);
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
            withProduct(fixture, 'vanilla-whey-protein', (product) => ({ ...product, descriptionHtml: '<p>Smooth &amp; <b>creamy</b></p><script>alert(1)</script>' })),
        );
        const vanilla = toViewModel(bundle, { settings }).sections[0]!.products.find((product) => product.handle === 'vanilla-whey-protein');
        expect(vanilla?.description).toBe('Smooth & creamy');
    });
});
