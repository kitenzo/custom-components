/*
 * Load a fixture the way the widget does: through the published SDK client, against the mock
 * backend. The SDK merges and renames the wire format itself, so a test never builds a
 * `BundleDetail` by hand (a hand-built one is how a test ends up passing against a shape the API
 * has never sent).
 */
import { KitenzoClient, type BundleDetail, type ShopSettings } from '@kitenzo/core';

import { loadFixtures } from '../dev/catalog';
import { createMockBackend, type Behaviour } from '../dev/mock/backend';
import type { Fixture } from '../dev/mock/wire';

export function routeFetchTo(backend: ReturnType<typeof createMockBackend>): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), 'http://localhost');
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        const answer = backend.handle({ method: init?.method ?? 'GET', path: url.pathname, query: Object.fromEntries(url.searchParams), body });
        if (!answer) throw new Error(`Unrouted request in a test: ${url.pathname}`);
        if (answer.networkError) throw new TypeError('Failed to fetch');
        return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
}

export async function load(
    change: (fixture: Fixture) => Fixture = (fixture) => fixture,
    behaviour: Behaviour = {},
    /** The shopper's country, as the theme reports it: with a `market` behaviour, presentment prices. */
    countryCode?: string,
): Promise<{ bundle: BundleDetail; settings: ShopSettings }> {
    const fixture = change(loadFixtures()[0]!);
    const backend = createMockBackend({ fixtures: [fixture], behaviour });
    const previous = globalThis.fetch;
    globalThis.fetch = routeFetchTo(backend);
    try {
        const client = new KitenzoClient({ apiKey: 'kit_test_unit', baseUrl: 'http://localhost/api/headless/v1', countryCode });
        const [bundle, settings] = await Promise.all([client.getBundle(fixture.bundle.id), client.getSettings()]);
        return { bundle, settings };
    } finally {
        globalThis.fetch = previous;
    }
}

/** Change one product of a fixture by handle. */
export function withProduct(fixture: Fixture, handle: string, change: (product: Fixture['products'][number]) => Fixture['products'][number]): Fixture {
    return { ...fixture, products: fixture.products.map((product) => (product.handle === handle ? change(product) : product)) };
}

export function soldOut(product: Fixture['products'][number]): Fixture['products'][number] {
    return { ...product, variants: product.variants.map((variant) => ({ ...variant, available: false, maxOrderableQuantity: 0, inventoryQuantity: 0 })) };
}

/**
 * The demo bundle with one change a merchant could make: the unflavoured pouch taken out of the
 * step and included in every bundle. The demo bundle has no required product; this is how the
 * tests reach the code paths that need one.
 */
export function withRequiredUnflavoured(fixture: Fixture): Fixture {
    const unflavoured = fixture.products.find((product) => product.handle === 'unflavoured-whey-protein')!;
    return {
        ...fixture,
        bundle: {
            ...fixture.bundle,
            sections: fixture.bundle.sections.map((section) => ({
                ...section,
                products: section.products.filter((ref) => ref.shopifyProductId !== unflavoured.shopifyProductId),
            })),
            requiredProducts: [{ quantity: 1, shopifyProductId: unflavoured.shopifyProductId, variantIds: [] }],
        },
    };
}
