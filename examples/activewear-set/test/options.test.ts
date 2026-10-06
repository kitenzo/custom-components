import { createMoneyFormatter, type BundleProduct } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import {
    choose,
    imageFor,
    initialValues,
    optionStates,
    parseSwatchColours,
    planColourMatch,
    resolve,
    surchargeCause,
    swatchFor,
    valueSurcharge,
} from '../src/options';
import { load } from './support';

const SWATCHES = ['colour', 'color'];

async function pieces() {
    const { bundle } = await load();
    const [tee, bra, leggings] = bundle.sections.map((section) => section.products[0]!) as [BundleProduct, BundleProduct, BundleProduct];
    return { bundle, tee, bra, leggings };
}

const colourOf = (product: BundleProduct) => product.options!.find((option) => option.name === 'Colour')!;
const state = (states: ReturnType<typeof optionStates>, name: string, value: string) => states.find((entry) => entry.option.name === name)!.values.find((entry) => entry.value === value)!;

describe('swatch colours', () => {
    it('reads "Value: colour" lines, and refuses anything that is not a colour', () => {
        const colours = parseSwatchColours('Onyx: #1d1d1f\n  moss :  rgb(91, 100, 71) \nno colon here\nBone: url(x)\nSlate: red; background: blue\nNavy: navy');
        expect([...colours]).toEqual([
            ['onyx', '#1d1d1f'],
            ['moss', 'rgb(91, 100, 71)'],
            ['navy', 'navy'],
        ]);
    });

    it('paints a swatch from the merchant first, then Shopify, then the value itself, then a photograph', async () => {
        const { tee } = await pieces();
        const colour = colourOf(tee);
        const mapped = new Map([['moss', '#5b6447']]);
        expect(swatchFor(tee, colour, 'Moss', mapped).color).toBe('#5b6447');

        const native = { ...colour, swatches: { Moss: { color: '#00ff00' }, Bone: { imageUrl: 'https://cdn.shopify.com/bone.png' } } };
        expect(swatchFor(tee, native, 'Moss', new Map()).color).toBe('#00ff00');
        expect(swatchFor(tee, native, 'Bone', new Map()).image).toBe('https://cdn.shopify.com/bone.png');

        expect(swatchFor(tee, colour, 'Slate', new Map(), (value) => value === 'Slate').color).toBe('slate');
        // Nothing names Moss a colour: the swatch is the Moss photograph.
        const moss = tee.variants.find((variant) => variant.optionValues?.[1] === 'Moss')!.image;
        expect(swatchFor(tee, colour, 'Moss', new Map(), () => false)).toEqual({ color: null, image: moss });
    });
});

