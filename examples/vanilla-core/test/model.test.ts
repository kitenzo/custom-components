import { describe, expect, it } from 'vitest';

import { caseSize, toViewModel } from '../src/model';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { load, soldOut, withProduct, withRequired } from './support';

const handles = (model: ReturnType<typeof toViewModel>, index: number) => model.sections[index]!.products.map((product) => product.handle);

describe('toViewModel', () => {
    it('reads every count from the bundle: one step of exactly 6', async () => {
        const { bundle, settings } = await load();
        const model = toViewModel(bundle, { settings });
        expect(model.sections.map((section) => [section.limits.min, section.limits.max])).toEqual([[6, 6]]);
        expect(model.problems).toEqual([]);
    });

    it('never offers an archived product, and offers a draft only when the shop shows drafts', async () => {
        const archived = await load((fixture) => withProduct(fixture, 'californian-chardonnay', (product) => ({ ...product, status: 'ARCHIVED' })));
        expect(handles(toViewModel(archived.bundle, { settings: archived.settings }), 0)).not.toContain('californian-chardonnay');

        const draft = await load((fixture) => withProduct(fixture, 'californian-chardonnay', (product) => ({ ...product, status: 'DRAFT' })));
        expect(handles(toViewModel(draft.bundle, { settings: { ...draft.settings, hideDraftProducts: true } }), 0)).not.toContain('californian-chardonnay');
        expect(handles(toViewModel(draft.bundle, { settings: { ...draft.settings, hideDraftProducts: false } }), 0)).toContain('californian-chardonnay');
    });

    it('shows sold-out products as sold out, or hides them when the shop says so', async () => {
        const { bundle, settings } = await load();
        const shown = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: false } });
        expect(shown.sections[0]!.products.find((product) => product.handle === 'californian-semillion')?.soldOut).toBe(true);
        const hidden = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(handles(hidden, 0)).not.toContain('californian-semillion');
    });

    it('keeps sold-out products visible when hiding them would leave a required step unfillable', async () => {
        const { bundle, settings } = await load((fixture) => ({ ...fixture, products: fixture.products.map(soldOut) }));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.sections[0]!.products.length).toBe(8);
        expect(model.problems.some((problem) => problem.blocking && problem.detail.includes('Choose your six'))).toBe(true);
    });

    it('keeps a bundle-wide "pick any N" step from rendering empty when everything is sold out and hidden', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, limitRules: [{ operation: 'gte', sectionId: null, type: 'total-number-of-products', value: '6.00' }] },
            products: fixture.products.map(soldOut),
        }));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.sections[0]!.products.length).toBe(8);
        expect(model.problems.some((problem) => problem.blocking && /none of its products/.test(problem.detail))).toBe(true);
    });

    it('holds the bundle off sale, visibly, when a required product is sold out', async () => {
        const { bundle, settings } = await load((fixture) => withProduct(withRequired(fixture, 'pinot-gris'), 'pinot-gris', soldOut));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.required[0]?.soldOut).toBe(true);
        expect(model.problems.some((problem) => problem.blocking && problem.detail.includes('Pinot Gris'))).toBe(true);
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
                personalisation: { [fixture.products[0]!.shopifyProductId]: [{ id: 'f1', key: 'Gift note', label: 'Gift note', type: 'text', required: true }] },
            },
        }));
        expect(toViewModel(withRequiredVariantIds(bundle), { settings }).problems.some((problem) => problem.blocking && problem.detail.includes('Gift note'))).toBe(true);
    });

    it('turns descriptions into text, so merchant markup never renders as markup', async () => {
        const { bundle, settings } = await load((fixture) =>
            withProduct(fixture, 'californian-chardonnay', (product) => ({ ...product, descriptionHtml: '<p>Oak &amp; <b>butter</b></p><script>alert(1)</script>' })),
        );
        const wine = toViewModel(bundle, { settings }).sections[0]!.products.find((product) => product.handle === 'californian-chardonnay');
        expect(wine?.description).toBe('Oak & butter');
    });
});

describe('caseSize', () => {
    const withRules = (rules: { operation: 'eq' | 'gte' | 'lte'; sectionId: number | null; value: string }[]) =>
        load((fixture) => ({ ...fixture, bundle: { ...fixture.bundle, limitRules: rules.map((entry) => ({ ...entry, type: 'total-number-of-products' as const })) } }));

    it('draws the case the step asks for: 6 slots, all 6 required', async () => {
        const { bundle, settings } = await load();
        expect(caseSize(toViewModel(bundle, { settings }))).toEqual({ slots: 6, required: 6 });
    });

    it('reads a bundle-wide count the same way, so the merchant can set the 6 on either', async () => {
        const { bundle, settings } = await withRules([{ operation: 'eq', sectionId: null, value: '6.00' }]);
        expect(caseSize(toViewModel(bundle, { settings }))).toEqual({ slots: 6, required: 6 });
    });

    it('draws the largest of several allowed sizes, and leaves which counts are valid to the engine', async () => {
        const { bundle, settings } = await withRules(['6.00', '12.00'].map((value) => ({ operation: 'eq' as const, sectionId: 71, value })));
        expect(caseSize(toViewModel(bundle, { settings }))).toEqual({ slots: 12, required: 6 });
    });

    it('counts a required bottle into the case, as the engine counts it', async () => {
        const { bundle, settings } = await load((fixture) => withRequired(fixture, 'pinot-gris'));
        // The step still asks for 6 picks; the required bottle rides in the same case.
        expect(caseSize(toViewModel(withRequiredVariantIds(bundle), { settings }))).toEqual({ slots: 7, required: 7 });
    });

    it('draws no case when nothing caps it, or when it is too big to be a picture', async () => {
        const open = await withRules([{ operation: 'gte', sectionId: 71, value: '3.00' }]);
        expect(caseSize(toViewModel(open.bundle, { settings: open.settings }))).toBeNull();
        const huge = await withRules([{ operation: 'eq', sectionId: null, value: '48.00' }]);
        expect(caseSize(toViewModel(huge.bundle, { settings: huge.settings }))).toBeNull();
        const hugeStep = await withRules([{ operation: 'eq', sectionId: 71, value: '48.00' }]);
        expect(caseSize(toViewModel(hugeStep.bundle, { settings: hugeStep.settings }))).toBeNull();
    });

    it('draws no case for rules that contradict each other: there is no size to draw', async () => {
        const { bundle, settings } = await withRules([
            { operation: 'gte', sectionId: null, value: '5.00' },
            { operation: 'lte', sectionId: null, value: '3.00' },
        ]);
        expect(caseSize(toViewModel(bundle, { settings }))).toBeNull();
    });
});
