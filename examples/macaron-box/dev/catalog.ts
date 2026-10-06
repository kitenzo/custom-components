/*
 * The bundles the dev server, the e2e suite and the gallery render: a box of macarons on the
 * Kitenzo demo store's real products (ten flavours, six photographs each, £1.20 apiece).
 *
 * The first bundle is the one this example exists for. Its one step carries three `eq` rules,
 * 6, 12 and 24, which the engine reads as alternatives: a box of 6, a box of 12 or a box of 24,
 * and nothing in between. `getSectionLimits` reports them as `allowedCounts` beside the 6 to 24
 * window; the widget draws its box sizes from that, and leaves "is this a valid box" to
 * `isSatisfied`.
 *
 * The other three are there to keep the box-size derivation honest (load them with `?bundle=`):
 *
 *   - 2002, a petite box of 4 or 8 at its own set prices: the size chooser must draw two
 *     cards, not three;
 *   - 2003, "any 6 to 12": no `eq` alternatives at all, so there is no size to choose. The widget
 *     leaves the size chooser out and sizes the tray to the step's maximum;
 *   - 2004, the first box again with a surcharge on pistachio, which the SDK adds on top of the
 *     set price: what a box costs depends on what goes in it, so each size reads "From" and
 *     pistachio says what it adds.
 */
import { defineCatalog, discount, rule, type CatalogDef } from './mock/catalog';
import type { StoreProduct } from './mock/catalog';
import snapshot from './mock/demo-store.json' with { type: 'json' };

const FLAVOURS = [
    'vanilla-macaron',
    'chocolate-macaron',
    'pistachio-macaron',
    // Titled "Mocha" on the store, whatever the handle says.
    'strawberry-chocolate-macaron',
    'lemon-macaron',
    'rose-macaron',
    'english-toffee',
    'lavender-macaron',
    // Titled "Orange" on the store.
    'mango-orange-macaron',
    'raspberry-macaron',
];

/**
 * The shelf, which every bundle on the store shares. Stock belongs to the product, not to a
 * bundle, and the mock backend checks the cart against one variant table for every bundle, so the
 * same overrides go on every bundle.
 */
const STOCK: CatalogDef['overrides'] = {
    // Four left: a box of 12 shows the stepper stopping at the shelf, and "Fill the rest" has to
    // route around it.
    'rose-macaron': { stock: 4 },
    // Sold out today: shown, greyed, never picked by hand or by "Fill the rest".
    'lavender-macaron': { soldOut: true },
};

export const CATALOG_DEFS: CatalogDef[] = [
    {
        id: 2001,
        name: 'Build your macaron box',
        description: 'Choose a box of 6, 12 or 24, then fill it flavour by flavour. The bigger the box, the less each macaron costs.',
        sections: [
            {
                id: 21,
                name: 'Choose your macarons',
                description: 'Baked this morning. Almond shells, ganache and buttercream fillings.',
                // Three sizes, not a range: 7 or 13 macarons is not a box anyone packs.
                rules: [rule.eq(6), rule.eq(12), rule.eq(24)],
                products: FLAVOURS,
            },
        ],
        // A set price per box size. Each tier is "at least N products", so a box of 24 matches
        // all three tiers at once and the operator decides which price wins. 'max' takes the
        // largest tier value, which for a set-price discount is the most expensive tier: £22.00
        // for 24, the right price, because a bigger box always costs more in total. 'cumulative'
        // would add the three together and charge £40.50 for a box of 24.
        // test/sdk-contract.test.ts proves both against the SDK's own price engine.
        discount: discount.tiers(
            'price',
            [
                { atLeast: 6, discount: 6.5 },
                { atLeast: 12, discount: 12 },
                { atLeast: 24, discount: 22 },
            ],
            'max',
        ),
        overrides: STOCK,
    },
    {
        id: 2002,
        name: 'Petite macaron box',
        description: 'A box of 4 or 8.',
        sections: [{ id: 22, name: 'Choose your macarons', rules: [rule.eq(4), rule.eq(8)], products: FLAVOURS }],
        // Its own tiers, so the cards price from this bundle's discount and not from 2001's.
        // (Not `discount.none()`: that serialises as `null`, which test/wire-shape.test.ts
        // rejects because the real API never sends it.)
        discount: discount.tiers(
            'price',
            [
                { atLeast: 4, discount: 4.5 },
                { atLeast: 8, discount: 8.5 },
            ],
            'max',
        ),
        overrides: STOCK,
    },
    {
        id: 2003,
        name: 'Macarons, loose',
        description: 'Any 6 to 12, packed in a bag.',
        sections: [{ id: 23, name: 'Choose your macarons', rules: rule.range(6, 12), products: FLAVOURS }],
        discount: discount.percentage(10),
        overrides: STOCK,
    },
    {
        id: 2004,
        name: 'Macaron box, pistachio extra',
        description: 'A box of 6, 12 or 24. Pistachio costs a little more.',
        sections: [{ id: 24, name: 'Choose your macarons', rules: [rule.eq(6), rule.eq(12), rule.eq(24)], products: FLAVOURS }],
        discount: discount.tiers(
            'price',
            [
                { atLeast: 6, discount: 6.5 },
                { atLeast: 12, discount: 12 },
                { atLeast: 24, discount: 22 },
            ],
            'max',
        ),
        applyVariantSurcharges: true,
        // Only a bundle that applies surcharges reads this one, so the other three price as before.
        overrides: { ...STOCK, 'pistachio-macaron': { variants: [{ title: 'Default Title', surcharge: '0.50' }] } },
    },
];

/** Built on demand, so `bun run snapshot` can read the definitions before a snapshot exists. */
export function loadFixtures() {
    return CATALOG_DEFS.map((def) => defineCatalog(def, snapshot as unknown as StoreProduct[]));
}
