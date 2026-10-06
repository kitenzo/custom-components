/*
 * The edge cases, as switches.
 *
 * Every scenario here is something a real merchant's store has done to a custom component: the
 * API answering slowly or not at all, a bundle unpublished from under a live page, a cart that
 * refuses a line, a shopper in another currency, a theme editor preview. Load any page with
 * `?scenario=<id>` (several, comma separated) to put the widget in that state, in dev, in the
 * gallery and in the e2e suite alike.
 *
 * Scenarios only ever change the data and the servers. They never reach into the widget: if a
 * scenario needs a widget change to look right, the widget has a bug.
 */
import type { Behaviour } from './backend';
import type { Fixture, RawProduct } from './wire';

export interface Scenario {
    id: string;
    label: string;
    group: 'Catalogue' | 'API' | 'Cart' | 'Market' | 'A/B test' | 'Theme';
    /** What a merchant or shopper would have done to get here, and what the widget should do. */
    description: string;
    behaviour?: Behaviour;
    transform?: (fixture: Fixture) => Fixture;
    /** Render as the Shopify theme editor does (`Shopify.designMode`). */
    designMode?: boolean;
    /** The country the theme's localization reports. */
    countryCode?: string;
}

const mapProducts = (fixture: Fixture, change: (product: RawProduct, index: number) => RawProduct): Fixture => ({
    ...fixture,
    products: fixture.products.map(change),
});

/** Products that sit in a section rather than being required, in the merchant's order. */
function sectionProductIds(fixture: Fixture): string[] {
    return fixture.bundle.sections.flatMap((section) => section.products.map((ref) => ref.shopifyProductId));
}

