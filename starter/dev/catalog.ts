/*
 * The bundle the dev server, the e2e suite and the gallery render: a smoothie box on the Kitenzo
 * demo store's real products.
 *
 * It is chosen to exercise every shape a generic widget has to handle at once, so a change that
 * breaks one of them shows up the first time you run `bun run dev`:
 *
 *   - two steps, one required (3 to 6 smoothies) and one optional (up to 2 vitamin shots);
 *   - a required product carried in every box and priced into it;
 *   - a product option with one value (Size: 1000ml), whose dropdown must not render;
 *   - a product option with three values, some sold out (the vitamin shots);
 *   - two products sold out in every size, straight from the store;
 *   - a flat 10% discount.
 *
 * Replace it with your own bundle's shape when you start a real build: keep the demo store's
 * products, or snapshot your merchant's catalogue the same way (`bun run snapshot`, README).
 */
import { defineCatalog, discount, rule, type CatalogDef } from './mock/catalog';
import type { StoreProduct } from './mock/catalog';
import snapshot from './mock/demo-store.json' with { type: 'json' };

export const CATALOG_DEFS: CatalogDef[] = [
    {
        id: 1001,
        name: 'Build your smoothie box',
        description: 'Pick 3 to 6 cold-pressed smoothies, add a vitamin shot if you like, and save 10%.',
        sections: [
            {
                id: 11,
                name: 'Choose your smoothies',
                description: 'Cold-pressed, 1 litre each.',
                rules: rule.range(3, 6),
                products: ['strawberries-cream', 'spinach-and-spirulina', 'pineapple-mango', 'ginger-pear', 'beetroot-berry', 'almond-oat'],
            },
            {
                id: 12,
                name: 'Add a vitamin shot',
                description: 'Optional. Up to two.',
                rules: [rule.max(2)],
                products: [
                    'almond-oat-vitamin-enhanced',
                    'pineapple-mango-vitamin-enhanced',
                    'beetroot-berry-vitamin-enhanced',
                    'spinach-spirulina-vitamin-enhanced',
                    // Sold out in every size on the demo store: they stay visible but unpickable,
                    // or disappear when the merchant hides sold-out products.
                    'strawberries-cream-vitamin-enhanced',
                    'ginger-pear-vitamin-enhanced',
                ],
            },
        ],
        // In every box, priced into it, and never the shopper's choice.
        required: [{ handle: 'almond-oat-sample', quantity: 1 }],
        discount: discount.percentage(10),
        overrides: {
            // A stock ceiling, so the stepper's cap is visible without a scenario.
            'beetroot-berry': { stock: 3 },
        },
    },
];

/** Built on demand, so `bun run snapshot` can read the definitions before a snapshot exists. */
export function loadFixtures() {
    return CATALOG_DEFS.map((def) => defineCatalog(def, snapshot as unknown as StoreProduct[]));
}
