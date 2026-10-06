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
): Promise<{ bundle: BundleDetail; settings: ShopSettings }> {
    const fixture = change(loadFixtures()[0]!);
    const backend = createMockBackend({ fixtures: [fixture], behaviour });
    const previous = globalThis.fetch;
    globalThis.fetch = routeFetchTo(backend);
    try {
        const client = new KitenzoClient({ apiKey: 'kit_test_unit', baseUrl: 'http://localhost/api/headless/v1' });
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
 * Take a product out of its step and make it a required product carried in every bundle. The
 * routine bundle has no required product of its own, and the model's required product rules
 * still have to be proved against one.
 */
export function asRequired(fixture: Fixture, handle: string): Fixture {
    const product = fixture.products.find((entry) => entry.handle === handle)!;
    return {
        ...fixture,
        bundle: {
            ...fixture.bundle,
            sections: fixture.bundle.sections.map((section) => ({
                ...section,
                products: section.products.filter((ref) => ref.shopifyProductId !== product.shopifyProductId),
            })),
            requiredProducts: [{ quantity: 1, shopifyProductId: product.shopifyProductId, variantIds: [] }],
        },
    };
}
