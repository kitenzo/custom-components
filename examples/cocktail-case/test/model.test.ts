import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { load, soldOut, withProduct, withRequired } from './support';

const handles = (model: ReturnType<typeof toViewModel>) => model.sections[0]!.products.map((product) => product.handle);

describe('toViewModel', () => {
    it('reads every count from the bundle: no rule on the step, 6 to 24 across the case', async () => {
        const { bundle, settings } = await load();
        const model = toViewModel(bundle, { settings });
        expect(model.sections.map((section) => [section.limits.min, section.limits.max])).toEqual([[0, Number.POSITIVE_INFINITY]]);
        expect([model.bundleLimits.min, model.bundleLimits.max]).toEqual([6, 24]);
        expect(model.problems).toEqual([]);
    });

    it('keeps the tags, which the filters are built from', async () => {
        const { bundle, settings } = await load();
        const pear = toViewModel(bundle, { settings }).sections[0]!.products.find((product) => product.handle === 'pear-cardamom')!;
        expect(pear.tags).toEqual(expect.arrayContaining(['Flavor_Bold', 'Flavor_Fruity', 'Strength_Stronger', 'Fruity']));
    });

    it('never offers an archived product, and offers a draft only when the shop shows drafts', async () => {
        const archived = await load((fixture) => withProduct(fixture, 'pear-cardamom', (product) => ({ ...product, status: 'ARCHIVED' })));
        expect(handles(toViewModel(archived.bundle, { settings: archived.settings }))).not.toContain('pear-cardamom');

        const draft = await load((fixture) => withProduct(fixture, 'pear-cardamom', (product) => ({ ...product, status: 'DRAFT' })));
        expect(handles(toViewModel(draft.bundle, { settings: { ...draft.settings, hideDraftProducts: true } }))).not.toContain('pear-cardamom');
        expect(handles(toViewModel(draft.bundle, { settings: { ...draft.settings, hideDraftProducts: false } }))).toContain('pear-cardamom');
    });

    it('shows the sold-out can as sold out, or hides it when the shop says so', async () => {
        const { bundle, settings } = await load();
        const shown = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: false } });
        expect(shown.sections[0]!.products.find((product) => product.handle === 'watermelon-basil')?.soldOut).toBe(true);
        const hidden = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(handles(hidden)).not.toContain('watermelon-basil');
    });

    it('keeps sold-out products visible when hiding them would leave a step with a minimum unfillable', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, limitRules: [...fixture.bundle.limitRules, { operation: 'gte', sectionId: 31, type: 'total-number-of-products', value: '6.00' }] },
            products: fixture.products.map(soldOut),
        }));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.sections[0]!.products.length).toBe(10);
        expect(model.problems.some((problem) => problem.blocking && problem.detail.includes('Pick your cans'))).toBe(true);
    });

    it('keeps the bundle-wide "any 6" step from rendering empty when everything is sold out and hidden', async () => {
        const { bundle, settings } = await load((fixture) => ({ ...fixture, products: fixture.products.map(soldOut) }));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.sections[0]!.products.length).toBe(10);
        expect(model.problems.some((problem) => problem.blocking && /none of its products/.test(problem.detail))).toBe(true);
    });

    it('holds the bundle off sale, visibly, when a required product is sold out', async () => {
        const { bundle, settings } = await load((fixture) => withProduct(withRequired(fixture, 'yuzu-elderflower'), 'yuzu-elderflower', soldOut));
        const model = toViewModel(withRequiredVariantIds(bundle), { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.required[0]?.soldOut).toBe(true);
        expect(model.problems.some((problem) => problem.blocking && problem.detail.includes('Yuzu & Elderflower Spritz'))).toBe(true);
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

    it('tells the merchant (without blocking) about tiers the ladder cannot draw', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...fixture,
            bundle: {
                ...fixture.bundle,
                discount: {
                    ...fixture.bundle.discount!,
                    tiers: [...fixture.bundle.discount!.tiers, { customText: null, discount: '20.00', operation: 'gte', type: 'total_price', value: '150.00' }],
                },
            },
        }));
        const problems = toViewModel(bundle, { settings }).problems;
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatchObject({ blocking: false });
        expect(problems[0]!.detail).toMatch(/1 of this bundle's 4 discount tiers/);
    });

    it('refuses a bundle with required personalisation it cannot collect', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...fixture,
            bundle: {
                ...fixture.bundle,
                personalisation: { [fixture.products[0]!.shopifyProductId]: [{ id: 'f1', key: 'Gift note', label: 'Gift note', type: 'text', required: true }] },
            },
        }));
        expect(toViewModel(bundle, { settings }).problems.some((problem) => problem.blocking && problem.detail.includes('Gift note'))).toBe(true);
    });

    it('turns descriptions into text, so merchant markup never renders as markup', async () => {
        const { bundle, settings } = await load((fixture) =>
            withProduct(fixture, 'pear-cardamom', (product) => ({ ...product, descriptionHtml: '<p>Tart &amp; <b>bright</b></p><script>alert(1)</script>' })),
        );
        const pear = toViewModel(bundle, { settings }).sections[0]!.products.find((product) => product.handle === 'pear-cardamom');
        expect(pear?.description).toBe('Tart & bright');
    });
});
