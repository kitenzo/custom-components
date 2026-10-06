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
 * Make one of the fixture's products required: in every case, priced into it, never the
 * shopper's choice. The wine case has no required product, but the widget must still handle one,
 * so the tests that need it add one at the wire level, exactly as the API would serialise it
 * (`variantIds: []` means "any variant").
 */
export function withRequired(fixture: Fixture, handle: string, quantity = 1): Fixture {
    const product = fixture.products.find((entry) => entry.handle === handle)!;
    return {
        ...fixture,
        bundle: {
            ...fixture.bundle,
            sections: fixture.bundle.sections.map((section) => ({ ...section, products: section.products.filter((ref) => ref.shopifyProductId !== product.shopifyProductId) })),
            requiredProducts: [{ quantity, shopifyProductId: product.shopifyProductId, variantIds: [] }],
        },
    };
}

type Rule = Fixture['bundle']['limitRules'][number];

/** A count rule as the API serialises it; `sectionId` null for the whole bundle. */
export function countRule(operation: Rule['operation'], value: number, sectionId: number | null): Rule {
    return { operation, sectionId, type: 'total-number-of-products', value: value.toFixed(2) };
}

/**
 * Split the case into two steps: the last two wines move to a second step of their own. The wine
 * case has one step, but the widget draws any number, so the tests that need two make them at the
 * wire level. `rules` is given the two steps' ids and replaces the bundle's limit rules.
 */
export function withTwoSteps(fixture: Fixture, rules: (first: number, second: number) => Rule[]): Fixture {
    const step = fixture.bundle.sections[0]!;
    const second = { ...step, id: step.id + 1, name: 'And for the cellar', order: step.order + 1, products: step.products.slice(-2) };
    return {
        ...fixture,
        bundle: { ...fixture.bundle, sections: [{ ...step, products: step.products.slice(0, -2) }, second], limitRules: rules(step.id, second.id) },
    };
}

/** As much of a browser window as the SDK's A/B helpers read: where the page is, and its storage. */
export function fakeWindow(href: string) {
    const url = new URL(href);
    const storage = () => {
        const held = new Map<string, string>();
        return { getItem: (key: string) => held.get(key) ?? null, setItem: (key: string, value: string) => void held.set(key, value), removeItem: (key: string) => void held.delete(key) };
    };
    const replaced: string[] = [];
    return {
        location: { pathname: url.pathname, search: url.search, hash: url.hash, replace: (to: string) => void replaced.push(to) },
        localStorage: storage(),
        sessionStorage: storage(),
        /** Where the page was sent, in order. */
        replaced,
    };
}