export const SCENARIOS: Scenario[] = [
    {
        id: 'default',
        label: 'As configured',
        group: 'Catalogue',
        description: 'The bundle exactly as its catalogue describes it.',
    },
    {
        id: 'hide-sold-out',
        label: 'Merchant hides sold-out products',
        group: 'Catalogue',
        description:
            'The shop setting "Show out of stock products" is off. Sold-out products disappear, unless hiding them would leave a step unable to reach its minimum, or the product is required: then they stay, visibly unpickable.',
        behaviour: { settings: { hideOutOfStockProducts: true, hideDraftProducts: true } },
    },
    {
        id: 'low-stock',
        label: 'Only 2 left',
        group: 'Catalogue',
        description:
            'The first product has 2 left. A quantity stepper caps at 2 (maxOrderableQuantity, never inventoryQuantity) and says why the + stopped.',
        transform: (fixture) => {
            const first = sectionProductIds(fixture)[0];
            return mapProducts(fixture, (product) =>
                product.shopifyProductId === first
                    ? { ...product, variants: product.variants.map((variant) => ({ ...variant, maxOrderableQuantity: 2, inventoryQuantity: 2 })) }
                    : product,
            );
        },
    },
    {
        id: 'all-sold-out',
        label: 'Everything sold out',
        group: 'Catalogue',
        description: 'Every product is sold out. Nothing can be picked, the buy button explains why, and nothing reaches the cart.',
        transform: (fixture) =>
            mapProducts(fixture, (product) => ({
                ...product,
                variants: product.variants.map((variant) => ({ ...variant, available: false, maxOrderableQuantity: 0, inventoryQuantity: 0 })),
            })),
    },
    {
        id: 'archived-and-draft',
        label: 'Archived and draft products',
        group: 'Catalogue',
        description:
            'The merchant archived the second product and drafted the third, but left both in the bundle. Archived is never offered; a draft follows the shop\'s "hide drafts" setting.',
        transform: (fixture) => {
            const ids = sectionProductIds(fixture);
            return mapProducts(fixture, (product) =>
                product.shopifyProductId === ids[1]
                    ? { ...product, status: 'ARCHIVED' }
                    : product.shopifyProductId === ids[2]
                      ? { ...product, status: 'DRAFT' }
                      : product,
            );
        },
    },
    {
        id: 'hostile-strings',
        label: 'Hostile strings',
        group: 'Catalogue',
        description:
            'Titles with apostrophes, quotes, markup, an ampersand, right-to-left script and 120 characters. Everything renders as text, nothing breaks the layout, nothing executes.',
        transform: (fixture) =>
            mapProducts(fixture, (product, index) => {
                const titles = [
                    `Maman's "Best" <b>Blend</b> & Co.`,
                    `<img src=x onerror="document.body.dataset.pwned=1">`,
                    'عصير الفراولة والكريمة',
                    'An extraordinarily long product name that a merchant pasted from a supplier spreadsheet without trimming it at all',
                ];
                const title = titles[index % titles.length]!;
                return { ...product, title, descriptionHtml: `<p>${title}</p><script>document.body.dataset.pwned='1'</script>` };
            }),
    },
    {
        id: 'contradictory-rules',
        label: 'Rules no selection can meet',
        group: 'Catalogue',
        description:
            'The merchant saved "at least 5" beside "at most 3". The engine rejects every selection, so the widget must not pretend otherwise: the theme editor says which rules clash; the storefront shows a short neutral message.',
        transform: (fixture) => ({
            ...fixture,
            bundle: {
                ...fixture.bundle,
                limitRules: [
                    { operation: 'gte', sectionId: null, type: 'total-number-of-products', value: '5.00' },
                    { operation: 'lte', sectionId: null, type: 'total-number-of-products', value: '3.00' },
                ],
            },
        }),
    },
    {
        id: 'empty-bundle',
        label: 'No products',
        group: 'Catalogue',
        description: 'Every product was removed from the bundle. The widget says so instead of rendering an empty frame with a dead button.',
        transform: (fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, sections: fixture.bundle.sections.map((section) => ({ ...section, products: [] })), requiredProducts: [] },
            products: [],
        }),
    },
    {
        id: 'slow-api',
        label: 'Slow API (2.5s)',
        group: 'API',
        description: 'Every API answer takes 2.5 seconds. The loading state renders inside the widget, at the size the widget will be.',
        behaviour: { latencyMs: 2500 },
    },
    {
        id: 'loading-forever',
        label: 'API never answers',
        group: 'API',
        description: 'The bundle request hangs. The widget keeps its loading state and never renders a half-built builder.',
        behaviour: { bundleFailure: 'never' },
    },
    {
        id: 'bundle-404',
        label: 'Bundle unpublished or deleted',
        group: 'API',
        description:
            'The API answers 404. That is the merchant\'s choice, not a fault: the storefront says the bundle is not available, never "please refresh".',
        behaviour: { bundleFailure: 404 },
    },
    {
        id: 'api-500',
        label: 'API error',
        group: 'API',
        description: 'The API answers 500. This one is ours: a sentence asking the shopper to try again, never a status code.',
        behaviour: { bundleFailure: 500 },
    },
    {
        id: 'api-offline',
        label: 'Offline',
        group: 'API',
        description: 'The request never reaches the server.',
        behaviour: { bundleFailure: 'network' },
    },
    {
        id: 'cart-422',
        label: 'Cart refuses a line (422)',
        group: 'Cart',
        description:
            'Shopify refuses the add with its own reason ("You can only add 2 of ..."). The shopper sees that reason as a sentence; never the URL, never "422".',
        behaviour: { cartFailure: 422 },
    },
    {
        id: 'cart-429',
        label: 'Cart rate-limited (429)',
        group: 'Cart',
        description: 'The store is throttling. The shopper is told to wait a moment and try again.',
        behaviour: { cartFailure: 429 },
    },
    {
        id: 'cart-500',
        label: 'Cart error (500)',
        group: 'Cart',
        description: 'Shopify itself failed.',
        behaviour: { cartFailure: 500 },
    },
    {
        id: 'cart-offline',
        label: 'Connection drops on add',
        group: 'Cart',
        description: 'The add request is lost in transit. The lines may or may not have landed; the SDK reads the cart back rather than risk a duplicate.',
        behaviour: { cartFailure: 'network' },
    },
    {
        id: 'cart-lost-response',
        label: 'Answer lost after the add',
        group: 'Cart',
        description:
            'The lines reach the cart but the answer never comes back. The next press must finish the same add without adding the bundle twice, and the selection must not change in between.',
        behaviour: { cartFailure: 'lost-response' },
    },
    {
        id: 'settings-error',
        label: 'Shop settings fail to load',
        group: 'API',
        description: 'The bundle loads but the shop\'s settings (currency format, sold-out rules) do not. A sentence, never an endless loading state.',
        behaviour: { settingsFailure: true },
    },
    {
        id: 'market-eur',
        label: 'Shopper in Germany (EUR)',
        group: 'Market',
        description:
            'The theme reports country DE. Prices come back in EUR with the market\'s rate, and every figure on screen is the one checkout will charge. No hardcoded £.',
        countryCode: 'DE',
        behaviour: { market: { countryCode: 'DE', currency: 'EUR', rate: 1.17, decimals: 2 } },
    },
    {
        id: 'market-jpy',
        label: 'Shopper in Japan (JPY)',
        group: 'Market',
        description: 'A zero-decimal currency. "¥1,250", never "¥1,250.00".',
        countryCode: 'JP',
        behaviour: { market: { countryCode: 'JP', currency: 'JPY', rate: 190, decimals: 0 } },
    },
    {
        id: 'ab-stays',
        label: 'In the test, stays here',
        group: 'A/B test',
        description:
            'The bundle is variant A of a running A/B test, and this shopper is assigned A. The widget renders as ever, counts the shopper once (an impression, when the bundle is on screen), and every cart line carries _ab_test_routed so the order is credited to the variant they saw. Open the page with ?ab_bypass=true to look as the merchant does: nothing is counted or credited.',
        behaviour: { abTest: { id: 5, assigned: 'a' } },
    },
    {
        id: 'ab-other-variant',
        label: 'Assigned the other variant',
        group: 'A/B test',
        description:
            'The bundle is variant A of a running A/B test, and this shopper is assigned B. The widget draws nothing here and sends them to B\'s page, keeping the page\'s query. In dev that is this page at /pages/variant-b, showing a copy of the bundle: there the shopper is counted once and their cart lines are credited to B.',
        behaviour: { abTest: { id: 5, assigned: 'b' } },
    },
    {
        id: 'theme-editor',
        label: 'Theme editor',
        group: 'Theme',
        description:
            'Rendering inside the Shopify theme editor (Shopify.designMode). Problems are explained to the merchant in full, with how to fix them. Combine with any catalogue scenario.',
        designMode: true,
    },
    {
        id: 'draft-bundle',
        label: 'Draft bundle in the editor',
        group: 'Theme',
        description:
            'The merchant is designing against a bundle they have not published. The editor previews it (the SDK reads drafts there on its own); the storefront would 404; adding to the cart stays refused.',
        designMode: true,
        transform: (fixture) => ({ ...fixture, bundle: { ...fixture.bundle, published: false } }),
    },
];

export function findScenarios(ids: string[]): Scenario[] {
    return ids.map((id) => SCENARIOS.find((scenario) => scenario.id === id)).filter((scenario): scenario is Scenario => Boolean(scenario));
}

/** Fold several scenarios into one set of backend behaviour, fixture transform and page flags. */
export function combineScenarios(scenarios: Scenario[]) {
    const behaviour: Behaviour = {};
    for (const scenario of scenarios) {
        Object.assign(behaviour, scenario.behaviour);
        if (scenario.behaviour?.settings) behaviour.settings = { ...behaviour.settings, ...scenario.behaviour.settings };
    }
    return {
        behaviour,
        transform: (fixture: Fixture) => scenarios.reduce((current, scenario) => scenario.transform?.(current) ?? current, fixture),
        designMode: scenarios.some((scenario) => scenario.designMode),
        countryCode: scenarios.find((scenario) => scenario.countryCode)?.countryCode,
    };
}
