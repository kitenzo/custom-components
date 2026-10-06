import { KitenzoClient } from '@kitenzo/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadFixtures } from '../dev/catalog';
import { createMockBackend, variantBundleId, type Behaviour, type MockBackend } from '../dev/mock/backend';
import { loadBundle, recordImpression } from '../src/load';
import { fakeWindow, routeFetchTo } from './support';

const PAGE = 'https://shop.example/products/mixed-case';

afterEach(() => {
    vi.unstubAllGlobals();
});

function setUp(behaviour: Behaviour = {}) {
    const fixture = loadFixtures()[0]!;
    const backend = createMockBackend({ fixtures: [fixture], behaviour });
    vi.stubGlobal('fetch', routeFetchTo(backend));
    const client = new KitenzoClient({ apiKey: 'kit_test_unit', baseUrl: 'http://localhost/api/headless/v1' });
    return { client, backend, bundleId: fixture.bundle.id };
}

/** What the widget posted to count a shopper, oldest first. */
const impressions = (backend: MockBackend) => backend.requests.filter((request) => request.path.endsWith('/ab-tests/impression')).map((request) => request.body);
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

async function ready(client: KitenzoClient, bundleId: number, search = '') {
    const loaded = await loadBundle(client, bundleId, search);
    if (loaded.state !== 'ready') throw new Error(`load ended ${loaded.state}`);
    return loaded;
}

/** Configure a case the way an add does, so the API has something saved for the cart's "Edit". */
async function savedCase(client: KitenzoClient, bundleId: number) {
    const { bundle } = await ready(client, bundleId);
    const section = bundle.sections[0]!;
    const riesling = section.products.find((product) => product.handle === 'californian-reisling')!.variants[0]!;
    const result = await client.submitBundle(bundle, { [section.id]: [{ variantId: riesling.id, quantity: 6 }] });
    return { section, riesling, configured: result.configuredBundleId };
}

describe('loadBundle', () => {
    it('loads the bundle and the settings together', async () => {
        const { client, bundleId } = setUp();
        const loaded = await ready(client, bundleId);
        expect(loaded.bundle.name).toBe('Mixed case of 6');
        expect(loaded.settings.moneyFormat).toBe('£{{amount}}');
        expect(loaded.edit).toMatchObject({ isEditing: false, selections: null, replace: null });
    });

    it('reports the status, so a 404 can read as "not available" and anything else as "try again"', async () => {
        expect(await loadBundle(setUp({ bundleFailure: 404 }).client, 2007, '')).toMatchObject({ state: 'failed', status: 404 });
        expect(await loadBundle(setUp({ bundleFailure: 500 }).client, 2007, '')).toMatchObject({ state: 'failed', status: 500 });
        expect(await loadBundle(setUp({ bundleFailure: 'network' }).client, 2007, '')).toMatchObject({ state: 'failed', status: null });
    });
});

describe('the cart\'s "Edit"', () => {
    it('restores a saved case and arms its replacement, instance id included', async () => {
        const { client, bundleId } = setUp();
        const { section, riesling, configured } = await savedCase(client, bundleId);
        const { edit } = await ready(client, bundleId, `?edit=${configured}&edit_uid=abc123`);
        expect(edit.isEditing).toBe(true);
        expect(edit.selections).toEqual({ [section.id]: [{ variantId: riesling.id, quantity: 6 }] });
        expect(edit.replace).toMatchObject({ configuredBundleId: configured, uniqueId: 'abc123' });
    });

    it('starts empty, and replaces nothing, when the saved case cannot be found', async () => {
        const { client, bundleId } = setUp();
        await savedCase(client, bundleId);
        const { edit } = await ready(client, bundleId, '?edit=424242&edit_uid=abc123');
        expect(edit).toMatchObject({ isEditing: true, selections: null, replace: null });
    });

    it('is not editing when the page was not opened from the cart', async () => {
        const { client, bundleId } = setUp();
        expect((await ready(client, bundleId, '?utm_source=email')).edit.isEditing).toBe(false);
    });

    it('reads nothing from the theme\'s cart: the widget has no use for what was typed into the case', async () => {
        const { client, bundleId, backend } = setUp();
        const { configured } = await savedCase(client, bundleId);
        await ready(client, bundleId, `?edit=${configured}&edit_uid=abc123`);
        expect(backend.requests.filter((request) => request.path.includes('/cart'))).toEqual([]);
    });
});

