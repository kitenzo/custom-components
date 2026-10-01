/*
 * The bundle the dev server, the e2e suite and the gallery render: a "buy more, save more" whey
 * protein bundle on the Kitenzo demo store's real products.
 *
 * It is the shape a volume ladder exists for, and it is chosen so every part of the ladder is
 * driven by the bundle rather than by the widget:
 *
 *   - one step of four flavours, any mix, with no per-step rule: the count that matters is the
 *     bundle's own;
 *   - a bundle-wide minimum of 2 and no maximum, so the shopper can keep climbing;
 *   - a tiered percentage discount on the number of products (2+ 10%, 3+ 15%, 4+ 20%, 6+ 25%):
 *     the ladder's rows are read from these tiers, never written in the widget;
 *   - a gap in the tiers (no 5): adding a fifth pouch moves nothing, and the progress line has to
 *     say "add 2 more", not "add 1 more";
 *   - one flavour with only 3 left, so a stepper visibly stops below the top tier.
 *
 * Every flavour costs the same on the demo store (£9.99), so the ladder's "each" price is exact.
 */
import { defineCatalog, discount, rule, type CatalogDef } from './mock/catalog';
import type { StoreProduct } from './mock/catalog';
import snapshot from './mock/demo-store.json' with { type: 'json' };

export const CATALOG_DEFS: CatalogDef[] = [
    {
        id: 2006,
        name: 'Whey Protein Bundle',
        description: 'Mix any flavours. The more pouches you add, the more you save.',
        sections: [
            {
                id: 61,
                name: 'Choose your flavours',
                // No rule on the step: the bundle-wide rule below is the only count.
                products: ['chocolate-whey-protein', 'vanilla-whey-protein', 'peanut-butter-whey-protein', 'unflavoured-whey-protein'],
            },
        ],
        // "Pick any 2 or more across the bundle", with no ceiling.
        rules: [rule.min(2)],
        discount: discount.tiers('percentage', [
            { atLeast: 2, discount: 10 },
            { atLeast: 3, discount: 15 },
            { atLeast: 4, discount: 20 },
            { atLeast: 6, discount: 25 },
        ]),
        overrides: {
            // A stock ceiling below the top tier: the stepper stops at 3 and says why, and the
            // shopper reaches 6 by mixing flavours instead.
            'peanut-butter-whey-protein': { stock: 3 },
        },
    },
];

/** Built on demand, so `bun run snapshot` can read the definitions before a snapshot exists. */
export function loadFixtures() {
    return CATALOG_DEFS.map((def) => defineCatalog(def, snapshot as unknown as StoreProduct[]));
}
