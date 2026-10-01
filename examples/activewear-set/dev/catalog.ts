/*
 * The bundle the dev server, the e2e suite and the gallery render: a three-piece STRATA training
 * set on the Kitenzo demo store's real products.
 *
 * Every piece has the same dense option grid, Size (XS to XL) by Colour (Onyx, Bone, Moss,
 * Slate): twenty variants each, every colour with its own photograph. The shape is chosen to
 * exercise what makes an option UI hard, all at once:
 *
 *   - three steps of exactly one piece each, so the set is complete when every step has one;
 *   - a set price (`discount.price`), known before anything is picked, so the price shows from
 *     the first paint;
 *   - a surcharge on every Slate variant, so the price moves when a colour is chosen and the
 *     widget has to say why;
 *   - sold-out combinations in the grid (a colour missing in one size, a size gone in every
 *     colour), so `reachableOptionValues` has values to disable and `selectOptionValue` has
 *     choices to repair;
 *   - one combination down to its last two, for the low-stock line.
 *
 * Replace it with your own bundle's shape when you start a real build: keep the demo store's
 * products, or snapshot your merchant's catalogue the same way (`bun run snapshot`, README).
 */
import { defineCatalog, discount, rule, type CatalogDef } from './mock/catalog';
import type { StoreProduct } from './mock/catalog';
import snapshot from './mock/demo-store.json' with { type: 'json' };

/** Slate is the premium dye in this range: £5 a piece on top of the set price, in shop currency. */
const SLATE = '5.00';
const SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const slate = SIZES.map((size) => ({ title: `${size} / Slate`, surcharge: SLATE }));

export const CATALOG_DEFS: CatalogDef[] = [
    {
        id: 2005,
        name: 'The Strata Set',
        description: 'A top, a bra and leggings for one set price. Choose a colour and size for each piece, or match all three in one go.',
        sections: [
            { id: 51, name: 'Top', description: 'Oversized, dropped shoulder, cropped at the hip.', rules: [rule.eq(1)], products: ['oversized-drop-tee'] },
            { id: 52, name: 'Bra', description: 'Medium support, removable cups.', rules: [rule.eq(1)], products: ['form-sports-bra'] },
            { id: 53, name: 'Leggings', description: 'High rise, sculpting, squat-proof.', rules: [rule.eq(1)], products: ['power-leggings'] },
        ],
        // One price for the whole set, whatever is in it: what `resolveUpfrontFixedPrice` reads.
        discount: discount.price(120),
        applyVariantSurcharges: true,
        overrides: {
            'oversized-drop-tee': {
                variants: [
                    ...slate.filter((entry) => entry.title !== 'S / Slate'),
                    // Slate is gone in S only: choosing S leaves Slate disabled, saying why.
                    { title: 'S / Slate', surcharge: SLATE, soldOut: true },
                ],
            },
            'form-sports-bra': {
                variants: [
                    ...slate.filter((entry) => !['L / Slate', 'XL / Slate'].includes(entry.title)),
                    // L in Bone has sold through.
                    { title: 'L / Bone', soldOut: true },
                    // XL has sold out in every colour: the size stays visible, disabled, with the
                    // reason, because a shopper who wears XL needs to know it exists.
                    { title: 'XL / Onyx', soldOut: true },
                    { title: 'XL / Bone', soldOut: true },
                    { title: 'XL / Moss', soldOut: true },
                    { title: 'XL / Slate', surcharge: SLATE, soldOut: true },
                    { title: 'L / Slate', surcharge: SLATE },
                ],
            },
            'power-leggings': {
                variants: [
                    ...slate.filter((entry) => entry.title !== 'M / Slate'),
                    // XS in Moss is gone: "Match colours" in Moss reports the leggings instead of
                    // quietly changing the shopper's size to reach it.
                    { title: 'XS / Moss', soldOut: true },
                    // The last two of a popular combination, for the low-stock line.
                    { title: 'M / Slate', surcharge: SLATE, stock: 2 },
                ],
            },
        },
    },
];

/** Built on demand, so `bun run snapshot` can read the definitions before a snapshot exists. */
export function loadFixtures() {
    return CATALOG_DEFS.map((def) => defineCatalog(def, snapshot as unknown as StoreProduct[]));
}
