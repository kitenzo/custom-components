/*
 * A stand-in for the two servers a custom component talks to:
 *
 *   - the Kitenzo headless API (`/settings`, `/bundles/:id`, `/bundles/:id/products`,
 *     `/bundles/:id/configure`, `/bundles/:id/price`, `/ab-tests/impression`, and the
 *     saved-contents lookup the cart's "Edit" uses), and
 *   - the Shopify theme's AJAX cart (`/cart.js`, `/cart/add.js`, `/cart/update.js`, with any
 *     locale prefix such as `/en-gb/cart/add.js`).
 *
 * It is a pure request handler with no DOM and no network, so the same code answers in the dev
 * server and the gallery (through `browser.ts`, which patches `fetch`) and in the Playwright suite
 * (through `page.route`). The widget runs the published SDK against it unmodified.
 *
 * It is deliberately strict where Shopify and Kitenzo are strict: a sold-out variant is refused by
 * `/configure` and by `/cart/add.js`, a draft bundle 404s unless the request previews, and every
 * request is recorded so a test can assert what was (and was not) sent.
 */
import { createBundleBuilder, type BundleDetail, type BundleProduct } from '@kitenzo/core';

import { feeProductId } from './catalog';
import type { ABTestFields, Fixture, PersonalisationFieldFee, RawBundle, RawProduct, RawSettings } from './wire';

export interface Market {
    countryCode: string;
    currency: string;
    /** Multiplier from the shop's currency to this one. */
    rate: number;
    /** Decimal places the currency uses: 0 for JPY, 3 for KWD. */
    decimals: number;
}

/**
 * A running A/B test whose entry bundle (variant A) is the first fixture.
 *
 * Kitenzo assigns a shopper by hashing their visitor id, so which variant a browser gets is
 * a coin toss. A scenario has to be the same on every load, so the test says what the hash would
 * have: every shopper of this backend is `assigned` the same variant.
 */
export interface ABTest {
    id: number;
    assigned: 'a' | 'b';
    /**
     * B's page, root-relative, as the API sends it in `abTestRedirectTo`. Left out, it is
     * `variantPage(B)`: a path of its own carrying `?bundle=<B>`, which the dev page and the e2e
     * harness both read to choose the bundle they mount, so the redirect lands on a page that
     * draws B without leaving the host.
     */
    pageB?: string;
}

/**
 * The id the backend serves variant B under: a copy of bundle A, which is how most tests start (the
 * merchant duplicates the bundle and changes one thing).
 */
export const variantBundleId = (bundleA: number) => bundleA + 100_000;
export const variantPage = (bundleB: number) => `/pages/variant-b?bundle=${bundleB}`;

export type Failure = 404 | 500 | 'network' | 'never';
/** `lost-response`: the lines land, then the connection drops before the answer arrives. */
export type CartFailure = 422 | 429 | 500 | 'network' | 'lost-response';

export interface Behaviour {
    /** Added before every API answer, in milliseconds. */
    latencyMs?: number;
    /** How `GET /bundles/:id` (and its products) fail, if they do. */
    bundleFailure?: Failure;
    /** How `POST /cart/add.js` fails, if it does. */
    cartFailure?: CartFailure;
    /** `GET /settings` answers 500. */
    settingsFailure?: boolean;
    /** The sentence Shopify puts in a 422's `description`. */
    cartFailureReason?: string;
    /** Serve presentment prices for this market when the widget asks for its country. */
    market?: Market;
    /** Settings the shop has, over the fixture's own. */
    settings?: Partial<RawSettings>;
    /** The shop is running this A/B test. */
    abTest?: ABTest;
}

export interface MockRequest {
    method: string;
    path: string;
    query: Record<string, string>;
    body: unknown;
}

export interface MockResponse {
    status: number;
    body: unknown;
    /** Resolve after this long; `Infinity` never resolves. */
    delayMs: number;
    /** Reject like a dropped connection instead of answering. */
    networkError?: boolean;
}

