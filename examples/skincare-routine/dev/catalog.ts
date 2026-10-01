/*
 * The bundle the dev server, the e2e suite and the gallery render: a three-step skincare routine
 * on the Kitenzo demo store's real LUMERA products.
 *
 * It is the shape a "build my routine" quiz exists for, and it carries the edge cases a quiz gets
 * wrong first:
 *
 *   - three steps, exactly one product each (eq 1), so the quiz has one pick to make per step and
 *     the wizard swaps rather than stacks;
 *   - "Advance when this step is done" on Cleanse and Treat but not on Moisturise, so the wizard
 *     has to read the setting per step rather than assume it;
 *   - every cleanser and moisturiser has a Size option with two values; one cleanser's 75ml is
 *     sold out here, so the default size has to skip it and the dropdown has to disable it;
 *   - the retinal serum is sold out on the store itself, and it is the only product tagged
 *     anti-ageing in its step: the quiz must recommend something else for "fine lines";
 *   - real Shopify tags (dry-skin, oily-skin, acne-prone, brightening, ...) the quiz scores on;
 *   - a flat 15% discount.
 */
import { defineCatalog, discount, rule, type CatalogDef } from './mock/catalog';
import type { StoreProduct } from './mock/catalog';
import snapshot from './mock/demo-store.json' with { type: 'json' };

export const CATALOG_DEFS: CatalogDef[] = [
    {
        id: 2002,
        name: 'Your three-step routine',
        description: 'A cleanser, a treatment and a moisturiser, chosen for your skin. Save 15% on the set.',
        sections: [
            {
                id: 21,
                name: 'Cleanse',
                description: 'Morning and evening, on damp skin.',
                rules: [rule.eq(1)],
                autoNextSection: true,
                products: ['squalane-camellia-cleansing-oil-balm', 'ceramide-oat-cream-cleanser', 'pha-zinc-exfoliating-cleanser', 'amino-acid-gentle-gel-cleanser'],
            },
            {
                id: 22,
                name: 'Treat',
                description: 'One targeted serum, after cleansing.',
                rules: [rule.eq(1)],
                autoNextSection: true,
                products: [
                    'vitamin-c-ferulic-brightening-serum',
                    // Sold out on the demo store. It stays visible and unpickable, and the quiz must
                    // never put it in a routine, even for the one answer only it matches.
                    'retinal-squalane-overnight-serum',
                    'niacinamide-zinc-blemish-serum',
                    'polyglutamic-acid-beta-glucan-serum',
                ],
            },
            {
                id: 23,
                name: 'Moisturise',
                description: 'Seal it all in.',
                rules: [rule.eq(1)],
                // Off on purpose: the last step waits for the shopper, so the wizard must not
                // assume every step advances.
                autoNextSection: false,
                products: ['centella-panthenol-barrier-balm', 'hyaluronic-aloe-gel-cream', 'squalane-shea-rich-cream', 'ceramide-peptide-daily-moisturiser'],
            },
        ],
        discount: discount.percentage(15),
        overrides: {
            // One size sold out, and it is the first one: the quiz and the card must default to the
            // 150ml, and the Size dropdown must show 75ml disabled (reachableOptionValues).
            'ceramide-oat-cream-cleanser': { variants: [{ title: '75ml', soldOut: true }] },
        },
    },
];

/** Built on demand, so `bun run snapshot` can read the definitions before a snapshot exists. */
export function loadFixtures() {
    return CATALOG_DEFS.map((def) => defineCatalog(def, snapshot as unknown as StoreProduct[]));
}