describe('the option grid', () => {
    it('opens on a real colour and no size: a size chosen for the shopper is a return waiting to happen', async () => {
        const { leggings } = await pieces();
        expect(initialValues(leggings, SWATCHES)).toEqual({ Colour: 'Onyx' });
        expect(resolve(leggings, { Colour: 'Onyx' }).variant).toBeNull();
        const restored = leggings.variants.find((variant) => variant.title === 'M / Slate')!;
        expect(initialValues(leggings, SWATCHES, restored)).toEqual({ Size: 'M', Colour: 'Slate' });
    });

    it('disables what cannot be had, with the reason: a size gone in every colour, a colour gone in one size', async () => {
        const { bra, leggings } = await pieces();
        expect(state(optionStates(bra, { Colour: 'Onyx' }, SWATCHES), 'Size', 'XL')).toEqual({ value: 'XL', reachable: false, why: { kind: 'sold-out' } });
        expect(state(optionStates(leggings, { Size: 'XS', Colour: 'Onyx' }, SWATCHES), 'Colour', 'Moss')).toEqual({
            value: 'Moss',
            reachable: false,
            why: { kind: 'sold-out-with', choice: 'XS' },
        });
        // Before a size is chosen, every colour is in reach somewhere.
        expect(optionStates(leggings, { Colour: 'Onyx' }, SWATCHES).find((entry) => entry.swatch)!.values.every((entry) => entry.reachable)).toBe(true);
    });

    it('never moves the size when the colour changes: Size comes first, so it is the more significant choice', async () => {
        const { leggings } = await pieces();
        let values: Record<string, string> = { Size: 'M', Colour: 'Onyx' };
        for (const colour of ['Bone', 'Moss', 'Slate', 'Onyx']) {
            const result = choose(leggings, values, 'Colour', colour);
            expect(result.values).toEqual({ Size: 'M', Colour: colour });
            expect(result.repairs).toEqual([]);
            values = result.values;
        }
    });

    it('repairs the colour when a size change leaves it out of reach, and reports the repair', async () => {
        const { leggings } = await pieces();
        const result = choose(leggings, { Size: 'M', Colour: 'Moss' }, 'Size', 'XS');
        expect(result.values).toEqual({ Size: 'XS', Colour: 'Onyx' });
        expect(result.repairs).toEqual([{ option: 'Colour', previous: 'Moss', value: 'Onyx' }]);
    });

    it('shows the chosen colour\'s own photograph, before a size is chosen too', async () => {
        const { tee } = await pieces();
        const moss = tee.variants.find((variant) => variant.title === 'XS / Moss')!.image;
        const onyx = tee.variants.find((variant) => variant.title === 'XS / Onyx')!.image;
        expect(imageFor(tee, { Colour: 'Moss' }, 'fallback')).toBe(moss);
        expect(imageFor(tee, { Size: 'L', Colour: 'Onyx' }, 'fallback')).toBe(onyx);
        const bare = { ...tee, variants: tee.variants.map(({ image: _image, ...variant }) => variant) };
        expect(imageFor(bare, { Colour: 'Moss' }, 'fallback')).toBe('fallback');
    });
});

describe('surcharges', () => {
    it('names the value the SDK\'s surcharge belongs to, and only when the bundle applies surcharges', async () => {
        const { bundle, leggings } = await pieces();
        const money = createMoneyFormatter(bundle, null);
        const slate = leggings.variants.find((variant) => variant.title === 'M / Slate')!;
        const moss = leggings.variants.find((variant) => variant.title === 'M / Moss')!;
        expect(surchargeCause(leggings, slate, money.surcharge)).toBe('Slate');
        // No single value explains "no surcharge": the size and the colour both carry none.
        expect(money.surcharge(moss)).toBe(0);
        const colour = colourOf(leggings);
        expect(valueSurcharge(leggings, colour, 'Slate', money.surcharge)).toBe(5);
        expect(valueSurcharge(leggings, colour, 'Moss', money.surcharge)).toBe(0);

        const plain = createMoneyFormatter({ ...bundle, applyVariantSurcharges: false }, null);
        expect(valueSurcharge(leggings, colour, 'Slate', plain.surcharge)).toBe(0);
    });
});

describe('planColourMatch', () => {
    it('matches every piece that can have the colour, and reports the rest with the reason, never moving a size', async () => {
        const { tee, bra, leggings } = await pieces();
        const plan = planColourMatch(
            [
                { key: 'top', product: tee, values: { Size: 'M', Colour: 'Onyx' } },
                { key: 'bra', product: bra, values: { Colour: 'Slate' } },
                { key: 'leggings', product: leggings, values: { Size: 'XS', Colour: 'Onyx' } },
            ],
            SWATCHES,
            'Moss',
        );
        expect(plan.apply).toEqual([
            { key: 'top', values: { Size: 'M', Colour: 'Moss' } },
            { key: 'bra', values: { Colour: 'Moss' } },
        ]);
        expect(plan.blocked).toEqual([{ key: 'leggings', why: { kind: 'sold-out-with', choice: 'XS' } }]);
    });

    it('reports a piece that is not made in the colour at all', async () => {
        const { tee } = await pieces();
        const plan = planColourMatch([{ key: 'top', product: tee, values: { Colour: 'Onyx' } }], SWATCHES, 'Coral');
        expect(plan.blocked).toEqual([{ key: 'top', why: { kind: 'not-made' } }]);
    });
});
