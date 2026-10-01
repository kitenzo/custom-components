import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { withRequiredVariantIds } from '../src/sdkFixes';
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

describe('toViewModel', () => {
    it('reads every count from the bundle: exactly one box, 2 to 5 to fill it, an optional card', async () => {
        const { bundle, settings } = await load();
        const model = toViewModel(bundle, { settings });
        expect(model.sections.map((section) => [section.limits.min, section.limits.max])).toEqual([
            [1, 1],
            [2, 5],
            [0, 1],
        ]);
        expect(model.problems).toEqual([]);
    });

    it('never offers an archived product, and offers a draft only when the shop shows drafts', async () => {
        const archived = await load((fixture) => withProduct(fixture, 'loose-leaf-tea-tin', (product) => ({ ...product, status: 'ARCHIVED' })));
        expect(handles(toViewModel(archived.bundle, { settings: archived.settings }), 1)).not.toContain('loose-leaf-tea-tin');

        const draft = await load((fixture) => withProduct(fixture, 'loose-leaf-tea-tin', (product) => ({ ...product, status: 'DRAFT' })));
        expect(handles(toViewModel(draft.bundle, { settings: { ...draft.settings, hideDraftProducts: true } }), 1)).not.toContain('loose-leaf-tea-tin');
        expect(handles(toViewModel(draft.bundle, { settings: { ...draft.settings, hideDraftProducts: false } }), 1)).toContain('loose-leaf-tea-tin');
    });

    it('shows sold-out products as sold out, or hides them when the shop says so', async () => {
        const { bundle, settings } = await load();
        const shown = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: false } });
        expect(shown.sections[2]!.products.find((product) => product.handle === 'get-well-soon-letterpress-card')?.soldOut).toBe(true);
        const hidden = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(handles(hidden, 2)).not.toContain('get-well-soon-letterpress-card');
    });

    it('keeps sold-out products visible when hiding them would leave a required step unfillable', async () => {
        const fill = ['hand-poured-soy-candle', 'loose-leaf-tea-tin', 'small-batch-chocolate-bar', 'merino-lounge-socks', 'botanical-bath-soak', 'engravable-brass-matchbox'];
        const { bundle, settings } = await load((fixture) => ({ ...fixture, products: fixture.products.map((product) => (fill.includes(product.handle) ? soldOut(product) : product)) }));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.sections[1]!.products.length).toBe(6);
        expect(model.problems.some((problem) => problem.blocking && problem.detail.includes('Fill it'))).toBe(true);
    });

    it('keeps a bundle-wide "pick any N" step from rendering empty when everything is sold out and hidden', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...fixture,
            bundle: {
                ...fixture.bundle,
                sections: fixture.bundle.sections.slice(1, 2),
                limitRules: [{ operation: 'gte', sectionId: null, type: 'total-number-of-products', value: '2.00' }],
            },
            products: fixture.products.map(soldOut),
        }));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.sections[0]!.products.length).toBe(6);
        expect(model.problems.some((problem) => problem.blocking && /none of its products/.test(problem.detail))).toBe(true);
    });

    it('holds the bundle off sale, visibly, when a required product is sold out', async () => {
        const { bundle, settings } = await load((fixture) => withProduct(bathSoakRequired(fixture), 'botanical-bath-soak', soldOut));
        const model = toViewModel(withRequiredVariantIds(bundle), { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.required[0]?.soldOut).toBe(true);
        expect(model.problems.some((problem) => problem.blocking && problem.detail.includes('Botanical Bath Soak'))).toBe(true);
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

    it('reads each product\'s personalisation fields from the bundle, and only those', async () => {
        const { bundle, settings } = await load();
        const model = toViewModel(bundle, { settings });
        const find = (handle: string) => model.sections.flatMap((section) => section.products).find((product) => product.handle === handle)!;
        expect(find('engravable-brass-matchbox').fields.map((field) => [field.key, field.label, field.required, field.characterLimit])).toEqual([['Engraving', 'Lid engraving', true, 12]]);
        expect(find('new-home-letterpress-card').fields.map((field) => [field.key, field.required, field.characterLimit])).toEqual([['Card message', false, 200]]);
        expect(find('hand-poured-soy-candle').fields).toEqual([]);
    });

    it('holds the bundle off sale for required personalisation it cannot collect, and leaves out optional ones', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...fixture,
            bundle: {
                ...fixture.bundle,
                personalisation: {
                    ...fixture.bundle.personalisation,
                    [idOf(fixture, 'hand-poured-soy-candle')]: [
                        { id: 'photo', key: 'Photo', label: 'Label photo', type: 'image', required: true },
                        { id: 'gold', key: 'Gold leaf', label: 'Gold leaf lettering', type: 'text', required: false, feeOptionId: 7 },
                        { id: 'name', key: 'Name', label: 'Name on the label', type: 'text', required: false, characterLimit: 15 },
                    ],
                },
            },
        }));
        const model = toViewModel(bundle, { settings });
        const blocking = model.problems.filter((problem) => problem.blocking);
        expect(blocking.map((problem) => problem.detail)).toEqual([expect.stringContaining('"Label photo"')]);
        expect(model.problems.some((problem) => !problem.blocking && problem.detail.includes('"Gold leaf lettering"'))).toBe(true);
        const candle = model.sections[1]!.products.find((product) => product.handle === 'hand-poured-soy-candle')!;
        expect(candle.fields.map((field) => field.key)).toEqual(['Name']);
    });

    it('turns descriptions into text, so merchant markup never renders as markup', async () => {
        const { bundle, settings } = await load((fixture) =>
            withProduct(fixture, 'loose-leaf-tea-tin', (product) => ({ ...product, descriptionHtml: '<p>Tart &amp; <b>bright</b></p><script>alert(1)</script>' })),
        );
        const tea = toViewModel(bundle, { settings }).sections[1]!.products.find((product) => product.handle === 'loose-leaf-tea-tin');
        expect(tea?.description).toBe('Tart & bright');
    });
});