export interface CartItem {
    key: string;
    id: number;
    variant_id: number;
    product_id: number;
    title: string;
    product_title: string;
    variant_title: string | null;
    quantity: number;
    price: number;
    line_price: number;
    image: string | null;
    properties: Record<string, string>;
}

export interface Cart {
    token: string;
    items: CartItem[];
    attributes: Record<string, string>;
    item_count: number;
    total_price: number;
    currency: string;
    note: string | null;
}

export interface SavedConfiguration {
    configuredBundleId: number;
    bundleId: number;
    variantId: string;
    items: { variantId: number; quantity: number; sectionId: number | null }[];
}

/** A shopper counted once for the variant of a test they saw: the test's "unique visitors". */
export interface CountedVisitor {
    testId: number;
    bundleId: number;
    visitorId: string;
}

/** Everything that survives a page load in the browser adapter. */
export interface BackendState {
    cart: Cart;
    saved: SavedConfiguration[];
    nextConfiguredId: number;
    visitors: CountedVisitor[];
}

export interface MockBackend {
    handle(request: MockRequest): MockResponse | null;
    /** Every request answered, oldest first. */
    readonly requests: MockRequest[];
    readonly state: BackendState;
    reset(): void;
}

const API_PREFIX = /\/api\/headless\/v\d+/;
const CART_ROUTE = /^(?:\/[a-z]{2}(?:-[a-z]{2,4})?)?\/cart(\.js|\/add\.js|\/update\.js|\/change\.js|\/clear\.js)$/i;

export function emptyState(): BackendState {
    return {
        cart: { token: 'mock-cart', items: [], attributes: {}, item_count: 0, total_price: 0, currency: 'GBP', note: null },
        saved: [],
        nextConfiguredId: 9001,
        visitors: [],
    };
}

function ok(body: unknown, delayMs = 0): MockResponse {
    return { status: 200, body, delayMs };
}

function fail(status: number, body: unknown, delayMs = 0): MockResponse {
    return { status, body, delayMs };
}

function roundTo(value: number, decimals: number): string {
    return value.toFixed(decimals);
}

/** The products endpoint for one market: presentment prices beside the base ones, as the API adds them. */
function inMarket(products: RawProduct[], market: Market): RawProduct[] {
    return products.map((product) => ({
        ...product,
        variants: product.variants.map((variant) => {
            const presentment = Number(variant.price) * market.rate;
            return {
                ...variant,
                presentmentPrice: roundTo(presentment, market.decimals),
                presentmentCurrency: market.currency,
                priceInShopCurrency: roundTo(presentment / market.rate, 2),
                availableForSale: variant.available,
            };
        }),
    }));
}

/** The fees a bundle's fields charge, one per fee option. */
function feesOf(bundle: RawBundle): PersonalisationFieldFee[] {
    const fees = new Map<number, PersonalisationFieldFee>();
    for (const fields of Object.values(bundle.personalisation ?? {})) {
        for (const field of fields) if (field.fee) fees.set(field.fee.feeOptionId, field.fee);
    }
    return [...fees.values()];
}

/**
 * The hidden product Kitenzo keeps for a fee option, as the theme's cart knows it: titled with the
 * option's name, one default variant at the fee's amount, never sold out, with no photograph.
 */
function feeProduct(fee: PersonalisationFieldFee): RawProduct {
    return {
        descriptionHtml: `Personalisation fee: ${fee.name}`,
        handle: `personalisation-fee-${fee.feeOptionId}`,
        imageUrl: '',
        images: [],
        options: [],
        shopifyProductGid: `gid://shopify/Product/${feeProductId(fee.feeOptionId)}`,
        shopifyProductId: feeProductId(fee.feeOptionId),
        status: 'ACTIVE',
        tags: ['kitenzo-personalisation-fee'],
        title: fee.name,
        variants: [
            {
                available: true,
                compareAtPrice: null,
                grams: 0,
                inventoryQuantity: 0,
                maxOrderableQuantity: null,
                optionValues: [],
                price: fee.amount,
                shopifyVariantGid: `gid://shopify/ProductVariant/${fee.variantId}`,
                shopifyVariantId: String(fee.variantId),
                sku: '',
                title: 'Default Title',
            },
        ],
    };
}

