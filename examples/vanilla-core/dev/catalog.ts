/*
 * The bundle the dev server, the e2e suite and the screenshots render: a mixed case of six white
 * wines, on the Kitenzo demo store's real products.
 *
 * The shape is deliberately the simplest one a merchant sells, because the point of this example
 * is the rendering, not the rules: the same engine runs underneath, with no React on top.
 *
 *   - one step, exactly 6 bottles, any mix, repeats allowed;
 *   - £10 off the case (a fixed amount, so the saving is the same whatever is in it);
 *   - one wine sold out and one with only 3 left, so the case shows both on first load.
 *
 * The count of 6 is a rule on the step rather than a bundle-wide rule. With one step both would
 * sell the same case, but the step is where a merchant sets it in the admin ("Limits" on the
 * step), and it is what makes the step itself refuse a seventh bottle with "The case is full"
 * rather than the vaguer bundle-wide refusal. A bundle-wide `eq 6` still renders correctly here
 * (the case reads its size from `getBundleLimits` when the step has none): see caseSize() in
 * src/model.ts.
 */
import { defineCatalog, discount, rule, type CatalogDef } from './mock/catalog';
import type { StoreProduct } from './mock/catalog';
import snapshot from './mock/demo-store.json' with { type: 'json' };

export const CATALOG_DEFS: CatalogDef[] = [
    {
        id: 2007,
        name: 'Mixed case of 6',
        description: 'Six bottles of Californian white, chosen by you. Mix them however you like, and the case costs less than the bottles do.',
        sections: [
            {
                id: 71,
                name: 'Choose your six',
                description: 'Repeats welcome.',
                rules: [rule.eq(6)],
                products: [
                    'californian-reisling-blend',
                    'californian-reisling',
                    'californian-semillion',
                    'californian-verdelho',
                    'californian-sauvignon-blanc',
                    'californian-chardonnay',
                    'californian-pinot-grigio',
                    'pinot-gris',
                ],
            },
        ],
        discount: discount.fixed(10),
        overrides: {
            // Every wine is in stock on the demo store. A case builder has to show a sold-out
            // bottle as present and unpickable, so one is sold out on cue.
            'californian-semillion': { soldOut: true },
            // A stock ceiling below the case size: three of these and the + stops, saying why.
            'californian-verdelho': { stock: 3 },
        },
    },
];

/** Built on demand, so `bun run snapshot` can read the definitions before a snapshot exists. */
export function loadFixtures() {
    return CATALOG_DEFS.map((def) => defineCatalog(def, snapshot as unknown as StoreProduct[]));
}
