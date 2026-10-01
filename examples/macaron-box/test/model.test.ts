import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { load, soldOut, withProduct, withRequired } from './support';

const handles = (model: ReturnType<typeof toViewModel>, index: number) => model.sections[index]!.products.map((product) => product.handle);

describe('toViewModel', () => {
    it('reads the count window from the bundle: 6 to 24, the span of the 6, 12 and 24 alternatives', async () => {
        const { bundle, settings } = await load();
        const model = toViewModel(bundle, { settings });
        // The window is all PickLimits can say. Which counts inside it are valid is box.ts's and
        // isSatisfied's business, not the model's.
        expect(model.sections.map((section) => [section.limits.min, section.limits.max])).toEqual([[6, 24]]);
        expect(model.sections[0]!.products).toHaveLength(10);
        expect(model.problems).toEqual([]);
    });

    it('never offers an archived product, and offers a draft only when the shop shows drafts', async () => {
        const archived = await load((fixture) => withProduct(fixture, 'chocolate-macaron', (product) => ({ ...product, status: 'ARCHIVED' })));
        expect(handles(toViewModel(archived.bundle, { settings: archived.settings }), 0)).not.toContain('chocolate-macaron');

        const draft = await load((fixture) => withProduct(fixture, 'chocolate-macaron', (product) => ({ ...product, status: 'DRAFT' })));
        expect(handles(toViewModel(draft.bundle, { settings: { ...draft.settings, hideDraftProducts: true } }), 0)).not.toContain('chocolate-macaron');
        expect(handles(toViewModel(draft.bundle, { settings: { ...draft.settings, hideDraftProducts: false } }), 0)).toContain('chocolate-macaron');
    });

    it('shows sold-out products as sold out, or hides them when the shop says so', async () => {
        const { bundle, settings } = await load();
        const shown = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: false } });
        expect(shown.sections[0]!.products.find((product) => product.handle === 'lavender-macaron')?.soldOut).toBe(true);
        const hidden = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(handles(hidden, 0)).not.toContain('lavender-macaron');
    });

    it('keeps sold-out products visible when hiding them would leave the box unfillable', async () => {
        const { bundle, settings } = await load((fixture) => ({ ...fixture, products: fixture.products.map(soldOut) }));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.sections[0]!.products.length).toBe(10);
        expect(model.problems.some((problem) => problem.blocking && problem.detail.includes('Choose your macarons'))).toBe(true);
    });

    it('keeps a bundle-wide "pick any N" step from rendering empty when everything is sold out and hidden', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, limitRules: [{ operation: 'gte', sectionId: null, type: 'total-number-of-products', value: '2.00' }] },
            products: fixture.products.map(soldOut),
        }));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        // The step itself has no minimum; the bundle-wide one is what keeps it from going blank.
        expect(model.sections[0]!.limits.min).toBe(0);
        expect(model.sections[0]!.products.length).toBe(10);
        expect(model.problems.some((problem) => problem.blocking && /none of its products/.test(problem.detail))).toBe(true);
    });

    it('holds the bundle off sale, visibly, when a required product is sold out', async () => {
        const { bundle, settings } = await load((fixture) => withProduct(withRequired(fixture, 'english-toffee'), 'english-toffee', soldOut));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.required[0]?.soldOut).toBe(true);
        expect(model.problems.some((problem) => problem.blocking && problem.detail.includes('English Toffee'))).toBe(true);
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
            withProduct(fixture, 'pistachio-macaron', (product) => ({ ...product, descriptionHtml: '<p>Nutty &amp; <b>green</b></p><script>alert(1)</script>' })),
        );
        const pistachio = toViewModel(bundle, { settings }).sections[0]!.products.find((product) => product.handle === 'pistachio-macaron');
        expect(pistachio?.description).toBe('Nutty & green');
    });
});
