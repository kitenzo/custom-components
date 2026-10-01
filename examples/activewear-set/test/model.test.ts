import { describe, expect, it } from 'vitest';

import { CATALOG_DEFS } from '../dev/catalog';
import { defineCatalog, type StoreProduct } from '../dev/mock/catalog';
import snapshot from '../dev/mock/demo-store.json' with { type: 'json' };
import type { Fixture } from '../dev/mock/wire';
import { toViewModel } from '../src/model';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { load, soldOut, withProduct } from './support';

const handles = (model: ReturnType<typeof toViewModel>, index: number) => model.sections[index]!.products.map((product) => product.handle);

/** The bra's step made optional ("at most 1"), the shape where hiding a sold-out piece is allowed. */
const optionalBra = (fixture: Fixture): Fixture => ({
    ...fixture,
    bundle: {
        ...fixture.bundle,
        limitRules: fixture.bundle.limitRules.map((entry) => (entry.sectionId === 52 ? { ...entry, operation: 'lte' } : entry)),
    },
});

describe('toViewModel', () => {
    it('reads every count from the bundle: three steps of exactly one piece', async () => {
        const { bundle, settings } = await load();
        const model = toViewModel(bundle, { settings });
        expect(model.sections.map((section) => [section.name, section.limits.min, section.limits.max])).toEqual([
            ['Top', 1, 1],
            ['Bra', 1, 1],
            ['Leggings', 1, 1],
        ]);
        expect(model.problems).toEqual([]);
    });

    it('refuses, out loud, a step that takes more than one piece: this design draws one per step', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...fixture,
            bundle: {
                ...fixture.bundle,
                limitRules: [
                    ...fixture.bundle.limitRules.filter((entry) => entry.sectionId !== 51),
                    { operation: 'lte', sectionId: 51, type: 'total-number-of-products', value: '3.00' },
                ],
            },
        }));
        const problems = toViewModel(bundle, { settings }).problems;
        expect(problems.some((problem) => problem.blocking && problem.detail.includes('"Top"') && problem.detail.includes('exactly 1'))).toBe(true);
    });

    it('accepts an optional piece (at most 1)', async () => {
        const { bundle, settings } = await load(optionalBra);
        const model = toViewModel(bundle, { settings });
        expect(model.sections[1]!.limits).toMatchObject({ min: 0, max: 1 });
        expect(model.problems).toEqual([]);
    });

    it('never offers an archived product, and offers a draft only when the shop shows drafts', async () => {
        const archived = await load((fixture) => withProduct(fixture, 'form-sports-bra', (product) => ({ ...product, status: 'ARCHIVED' })));
        expect(handles(toViewModel(archived.bundle, { settings: archived.settings }), 1)).not.toContain('form-sports-bra');

        const draft = await load((fixture) => withProduct(fixture, 'form-sports-bra', (product) => ({ ...product, status: 'DRAFT' })));
        expect(handles(toViewModel(draft.bundle, { settings: { ...draft.settings, hideDraftProducts: true } }), 1)).not.toContain('form-sports-bra');
        expect(handles(toViewModel(draft.bundle, { settings: { ...draft.settings, hideDraftProducts: false } }), 1)).toContain('form-sports-bra');
    });

    it('shows a sold-out piece as sold out, or hides it when the shop says so and the step is optional', async () => {
        const { bundle, settings } = await load((fixture) => optionalBra(withProduct(fixture, 'form-sports-bra', soldOut)));
        const shown = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: false } });
        expect(shown.sections[1]!.products[0]?.soldOut).toBe(true);
        const hidden = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(handles(hidden, 1)).not.toContain('form-sports-bra');
    });

    it('keeps a sold-out piece visible when hiding it would leave a required step unfillable, and says so', async () => {
        const { bundle, settings } = await load((fixture) => withProduct(fixture, 'form-sports-bra', soldOut));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(handles(model, 1)).toEqual(['form-sports-bra']);
        expect(model.problems.some((problem) => problem.blocking && problem.detail.includes('"Bra"'))).toBe(true);
    });

    it('keeps optional steps under a bundle-wide "any 2 pieces" from rendering empty when everything is sold out and hidden', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...fixture,
            bundle: {
                ...fixture.bundle,
                limitRules: [
                    ...fixture.bundle.limitRules.map((entry) => ({ ...entry, operation: 'lte' as const })),
                    { operation: 'gte', sectionId: null, type: 'total-number-of-products', value: '2.00' },
                ],
            },
            products: fixture.products.map(soldOut),
        }));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.sections.map((section) => section.products.length)).toEqual([1, 1, 1]);
        expect(model.problems.some((problem) => problem.blocking && /none of its products/.test(problem.detail))).toBe(true);
    });

    it('holds the set off sale, visibly, when a required product is sold out', async () => {
        const { bundle, settings } = await load(() => {
            // Leggings carried in every set rather than chosen, then sold out.
            const def = { ...CATALOG_DEFS[0]!, sections: CATALOG_DEFS[0]!.sections.slice(0, 2), required: [{ handle: 'power-leggings' }] };
            return withProduct(defineCatalog(def, snapshot as unknown as StoreProduct[]), 'power-leggings', soldOut);
        });
        const model = toViewModel(withRequiredVariantIds(bundle), { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.required[0]?.soldOut).toBe(true);
        expect(model.problems.some((problem) => problem.blocking && problem.detail.includes('Power Leggings'))).toBe(true);
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
            withProduct(fixture, 'power-leggings', (product) => ({ ...product, descriptionHtml: '<p>High &amp; <b>tight</b></p><script>alert(1)</script>' })),
        );
        const leggings = toViewModel(bundle, { settings }).sections[2]!.products[0];
        expect(leggings?.description).toBe('High & tight');
    });
});
