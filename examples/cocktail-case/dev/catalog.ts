/*
 * The bundle the dev server, the e2e suite and the gallery render: a mix-a-case of Lark & Lime
 * canned cocktails on the Kitenzo demo store's real products.
 *
 * Its shape is the one this example exists to show:
 *
 *   - one step and no per-step rules: the count is bundle-wide (`sectionId: null`), 6 to 24 cans,
 *     because a case is "any 6 to 24", not "so many of each";
 *   - a tiered percentage discount on the number of cans (6+ 5%, 12+ 10%, 24+ 15%), so the
 *     widget has a ladder to climb. The 12 and 24 tiers carry merchant `customText` with the SDK's
 *     `{{ amount }}` / `{{ discount }}` / `{{ currentDiscount }}` placeholders; the 6 tier has
 *     none, so the theme's default copy shows there. Both paths render on every run;
 *   - one Recurring bundles plan ("Cocktail Club": every 2, 4 or 8 weeks, 10% off, the first
 *     case included), which the widget offers beside a one-time purchase;
 *   - tags with facet prefixes (`Flavor_Fruity`, `Strength_Light`) next to unprefixed copies
 *     (`Fruity`, `Light`), as the store has them. Only the prefixed ones become filter chips:
 *     the unprefixed copies are there to prove the prefix is what decides;
 *   - Watermelon Basil Spritz, sold out on the store itself;
 *   - a stock ceiling of 4 on Spicy Pineapple Margarita, so "Surprise me" has a capped product
 *     to step around without a scenario.
 */
import { defineCatalog, discount, rule, type CatalogDef } from './mock/catalog';
import type { StoreProduct } from './mock/catalog';
import snapshot from './mock/demo-store.json' with { type: 'json' };

export const CATALOG_DEFS: CatalogDef[] = [
    {
        id: 2003,
        name: 'Mix your case',
        description: 'Any 6 to 24 cans of Lark & Lime. The bigger the case, the bigger the saving.',
        sections: [
            {
                id: 31,
                name: 'Pick your cans',
                description: 'Canned cocktails, 250ml each.',
                products: [
                    'passionfruit-mojito',
                    'pear-cardamom',
                    'grapefruit-rosemary',
                    'raspberry-hibiscus',
                    'spicy-pineapple-marg',
                    'cucumber-lime-tonic',
                    'peach-bourbon-smash',
                    'yuzu-elderflower',
                    'blood-orange-bitters',
                    // Sold out on the demo store: shown, marked, never picked by hand or by "Surprise me".
                    'watermelon-basil',
                ],
            },
        ],
        // Bundle-wide: any mix of 6 to 24.
        rules: rule.range(6, 24),
        discount: discount.tiers('percentage', [
            // No customText: the theme setting "Next tier" supplies the words.
            { atLeast: 6, discount: 5 },
            { atLeast: 12, discount: 10, customText: '{{ amount }} more cans and the whole case is {{ discount }}% off.' },
            { atLeast: 24, discount: 15, customText: 'Go big: {{ amount }} more for {{ discount }}% off. You are on {{ currentDiscount }}% now.' },
        ]),
        recurringOptions: [
            {
                id: 71,
                name: 'Cocktail Club',
                subscriptionType: 'optional',
                discountType: 'percentage',
                discountValue: 10,
                applyDiscountToInitialOrder: true,
                frequencies: [
                    { id: '2-weeks', frequency: 2, unit: 'weeks' },
                    { id: '4-weeks', frequency: 4, unit: 'weeks' },
                    { id: '8-weeks', frequency: 8, unit: 'weeks' },
                ],
            },
        ],
        overrides: {
            // A stock ceiling, so the stepper's cap and "Surprise me" stepping around it are visible.
            'spicy-pineapple-marg': { stock: 4 },
        },
    },
];

/** Built on demand, so `bun run snapshot` can read the definitions before a snapshot exists. */
export function loadFixtures() {
    return CATALOG_DEFS.map((def) => defineCatalog(def, snapshot as unknown as StoreProduct[]));
}
