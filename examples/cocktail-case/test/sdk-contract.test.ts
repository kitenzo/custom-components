/*
 * What this widget takes from the SDK on trust.
 *
 * None of this is the widget's code. Each case is a behaviour the widget has no fallback for, so
 * an SDK upgrade that changes one fails here, by name, rather than as a wrong count on the page.
 */
import { createBundleBuilder, getBundleLimits } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { load, withRequired } from './support';
import type { Fixture } from '../dev/mock/wire';

type Rule = Fixture['bundle']['limitRules'][number];
const withRules = (rules: (kept: Rule[]) => Rule[]) => (fixture: Fixture): Fixture => ({ ...fixture, bundle: { ...fixture.bundle, limitRules: rules(fixture.bundle.limitRules) } });

async function setUp(change?: Parameters<typeof load>[0]) {
    const { bundle } = await load(change);
    const cans = bundle.sections[0]!;
    const variant = (handle: string) => cans.products.find((product) => product.handle === handle)!.variants[0]!.id;
    return { bundle, cans, variant };
}

describe('the SDK contract this widget relies on', () => {
    it('counts a required product into the case: "6 to 24" with 1 required is 5 picks, and holds 23', async () => {
        const { bundle, cans, variant } = await setUp((fixture) => withRequired(fixture, 'yuzu-elderflower'));
        const builder = createBundleBuilder(bundle);
        expect(builder.getState().progress).toMatchObject({ quantity: 1, requiredQuantity: 1, missing: 5 });
        expect(builder.addItem(cans.id, variant('passionfruit-mojito'), 30)).toBe(23);
        expect(builder.getState().isSatisfied).toBe(true);
        expect(builder.blockedReason(cans.id, variant('pear-cardamom'))).toBe('bundle-full');
    });

    it('takes only what fits and says how many went in, for an opening selection and for every add (what "Surprise me" plans on)', async () => {
        const { bundle, cans, variant } = await setUp();
        const builder = createBundleBuilder(bundle, {
            initialSelections: {
                [cans.id]: [
                    { variantId: variant('spicy-pineapple-marg'), quantity: 6 }, // stock 4
                    { variantId: variant('watermelon-basil'), quantity: 2 }, // sold out
                    { variantId: 'gid-the-bundle-no-longer-offers', quantity: 1 },
                ],
            },
        });
        expect(builder.getState().selections).toEqual({ [cans.id]: [{ variantId: variant('spicy-pineapple-marg'), quantity: 4 }] });
        expect(builder.addItem(cans.id, variant('spicy-pineapple-marg'), 1)).toBe(0);
        expect(builder.addItem(cans.id, variant('watermelon-basil'), 1)).toBe(0);
        expect(builder.addItem(cans.id, variant('passionfruit-mojito'), 30)).toBe(20);
        expect(builder.addItem(cans.id, variant('pear-cardamom'), 1)).toBe(0);
    });

    it('aims `progress.missing` at the next count the rules accept: an exact size, a whole pack', async () => {
        const sizes = await setUp(withRules(() => [6, 12, 24].map<Rule>((value) => ({ operation: 'eq', sectionId: null, type: 'total-number-of-products', value: `${value}.00` }))));
        const exact = createBundleBuilder(sizes.bundle);
        exact.addItem(sizes.cans.id, sizes.variant('passionfruit-mojito'), 7);
        expect(exact.getState().progress.missing).toBe(5);
        expect(exact.getState().isSatisfied).toBe(false);

        const packs = await setUp(withRules((kept) => [...kept, { operation: 'eq', sectionId: null, type: 'multiples-of', value: '6.00' }]));
        expect(getBundleLimits(packs.bundle)).toMatchObject({ min: 6, max: 24, multipleOf: 6 });
        const packed = createBundleBuilder(packs.bundle);
        packed.addItem(packs.cans.id, packs.variant('passionfruit-mojito'), 10);
        expect(packed.getState().progress.missing).toBe(2);
        expect(packed.getState().isSatisfied).toBe(false);
        packed.addItem(packs.cans.id, packs.variant('passionfruit-mojito'), 2);
        expect(packed.getState().isSatisfied).toBe(true);
    });
});
