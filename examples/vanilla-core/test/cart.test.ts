/*
 * The add to cart without `useBundleAjaxCart`: everything the hook guaranteed, checked against the
 * mock theme cart.
 */
import { KitenzoClient, type SectionSelections } from '@kitenzo/core';
import { afterEach, describe, expect, it } from 'vitest';

import { loadFixtures } from '../dev/catalog';
import { createMockBackend, type Behaviour, type MockBackend } from '../dev/mock/backend';
import type { Fixture } from '../dev/mock/wire';
import { createCartFlow, type CartPhase, type CartState } from '../src/cart';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { routeFetchTo } from './support';

const previous = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = previous;
});

async function setUp(options: { behaviour?: Behaviour; change?: (fixture: Fixture) => Fixture; cartFetch?: (route: typeof fetch) => typeof fetch } = {}) {
    const fixture = (options.change ?? ((same) => same))(loadFixtures()[0]!);
    const backend = createMockBackend({ fixtures: [fixture], behaviour: options.behaviour });
    const route = routeFetchTo(backend);
    globalThis.fetch = route;
    const client = new KitenzoClient({ apiKey: 'kit_test_unit', baseUrl: 'http://localhost/api/headless/v1', preview: true });
    const [loaded, settings] = await Promise.all([client.getBundle(fixture.bundle.id), client.getSettings()]);
    const bundle = withRequiredVariantIds(loaded);
    const section = bundle.sections[0]!;
    const variant = (handle: string) => section.products.find((product) => product.handle === handle)!.variants[0]!.id;
    const caseOf = (picks: [string, number][]): SectionSelections => ({ [section.id]: picks.map(([handle, quantity]) => ({ variantId: variant(handle), quantity })) });
    const flow = (replace: Parameters<typeof createCartFlow>[0]['replace'] = null) => {
        const phases: CartPhase[] = [];
        const cart = createCartFlow({
            client,
            settings,
            routePrefix: '',
            replace,
            fetchImpl: options.cartFetch ? options.cartFetch(route) : route,
            onChange: (state: CartState) => phases.push(state.phase),
        });
        return { cart, phases };
    };
    return { backend, bundle, caseOf, flow };
}

const bottles = (backend: MockBackend) => backend.state.cart.items.reduce((total, item) => total + item.quantity, 0);
const configures = (backend: MockBackend) => backend.requests.filter((request) => request.path.endsWith('/configure')).length;
const bundlesIn = (backend: MockBackend) => Object.keys(JSON.parse(backend.state.cart.attributes._bundles ?? '{}'));
const instanceOf = (data: string | undefined) => data?.split('#')[2];

/** A cart route that answers `/cart/add.js` once with a dropped connection. `land` says whether the lines got in first. */
function dropFirstAdd(land: boolean) {
    return (route: typeof fetch): typeof fetch => {
        let dropped = false;
        return (async (input: RequestInfo | URL, init?: RequestInit) => {
            if (!dropped && String(input).endsWith('/cart/add.js')) {
                dropped = true;
                if (land) await route(input, init);
                throw new TypeError('Failed to fetch');
            }
            return route(input, init);
        }) as typeof fetch;
    };
}

const SIX: [string, number][] = [
    ['californian-reisling', 2],
    ['pinot-gris', 1],
    ['californian-chardonnay', 3],
];

