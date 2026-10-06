/*
 * The bundle the dev server, the e2e suite and the gallery render: a gift box from Wrenwood
 * Gifting Co., on the Kitenzo demo store's real products.
 *
 * It is chosen for what has to reach the order intact, not for what is on screen:
 *
 *   - one box, exactly (`eq 1`), with two options (Size x Colour) that resolve to six variants;
 *   - two to five things to fill it with, several with their own option (Scent, Blend, Flavour);
 *   - an optional card, at most one;
 *   - personalisation: a REQUIRED engraving on the brass matchbox (12 characters), and an optional
 *     message in every card (200 characters). Both are read from the bundle by the widget, never
 *     written into it;
 *   - a flat £5 off;
 *   - no photographs at all. The demo store holds these products without images, which is exactly
 *     the catalogue a new independent shop launches with, and the widget has to look finished
 *     anyway (README, "No images").
 *
 * A second bundle, `?bundle=2005`, is the same box where the engraving costs £4: the fee is shown
 * beside the field, joins the total once the field is filled in, and reaches the cart as a line of
 * its own.
 *
 * Replace it with your own bundle's shape when you start a real build: keep the demo store's
 * products, or snapshot your merchant's catalogue the same way (`bun run snapshot`, README).
 */
import { defineCatalog, discount, rule, type CatalogDef, type FeeDef, type FieldDef } from './mock/catalog';
import type { StoreProduct } from './mock/catalog';
import snapshot from './mock/demo-store.json' with { type: 'json' };

const CARDS = [
    'with-love-letterpress-card',
    'thank-you-letterpress-card',
    'happy-birthday-letterpress-card',
    'new-baby-letterpress-card',
    'new-home-letterpress-card',
    'get-well-soon-letterpress-card',
];

const CARD_COPY = '<p>Letterpress on heavy cotton board, with a kraft envelope. Write your message below and we print it inside in espresso ink, up to 200 characters.</p>';

/*
 * Personalisation, as the merchant sets it up in Kitenzo (a personalisation set per product).
 *
 * Each `key` differs from its `label` on purpose: the key is frozen when the field is created and
 * is what the order's line property is named; the label is what the merchant can reword later.
 * Submitting under the label is the bug this catches.
 */
const ENGRAVING: FieldDef = {
    id: 'pf-engraving',
    key: 'Engraving',
    label: 'Lid engraving',
    type: 'text',
    required: true,
    placeholder: 'e.g. R & J 2026',
    characterLimit: 12,
    helpText: 'Up to 12 characters, engraved on the lid exactly as you type it.',
};

const PERSONALISATION: Record<string, FieldDef[]> = {
    'engravable-brass-matchbox': [ENGRAVING],
    ...Object.fromEntries(
        CARDS.map((handle) => [
            handle,
            [
                {
                    id: `pf-card-message-${handle}`,
                    key: 'Card message',
                    label: 'Your message',
                    type: 'text',
                    placeholder: 'Write something they will keep',
                    characterLimit: 200,
                    helpText: 'Printed inside the card. Leave blank for a blank card.',
                } satisfies FieldDef,
            ],
        ]),
    ),
};

/** The fee option the second bundle's engraving is charged through. */
export const ENGRAVING_FEE: FeeDef = { id: 7, name: 'Engraving', amount: 4 };

/** The bundle whose engraving carries the fee: `?bundle=2005` on the dev page. */
export const PAID_ENGRAVING_BUNDLE = 2005;

const GIFT_BOX: CatalogDef = {
    id: 2004,
    name: 'Build a gift box',
    description: 'Choose a box, fill it with two to five small-batch things, and add a card with your message. Built here, it costs less than buying each on its own.',
    sections: [
        {
            id: 41,
            name: 'Choose your box',
            description: 'Rigid kraft with a lift-off lid, lined with tissue.',
            rules: [rule.eq(1)],
            autoNextSection: true,
            products: ['keepsake-gift-box'],
        },
        {
            id: 42,
            name: 'Fill it',
            description: 'Two to five things. The brass matchbox is engraved for them.',
            rules: rule.range(2, 5),
            products: [
                'hand-poured-soy-candle',
                'loose-leaf-tea-tin',
                'small-batch-chocolate-bar',
                'merino-lounge-socks',
                'botanical-bath-soak',
                'engravable-brass-matchbox',
            ],
        },
        {
            id: 43,
            name: 'Add a card',
            description: 'Optional. Letterpress, with your message printed inside.',
            rules: [rule.max(1)],
            products: CARDS,
        },
    ],
    discount: discount.fixed(5),
    personalisation: PERSONALISATION,
    overrides: {
        // One combination sold out, so the option grid has to work out what is reachable
        // (`reachableOptionValues`): Grand stays choosable in Oat, Terracotta in the other sizes.
        'keepsake-gift-box': {
            variants: [{ title: 'Grand / Terracotta', soldOut: true }],
            // The store's copy offers a printed lid name, which this bundle does not collect.
            // A description must never promise personalisation the widget will not ask for.
            descriptionHtml: '<p>Every gift starts with the box. Rigid kraft construction with a lift-off lid, lined with tissue to match.</p>',
        },
        'hand-poured-soy-candle': {
            descriptionHtml: '<p>Small-batch soy wax candle in an amber glass jar, 40 hour burn.</p>',
        },
        'engravable-brass-matchbox': {
            descriptionHtml: '<p>A solid keepsake matchbox that outlives the matches. Machine engraved with up to 12 characters, then polished and wrapped in tissue.</p>',
        },
        // A stock ceiling, so the stepper's cap is visible without a scenario.
        'small-batch-chocolate-bar': { stock: 3 },
        // The store's copy promises "up to 300 characters"; the card's field allows 200, and a
        // product page must never contradict the input under it.
        ...Object.fromEntries(
            CARDS.map((handle) => [
                handle,
                { descriptionHtml: CARD_COPY },
            ]),
        ),
        // Sold out on purpose: a card the shopper can see but not choose, so the sold-out tile
        // (which has no photograph to grey out) is on screen in the default state.
        'get-well-soon-letterpress-card': {
            soldOut: true,
            descriptionHtml: CARD_COPY,
        },
    },
};

export const CATALOG_DEFS: CatalogDef[] = [
    GIFT_BOX,
    {
        ...GIFT_BOX,
        id: PAID_ENGRAVING_BUNDLE,
        description: 'Choose a box, fill it with two to five small-batch things, and add a card with your message. Engraving the brass matchbox adds £4.',
        personalisation: { ...PERSONALISATION, 'engravable-brass-matchbox': [{ ...ENGRAVING, fee: ENGRAVING_FEE }] },
    },
];

/** Built on demand, so `bun run snapshot` can read the definitions before a snapshot exists. */
export function loadFixtures() {
    return CATALOG_DEFS.map((def) => defineCatalog(def, snapshot as unknown as StoreProduct[]));
}
