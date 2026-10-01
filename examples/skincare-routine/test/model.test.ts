import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { asRequired, load, soldOut, withProduct } from './support';

const handles = (model: ReturnType<typeof toViewModel>, index: number) => model.sections[index]!.products.map((product) => product.handle);

describe('toViewModel', () => {
    it('reads every count from the bundle: exactly one per step, and each step\'s own auto-advance setting', async () => {
        const { bundle, settings } = await load();
        const model = toViewModel(bundle, { settings });
        expect(model.sections.map((section) => [section.name, section.limits.min, section.limits.max, section.autoNext])).toEqual([
            ['Cleanse', 1, 1, true],
            ['Treat', 1, 1, true],
            ['Moisturise', 1, 1, false],
        ]);
        expect(model.problems).toEqual([]);
    });

    it('keeps each product\'s Shopify tags, which the quiz scores on', async () => {
        const { bundle, settings } = await load();
        const balm = toViewModel(bundle, { settings }).sections[2]!.products.find((product) => product.handle === 'centella-panthenol-barrier-balm');
        expect(balm?.tags).toEqual(expect.arrayContaining(['barrier-repair', 'sensitive-skin']));
    });

    it('never offers an archived product, and offers a draft only when the shop shows drafts', async () => {
        const archived = await load((fixture) => withProduct(fixture, 'pha-zinc-exfoliating-cleanser', (product) => ({ ...product, status: 'ARCHIVED' })));
        expect(handles(toViewModel(archived.bundle, { settings: archived.settings }), 0)).not.toContain('pha-zinc-exfoliating-cleanser');

        const draft = await load((fixture) => withProduct(fixture, 'pha-zinc-exfoliating-cleanser', (product) => ({ ...product, status: 'DRAFT' })));
        expect(handles(toViewModel(draft.bundle, { settings: { ...draft.settings, hideDraftProducts: true } }), 0)).not.toContain('pha-zinc-exfoliating-cleanser');
        expect(handles(toViewModel(draft.bundle, { settings: { ...draft.settings, hideDraftProducts: false } }), 0)).toContain('pha-zinc-exfoliating-cleanser');
    });

    it('shows sold-out products as sold out, or hides them when the shop says so', async () => {
        const { bundle, settings } = await load();
        const shown = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: false } });
        const retinal = shown.sections[1]!.products.find((product) => product.handle === 'retinal-squalane-overnight-serum');
        expect(retinal?.soldOut).toBe(true);
        const hidden = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(handles(hidden, 1)).not.toContain('retinal-squalane-overnight-serum');
    });

    it('a product with one size sold out is not sold out', async () => {
        const { bundle, settings } = await load();
        const oat = toViewModel(bundle, { settings }).sections[0]!.products.find((product) => product.handle === 'ceramide-oat-cream-cleanser')!;
        expect(oat.soldOut).toBe(false);
        expect(oat.variants.map((variant) => [variant.title, variant.available])).toEqual([
            ['75ml', false],
            ['150ml', true],
        ]);
    });

    it('keeps sold-out products visible when hiding them would leave a required step unfillable', async () => {
        const { bundle, settings } = await load((fixture) => ({ ...fixture, products: fixture.products.map(soldOut) }));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.sections[0]!.products.length).toBe(4);
        expect(model.problems.some((problem) => problem.blocking && problem.detail.includes('Cleanse'))).toBe(true);
    });

    it('holds the bundle off sale, visibly, when a required product is sold out', async () => {
        const { bundle, settings } = await load((fixture) => withProduct(asRequired(fixture, 'ceramide-peptide-daily-moisturiser'), 'ceramide-peptide-daily-moisturiser', soldOut));
        const model = toViewModel(bundle, { settings: { ...settings, hideOutOfStockProducts: true } });
        expect(model.required[0]?.soldOut).toBe(true);
        expect(model.problems.some((problem) => problem.blocking && problem.detail.includes('Ceramide + Peptide'))).toBe(true);
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
            withProduct(fixture, 'amino-acid-gentle-gel-cleanser', (product) => ({ ...product, descriptionHtml: '<p>Calm &amp; <b>gentle</b></p><script>alert(1)</script>' })),
        );
        const gel = toViewModel(bundle, { settings }).sections[0]!.products.find((product) => product.handle === 'amino-acid-gentle-gel-cleanser');
        expect(gel?.description).toBe('Calm & gentle');
    });
});
