import { describe, expect, it } from 'vitest';

import { casePrice, createMoney } from '../src/money';
import { load } from './support';

const JPY = { market: { countryCode: 'JP', currency: 'JPY', rate: 190, decimals: 0 } };

describe('casePrice', () => {
    it('has no price for an empty case: a fixed discount depends on what is in it', async () => {
        const { bundle, settings } = await load();
        expect(casePrice(bundle, {}, settings)).toBeNull();
    });

    it('is the engine\'s price: the bottles, less £10 off the case', async () => {
        const { bundle, settings } = await load();
        const section = bundle.sections[0]!;
        const riesling = section.products.find((product) => product.handle === 'californian-reisling')!.variants[0]!; // 12.99
        const gris = section.products.find((product) => product.handle === 'pinot-gris')!.variants[0]!; // 11.50
        const price = casePrice(bundle, { [section.id]: [{ variantId: riesling.id, quantity: 4 }, { variantId: gris.id, quantity: 2 }] }, settings);
        // 4 × 12.99 + 2 × 11.50 = 74.96, less 10.
        expect(price).toEqual({ total: 64.96, original: 74.96 });
    });

    it('knows a set price before the first pick, because a set price does not depend on the picks', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, discount: { flatOrTiered: 'flat', minimum: null, operator: 'max', tiers: [], type: 'price', value: '60.00' } },
        }));
        expect(casePrice(bundle, {}, settings)).toEqual({ total: 60, original: null });
    });

    it('prices a shopper in another market in their currency', async () => {
        const { bundle, settings } = await load(undefined, JPY, 'JP');
        const section = bundle.sections[0]!;
        const wine = section.products.find((product) => product.handle === 'pinot-gris')!.variants[0]!;
        const price = casePrice(bundle, { [section.id]: [{ variantId: wine.id, quantity: 6 }] }, settings)!;
        // 6 × 11.50 × 190 before the discount: never the shop's £69.
        expect(price.original).toBe(6 * Number(wine.presentmentPrice));
        expect(createMoney(bundle, settings).format(price.total)).toMatch(/^¥[\d,]+$/);
    });
});

describe('createMoney', () => {
    it('formats in the shop\'s own money format when there is no market', async () => {
        const { bundle, settings } = await load();
        const money = createMoney(bundle, settings);
        expect(money.format(55.94)).toBe('£55.94');
        expect(money.unitPrice(bundle.sections[0]!.products[0]!.variants[0]!)).toBe(10.99);
    });
});