describe('createCartFlow', () => {
    it('configures, adds the lines, then writes _bundles, and only then says "added"', async () => {
        const { backend, bundle, caseOf, flow } = await setUp();
        const { cart, phases } = flow();
        expect(await cart.add(bundle, caseOf(SIX))).toBe(true);
        expect(phases).toEqual(['configuring', 'adding', 'attributes', 'added']);
        expect(cart.state).toMatchObject({ added: true, busy: false, shopperMessage: null });
        expect(bottles(backend)).toBe(6);
        expect(new Set(backend.state.cart.items.map((item) => item.properties._bundle_data)).size).toBe(1);
        expect(bundlesIn(backend)).toEqual(['9001']);
    });

    it('takes one add at a time', async () => {
        const { backend, bundle, caseOf, flow } = await setUp();
        const { cart } = flow();
        const [first, second] = await Promise.all([cart.add(bundle, caseOf(SIX)), cart.add(bundle, caseOf(SIX))]);
        expect([first, second]).toEqual([true, false]);
        expect(configures(backend)).toBe(1);
        expect(bottles(backend)).toBe(6);
    });

    it('a refused add shows the store\'s own sentence, and the next press configures afresh', async () => {
        const { backend, bundle, caseOf, flow } = await setUp({ behaviour: { cartFailure: 422 } });
        const { cart } = flow();
        expect(await cart.add(bundle, caseOf(SIX))).toBe(false);
        expect(cart.state.phase).toBe('failed');
        // The mock names the first line's product, as Shopify names the one it refused.
        expect(cart.state.shopperMessage).toBe('You can only add 2 of Riesling to the cart.');
        // Refused outright: nothing was written, so nothing is held.
        expect(cart.state.resumable).toBe(false);
        // The diagnostic carries the route and status; that is exactly why it is never rendered.
        expect(cart.state.error?.message).toMatch(/\/cart\/add\.js responded 422/);
        await cart.add(bundle, caseOf(SIX));
        expect(configures(backend)).toBe(2);
    });

    it('a configure refusal is a sentence too', async () => {
        // The API refuses to configure a draft, whatever the client asks.
        const { bundle, caseOf, flow } = await setUp({ change: (fixture) => ({ ...fixture, bundle: { ...fixture.bundle, published: false } }) });
        const { cart } = flow();
        expect(await cart.add(bundle, caseOf(SIX))).toBe(false);
        expect(cart.state.shopperMessage).toBe('We could not add this to your cart. Please try again.');
    });

    it('a response lost after the lines landed: the next press reads the cart back and does not add them twice', async () => {
        const { backend, bundle, caseOf, flow } = await setUp({ cartFetch: dropFirstAdd(true) });
        const { cart } = flow();
        expect(await cart.add(bundle, caseOf(SIX))).toBe(false);
        expect(bottles(backend)).toBe(6);
        expect(bundlesIn(backend)).toEqual([]);
        // The widget holds the selection while this is true: the next press finishes this add.
        expect(cart.state.resumable).toBe(true);
        expect(await cart.add(bundle, caseOf(SIX))).toBe(true);
        expect(bottles(backend)).toBe(6);
        expect(configures(backend)).toBe(1);
        expect(bundlesIn(backend)).toEqual(['9001']);
    });

    it('a request lost before the lines landed: the next press adds them, once', async () => {
        const { backend, bundle, caseOf, flow } = await setUp({ cartFetch: dropFirstAdd(false) });
        const { cart } = flow();
        expect(await cart.add(bundle, caseOf(SIX))).toBe(false);
        expect(bottles(backend)).toBe(0);
        expect(await cart.add(bundle, caseOf(SIX))).toBe(true);
        expect(bottles(backend)).toBe(6);
        expect(configures(backend)).toBe(1);
    });

    it('a basket Edit replaces the case it came from: its lines and its _bundles entry go, another case stays', async () => {
        const { backend, bundle, caseOf, flow } = await setUp();
        await flow().cart.add(bundle, caseOf(SIX)); // 9001, the one being edited
        await flow().cart.add(bundle, caseOf([['pinot-gris', 6]])); // 9002, a second case
        const edited = backend.state.cart.items.find((item) => item.properties._bundle_data?.startsWith('9001#'))!;

        const { cart } = flow({ configuredBundleId: 9001, uniqueId: instanceOf(edited.properties._bundle_data) });
        expect(await cart.add(bundle, caseOf([['californian-reisling', 6]]))).toBe(true);
        const configured = new Set(backend.state.cart.items.map((item) => item.properties._bundle_data?.split('#')[0]));
        expect([...configured].sort()).toEqual(['9002', '9003']);
        expect(bundlesIn(backend).sort()).toEqual(['9002', '9003']);
        expect(bottles(backend)).toBe(12);

        // Adding again from the same page (after "Stay on this page") is a new case, not a second replacement.
        expect(await cart.add(bundle, caseOf([['californian-reisling', 6]]))).toBe(true);
        expect(bottles(backend)).toBe(18);
    });

    it('never replaces a native case without its instance id: it might be any of its duplicates', async () => {
        const { backend, bundle, caseOf, flow } = await setUp();
        await flow().cart.add(bundle, caseOf(SIX));
        const { cart } = flow({ configuredBundleId: 9001 });
        await cart.add(bundle, caseOf([['pinot-gris', 6]]));
        expect(bottles(backend)).toBe(12);
    });
});