/**
 * The bundle as `GET /bundles/:id` sends it. A fee is resolved for a native bundle only: the other
 * types add no fee line, so a fee shown on one would be promised and never charged. The field
 * keeps its `feeOptionId` either way.
 */
function withResolvedFees(bundle: RawBundle): RawBundle {
    if (bundle.type === 'native' || !bundle.personalisation) return bundle;
    return {
        ...bundle,
        personalisation: Object.fromEntries(
            Object.entries(bundle.personalisation).map(([productId, fields]) => [productId, fields.map((field) => ({ ...field, fee: null }))]),
        ),
    };
}

export interface BackendOptions {
    fixtures: Fixture[];
    behaviour?: Behaviour;
    state?: BackendState;
    /** Called after every change to `state`, so an adapter can persist it. */
    onChange?: (state: BackendState) => void;
}

/**
 * The bundle as the SDK would merge it, for the one place the mock has to judge a selection the way
 * Kitenzo's engine does: `/configure`. Mirrors the SDK's own merge, field for field that matters.
 */
function toBundleDetail(fixture: Fixture): BundleDetail {
    const byId = new Map(fixture.products.map((product) => [product.shopifyProductId, product]));
    const toProduct = (raw: RawProduct, allowed: string[]): BundleProduct => ({
        id: raw.shopifyProductId,
        title: raw.title,
        handle: raw.handle,
        image: raw.imageUrl || undefined,
        status: raw.status,
        tags: raw.tags,
        options: raw.options,
        variants: raw.variants
            .filter((variant) => allowed.length === 0 || allowed.includes(variant.shopifyVariantId))
            .map((variant) => ({
                id: variant.shopifyVariantId,
                title: variant.title,
                price: variant.price,
                available: variant.available,
                grams: variant.grams,
                optionValues: variant.optionValues,
                maxOrderableQuantity: variant.maxOrderableQuantity,
                ...(variant.surcharge !== undefined ? { surcharge: variant.surcharge } : {}),
            })),
    });
    const { bundle } = fixture;
    return {
        ...(bundle as unknown as BundleDetail),
        sections: bundle.sections.map((section) => ({
            ...section,
            products: section.products.flatMap((ref) => {
                const raw = byId.get(ref.shopifyProductId);
                return raw ? [toProduct(raw, ref.variantIds)] : [];
            }),
        })),
        requiredProducts: bundle.requiredProducts.map((entry) => {
            const raw = byId.get(entry.shopifyProductId);
            // An empty `variantIds` means "any variant", to the engine and to the SDK alike.
            return { ...entry, product: raw ? toProduct(raw, entry.variantIds) : undefined };
        }),
    };
}