describe('an A/B test', () => {
    // A redirect and a remembered visitor are things a page does, so these run with a window to
    // watch: where it was sent, and what it stored.
    let page: ReturnType<typeof fakeWindow>;
    beforeEach(() => {
        page = fakeWindow(PAGE);
        vi.stubGlobal('window', page);
    });

    // The mock assigns every shopper the variant the test names; Kitenzo hashes the visitor id.
    const assignedA: Behaviour = { abTest: { id: 5, assigned: 'a' } };
    const assignedB: Behaviour = { abTest: { id: 5, assigned: 'b', pageB: '/products/case-b' } };

    it('sends a shopper assigned the other variant to its page, and draws nothing here', async () => {
        const { client, bundleId, backend } = setUp(assignedB);
        expect(await loadBundle(client, bundleId, '')).toEqual({ state: 'redirecting' });
        expect(page.replaced).toEqual(['/products/case-b']);
        // The SDK sent the visitor id by itself, and remembers the test for the page it sent them to.
        const asked = backend.requests.find((request) => request.path.endsWith(`/bundles/${bundleId}`))!;
        expect(asked.query.visitor_id).toBeTruthy();
        expect(asked.query.visitor_id).toBe(page.localStorage.getItem('ab_test_visitor_id'));
        expect(page.localStorage.getItem('kitenzo_ab_routed')).toBe('5');
    });

    it('sends nobody anywhere once the widget that asked is gone', async () => {
        // The theme editor unloaded the section, or the theme dropped it from the page, mid-load.
        const { client, bundleId } = setUp(assignedB);
        expect(await loadBundle(client, bundleId, '', () => true)).toEqual({ state: 'cancelled' });
        expect(page.replaced).toEqual([]);
        expect(page.localStorage.getItem('kitenzo_ab_routed')).toBeNull();
    });

    it('counts the impression of a routed shopper, by the id the assignment was made from', async () => {
        const { client, bundleId, backend } = setUp(assignedA);
        const { bundle } = await ready(client, bundleId);
        expect(page.replaced).toEqual([]);
        // Loading counts nothing: the impression waits for the case to be on screen.
        expect(impressions(backend)).toEqual([]);
        recordImpression(client, bundle);
        const visitorId = page.localStorage.getItem('ab_test_visitor_id');
        await vi.waitFor(() => expect(impressions(backend)).toEqual([{ bundleId, visitorId }]));
        expect(backend.state.visitors).toEqual([{ testId: 5, bundleId, visitorId }]);
    });

    it('counts nothing for a bundle in no test, or for a shopper who reached the other variant\'s page by themselves', async () => {
        const plain = setUp();
        recordImpression(plain.client, (await ready(plain.client, plain.bundleId)).bundle);
        await settled();
        expect(impressions(plain.backend)).toEqual([]);

        // Only a shopper the test sent to B is measured there. One who was sent is counted, so
        // the silence above is the widget's doing and not a backend that counts nobody.
        const { client, bundleId, backend } = setUp(assignedB);
        const variant = variantBundleId(bundleId);
        recordImpression(client, (await ready(client, variant)).bundle);
        await settled();
        expect(impressions(backend)).toEqual([]);
        page.localStorage.setItem('kitenzo_ab_routed', '5');
        recordImpression(client, (await ready(client, variant)).bundle);
        await vi.waitFor(() => expect(impressions(backend)).toEqual([{ bundleId: variant, visitorId: page.localStorage.getItem('ab_test_visitor_id') }]));
    });

    it('never redirects an edit opened from the cart, and does not credit this variant with it', async () => {
        const { client, bundleId, backend } = setUp(assignedB);
        vi.stubGlobal('window', (page = fakeWindow(`${PAGE}?edit=9001&edit_uid=abc123`)));
        const { bundle } = await ready(client, bundleId, '?edit=9001&edit_uid=abc123');
        expect(page.replaced).toEqual([]);
        recordImpression(client, bundle);
        await settled();
        expect(impressions(backend)).toEqual([]);
    });
});