export function createMockBackend(options: BackendOptions): MockBackend {
    const behaviour = options.behaviour ?? {};
    const latency = behaviour.latencyMs ?? 0;
    let state = options.state ?? emptyState();
    const requests: MockRequest[] = [];
    const fixtures = new Map(options.fixtures.map((fixture) => [fixture.bundle.id, fixture]));

    // A test that names no B runs against a copy of A, served like any other bundle of the shop.
    const test = behaviour.abTest;
    const entry = options.fixtures[0];
    const bundleA = entry?.bundle.id;
    const bundleB = test && bundleA !== undefined ? variantBundleId(bundleA) : undefined;
    if (entry && bundleB !== undefined && !fixtures.has(bundleB)) {
        fixtures.set(bundleB, { ...entry, bundle: { ...entry.bundle, id: bundleB } });
    }

    // Every variant any bundle offers, so the cart can describe a line and refuse a sold-out one.
    const variants = new Map<string, { product: RawProduct; variant: RawProduct['variants'][number] }>();
    for (const fixture of fixtures.values()) {
        for (const product of fixture.products) {
            for (const variant of product.variants) variants.set(variant.shopifyVariantId, { product, variant });
        }
        // A fee is a line for a product in no step, which the cart has to know like any other.
        for (const fee of feesOf(withResolvedFees(fixture.bundle))) {
            const product = feeProduct(fee);
            variants.set(String(fee.variantId), { product, variant: product.variants[0]! });
        }
    }
    // The bundle's own Shopify product, which a native bundle's lines group under.
    const parentVariant = (bundleId: number) => String(8_000_000_000_000 + bundleId);

    const settingsFor = (fixture: Fixture | undefined): RawSettings => ({
        ...(fixture?.settings ?? options.fixtures[0]!.settings),
        ...behaviour.settings,
    });

    const changed = () => options.onChange?.(state);

    /**
     * The A/B fields for one bundle request, decided the way Kitenzo's routing decides them.
     *
     * Only A is an entry point. A shopper who reaches B is in the test only when their browser
     * remembers being sent there by it (`ab_routed`) and their assignment agrees. A request with
     * no `visitor_id` is from a client that takes no part. `ab_bypass` is the merchant looking
     * from the admin: nobody is enrolled or redirected.
     */
    function routing(bundleId: number, query: Record<string, string>): ABTestFields {
        if (!test || bundleA === undefined || bundleB === undefined) return {};
        const visitorId = query.visitor_id || undefined;
        const bypass = query.ab_bypass === 'true';
        const assigned = test.assigned === 'a' ? bundleA : bundleB;

        if (bundleId !== bundleA) {
            const remembered = (query.ab_routed ?? '').split(',').filter((part) => /^\d+$/.test(part.trim())).map(Number);
            if (bypass || !visitorId || bundleId !== bundleB || assigned !== bundleB || !remembered.includes(test.id)) return {};
            return { abTestRouted: true, abTestVisitorId: visitorId, abTestBundleId: bundleId, abTestId: test.id };
        }

        if (bypass || !visitorId) return {};
        const redirects = assigned !== bundleA;
        // B's page could not show an unpublished B, so the shopper stays on A, outside the test.
        if (redirects && !fixtures.get(bundleB)?.bundle.published) return {};
        return {
            abTestRouted: true as const,
            abTestVisitorId: visitorId,
            abTestBundleId: bundleId,
            abTestId: test.id,
            ...(redirects ? { abTestRedirectTo: test.pageB ?? variantPage(bundleB), abTestRedirectBundleId: bundleB } : {}),
        };
    }

    /**
     * `POST /ab-tests/impression`: count a shopper for the variant they saw, once. The assignment
     * is worked out again here, because the key is public and a claim alone could pad either arm.
     * A bundle in no running test is an ordinary answer (`recorded: false`), not an error.
     */
    function impression(request: MockRequest): MockResponse {
        if (request.method !== 'POST') return fail(405, { detail: 'Method not allowed.' }, latency);
        const body = (request.body ?? {}) as { bundleId?: unknown; visitorId?: unknown };
        const asked = body.bundleId;
        const bundleId = typeof asked === 'number' ? asked : typeof asked === 'string' && /^\s*-?\d+\s*$/.test(asked) ? Number(asked) : NaN;
        if (!Number.isInteger(bundleId)) return fail(400, { detail: 'bundleId must be a number.' }, latency);
        const visitorId = typeof body.visitorId === 'string' ? body.visitorId.trim() : '';
        if (!visitorId) return fail(400, { detail: 'visitorId is required.' }, latency);
        if (!fixtures.has(bundleId)) return fail(404, { detail: 'Not found.' }, latency);

        const assigned = test?.assigned === 'a' ? bundleA : bundleB;
        if (!test || bundleId !== assigned) return ok({ recorded: false, newVisitor: false }, latency);
        const seen = state.visitors.some((visitor) => visitor.testId === test.id && visitor.bundleId === bundleId && visitor.visitorId === visitorId);
        if (!seen) {
            state.visitors.push({ testId: test.id, bundleId, visitorId });
            changed();
        }
        return ok({ recorded: true, newVisitor: !seen }, latency);
    }

    function api(path: string, request: MockRequest): MockResponse {
        if (path === '/settings') {
            if (behaviour.settingsFailure) return fail(500, { error: 'Internal server error.' }, latency);
            return ok(settingsFor(options.fixtures[0]), latency);
        }

        if (path === '/ab-tests/impression') return impression(request);

        const match = /^\/bundles\/(\d+)(\/products|\/configure|\/price)?$/.exec(path);
        if (path === '/bundles') {
            return ok(
                [...fixtures.values()]
                    .filter((fixture) => fixture.bundle.published)
                    .map(({ bundle }) => ({
                        id: bundle.id,
                        name: bundle.name,
                        description: bundle.description,
                        imageUrl: bundle.imageUrl,
                        type: bundle.type,
                        bundlingOption: bundle.bundlingOption,
                        published: bundle.published,
                    })),
                latency,
            );
        }
        if (path === '/embed/api/v1/content') return savedContents(request);
        if (!match) return fail(404, { error: 'Not found.' }, latency);

        const bundleId = Number(match[1]);
        const fixture = fixtures.get(bundleId);
        const tail = match[2] ?? '';

        if (tail === '' || tail === '/products') {
            if (behaviour.bundleFailure === 'never') return { status: 200, body: null, delayMs: Infinity };
            if (behaviour.bundleFailure === 'network') return { status: 0, body: null, delayMs: latency, networkError: true };
            if (behaviour.bundleFailure === 404) return fail(404, { error: 'Bundle not found.' }, latency);
            if (behaviour.bundleFailure === 500) return fail(500, { error: 'Internal server error.' }, latency);
            // A draft bundle is invisible to a storefront; only a previewing read (the theme editor) sees it.
            if (!fixture || (!fixture.bundle.published && request.query.preview !== '1')) {
                return fail(404, { error: 'Bundle not found.' }, latency);
            }
            if (tail === '') return ok({ ...withResolvedFees(fixture.bundle), ...routing(bundleId, request.query) }, latency);
            const market = behaviour.market;
            const country = request.query.countryCode;
            const products = market && country === market.countryCode ? inMarket(fixture.products, market) : fixture.products;
            return ok({ products }, latency);
        }

        if (!fixture) return fail(404, { error: 'Bundle not found.' }, latency);
        if (request.method !== 'POST') return fail(405, { error: 'Method not allowed.' }, latency);
        return tail === '/configure' ? configure(fixture, request) : price(request);
    }

    function pricingFrom(body: Record<string, unknown>, fixture?: Fixture) {
        // The SDK sends the price it is showing as `bundleContent`; the real API recomputes it.
        // Echoing it back is enough for a stand-in, and it keeps the two in step by construction.
        const content = (body.bundleContent ?? {}) as { price?: number; originalPrice?: number | null };
        const discounted = typeof content.price === 'number' ? content.price : 0;
        const original = typeof content.originalPrice === 'number' ? content.originalPrice : discounted;
        return {
            originalPrice: original.toFixed(2),
            discountedPrice: discounted.toFixed(2),
            discountType: fixture?.bundle.discount?.type || null,
            discountValue: fixture?.bundle.discount?.value ?? null,
            currency: settingsFor(fixture).currency,
        };
    }

    function price(request: MockRequest): MockResponse {
        return ok(pricingFrom((request.body ?? {}) as Record<string, unknown>), latency);
    }

    function configure(fixture: Fixture, request: MockRequest): MockResponse {
        // Configuring a draft would mint a variant a shopper could check out with, so the API
        // refuses it whatever the request says.
        if (!fixture.bundle.published) return fail(404, { error: 'Bundle not found.' }, latency);
        const body = (request.body ?? {}) as Record<string, unknown>;
        const picks = Array.isArray(body.products) ? (body.products as { variant: string; product: string; section: number }[]) : [];
        if (picks.length === 0) return fail(400, { error: 'Select at least one product.' }, latency);
        for (const pick of picks) {
            const entry = variants.get(String(pick.variant).replace(/^gid:\/\/shopify\/ProductVariant\//, ''));
            if (!entry) return fail(400, { error: 'A selected product is not part of this bundle.' }, latency);
            if (!entry.variant.available) return fail(400, { error: `${entry.product.title} is sold out.` }, latency);
        }
        // The engine re-validates every configuration against the bundle's rules, so a widget that
        // gates on less than the SDK's `isSatisfied` is caught here, not at a merchant's checkout.
        const check = createBundleBuilder(toBundleDetail(fixture));
        for (const pick of picks) if (pick.section >= 0) check.addItem(pick.section, String(pick.variant), 1);
        if (!check.getState().isSatisfied) {
            return fail(400, { error: 'This selection does not meet the bundle\'s rules.' }, latency);
        }
        const configuredBundleId = state.nextConfiguredId++;
        const grouped = new Map<string, { variantId: number; quantity: number; sectionId: number | null }>();
        for (const pick of picks) {
            const key = `${pick.section}:${pick.variant}`;
            const current = grouped.get(key);
            if (current) current.quantity += 1;
            else grouped.set(key, { variantId: Number(pick.variant), quantity: 1, sectionId: pick.section >= 0 ? pick.section : null });
        }
        state.saved.push({ configuredBundleId, bundleId: fixture.bundle.id, variantId: parentVariant(fixture.bundle.id), items: [...grouped.values()] });
        // A non-native bundle is sold as one "ghost" variant the cart must know about.
        if (fixture.bundle.type !== 'native') {
            const content = (body.bundleContent ?? {}) as { price?: number };
            const ghost = fixture.products[0]!;
            variants.set(parentVariant(fixture.bundle.id), {
                product: { ...ghost, title: fixture.bundle.name, shopifyProductId: String(7_000_000_000_000 + fixture.bundle.id) },
                variant: { ...ghost.variants[0]!, shopifyVariantId: parentVariant(fixture.bundle.id), title: 'Default Title', price: (content.price ?? 0).toFixed(2), available: true, maxOrderableQuantity: null },
            });
        }
        changed();
        return ok(
            {
                configured_bundle_id: configuredBundleId,
                variant_id: parentVariant(fixture.bundle.id),
                product_id: String(7_000_000_000_000 + fixture.bundle.id),
                discount: `mock-signed-discount-${configuredBundleId}`,
                subscription_id: body.subscription ? `mock-subscription-${configuredBundleId}` : null,
                pricing: pricingFrom(body, fixture),
            },
            latency,
        );
    }

    function savedContents(request: MockRequest): MockResponse {
        const body = (request.body ?? {}) as { bundles?: { configuredBundleId?: number; variantId?: string }[] };
        const lookup = body.bundles?.[0];
        const saved = state.saved.find(
            (entry) => entry.configuredBundleId === lookup?.configuredBundleId || (lookup?.variantId && entry.variantId === lookup.variantId),
        );
        return ok({ configured: saved ? [saved] : [], bundles: [] }, latency);
    }

    // ----- Shopify's AJAX cart ---------------------------------------------------------------

    function recount() {
        state.cart.item_count = state.cart.items.reduce((total, item) => total + item.quantity, 0);
        state.cart.total_price = state.cart.items.reduce((total, item) => total + item.line_price, 0);
    }

    function cart(route: string, request: MockRequest): MockResponse {
        if (route === '.js') return ok(state.cart, 30);

        if (route === '/add.js') {
            const failure = behaviour.cartFailure;
            const items = ((request.body ?? {}) as { items?: { id: number; quantity: number; properties?: Record<string, string> }[] }).items ?? [];
            if (failure === 'network') return { status: 0, body: null, delayMs: 300, networkError: true };
            if (failure === 429) return fail(429, { status: 429, message: 'Too Many Requests', description: 'Too many attempts. Please try again in a moment.' }, 300);
            if (failure === 500) return fail(500, { status: 500, message: 'Internal Server Error' }, 300);
            if (failure === 422) {
                const first = items[0] ? variants.get(String(items[0].id))?.product.title : undefined;
                const description = behaviour.cartFailureReason ?? `You can only add 2 of ${first ?? 'this item'} to the cart.`;
                return fail(422, { status: 422, message: 'Cart Error', description }, 300);
            }
            // Shopify adds all of a request's lines or none of them, so check every line first.
            for (const item of items) {
                const entry = variants.get(String(item.id));
                if (!entry) return fail(422, { status: 422, message: 'Cart Error', description: 'Cannot find variant' }, 200);
                if (!entry.variant.available) {
                    return fail(422, { status: 422, message: 'Cart Error', description: `${entry.product.title} is sold out.` }, 200);
                }
                const cap = entry.variant.maxOrderableQuantity;
                const inCart = state.cart.items.filter((line) => line.id === item.id).reduce((total, line) => total + line.quantity, 0);
                const asked = items.filter((other) => other.id === item.id).reduce((total, other) => total + other.quantity, 0);
                if (cap !== null && inCart + asked > cap) {
                    return fail(422, { status: 422, message: 'Cart Error', description: `You can only add ${cap} of ${entry.product.title} to the cart.` }, 200);
                }
            }
            for (const item of items) {
                const entry = variants.get(String(item.id));
                const properties = item.properties ?? {};
                const key = `${item.id}:${JSON.stringify(properties)}`;
                const existing = state.cart.items.find((line) => line.key === key);
                // A native bundle's parent, or a ghost variant: not in any section, so priced at 0 here.
                const unitPrice = entry ? Math.round(Number(entry.variant.price) * 100) : 0;
                if (existing) {
                    existing.quantity += item.quantity;
                    existing.line_price = existing.quantity * existing.price;
                } else {
                    const variantTitle = entry && entry.variant.title !== 'Default Title' ? entry.variant.title : null;
                    state.cart.items.push({
                        key,
                        id: item.id,
                        variant_id: item.id,
                        product_id: entry ? Number(entry.product.shopifyProductId) : 0,
                        title: entry ? `${entry.product.title}${variantTitle ? ` - ${variantTitle}` : ''}` : 'Bundle',
                        product_title: entry?.product.title ?? 'Bundle',
                        variant_title: variantTitle,
                        quantity: item.quantity,
                        price: unitPrice,
                        line_price: unitPrice * item.quantity,
                        image: entry ? entry.variant.image ?? entry.product.imageUrl : null,
                        properties,
                    });
                }
            }
            recount();
            changed();
            // The lines are in the cart; only the answer is lost. Retrying blindly would add them twice.
            if (failure === 'lost-response') return { status: 0, body: null, delayMs: 300, networkError: true };
            return ok({ items: state.cart.items }, 250);
        }

        if (route === '/update.js' || route === '/change.js') {
            const body = (request.body ?? {}) as { attributes?: Record<string, string>; updates?: Record<string, number> };
            if (body.attributes) state.cart.attributes = { ...state.cart.attributes, ...body.attributes };
            if (body.updates) {
                for (const [key, quantity] of Object.entries(body.updates)) {
                    const line = state.cart.items.find((item) => item.key === key);
                    if (!line) continue;
                    line.quantity = quantity;
                    line.line_price = quantity * line.price;
                }
                state.cart.items = state.cart.items.filter((item) => item.quantity > 0);
            }
            recount();
            changed();
            return ok(state.cart, 120);
        }

        if (route === '/clear.js') {
            state.cart = emptyState().cart;
            changed();
            return ok(state.cart, 50);
        }
        return null as never;
    }

    return {
        get requests() {
            return requests;
        },
        get state() {
            return state;
        },
        reset() {
            state = emptyState();
            requests.length = 0;
            changed();
        },
        handle(request) {
            const apiIndex = request.path.search(API_PREFIX);
            if (apiIndex >= 0) {
                requests.push(request);
                const path = request.path.slice(apiIndex).replace(API_PREFIX, '');
                return api(path, request);
            }
            const cartMatch = CART_ROUTE.exec(request.path);
            if (cartMatch) {
                requests.push(request);
                return cart(cartMatch[1]!.toLowerCase(), request);
            }
            return null;
        },
    };
}
