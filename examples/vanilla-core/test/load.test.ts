import { KitenzoClient } from '@kitenzo/core';
import { afterEach, describe, expect, it } from 'vitest';

import { loadFixtures } from '../dev/catalog';
import { createMockBackend, type Behaviour } from '../dev/mock/backend';
import { loadBundle, loadEdit, NOT_EDITING } from '../src/load';
import { routeFetchTo } from './support';

const previous = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = previous;
});

function setUp(behaviour: Behaviour = {}) {
    const fixture = loadFixtures()[0]!;
    const backend = createMockBackend({ fixtures: [fixture], behaviour });
    globalThis.fetch = routeFetchTo(backend);
    const client = new KitenzoClient({ apiKey: 'kit_test_unit', baseUrl: 'http://localhost/api/headless/v1' });
    return { client, backend, bundleId: fixture.bundle.id };
}

/** Configure a case the way an add does, so the API has something saved for the cart's "Edit". */
async function savedCase(client: KitenzoClient, bundleId: number) {
    const loaded = await loadBundle(client, bundleId, '');
    if (!loaded.ok) throw new Error('load failed');
    const section = loaded.bundle.sections[0]!;
    const riesling = section.products.find((product) => product.handle === 'californian-reisling')!.variants[0]!;
    const result = await client.submitBundle(loaded.bundle, { [section.id]: [{ variantId: riesling.id, quantity: 6 }] });
    return { bundle: loaded.bundle, section, riesling, configured: result.configuredBundleId };
}

describe('loadBundle', () => {
    it('loads the bundle and the settings together', async () => {
        const { client, bundleId } = setUp();
        const loaded = await loadBundle(client, bundleId, '');
        expect(loaded.ok && loaded.bundle.name).toBe('Mixed case of 6');
        expect(loaded.ok && loaded.settings.moneyFormat).toBe('£{{amount}}');
        expect(loaded.ok && loaded.edit).toEqual(NOT_EDITING);
    });

    it('reports the status, so a 404 can read as "not available" and anything else as "try again"', async () => {
        expect(await loadBundle(setUp({ bundleFailure: 404 }).client, 2007, '')).toMatchObject({ ok: false, status: 404 });
        expect(await loadBundle(setUp({ bundleFailure: 500 }).client, 2007, '')).toMatchObject({ ok: false, status: 500 });
        expect(await loadBundle(setUp({ bundleFailure: 'network' }).client, 2007, '')).toMatchObject({ ok: false, status: null });
    });
});

describe('loadEdit', () => {
    it('restores a saved case and arms its replacement, instance id included', async () => {
        const { client, bundleId } = setUp();
        const { bundle, section, riesling, configured } = await savedCase(client, bundleId);
        const edit = await loadEdit(client, bundle, `?edit=${configured}&edit_uid=abc123`);
        expect(edit.isEditing).toBe(true);
        expect(edit.selections).toEqual({ [section.id]: [{ variantId: riesling.id, quantity: 6 }] });
        expect(edit.replace).toMatchObject({ configuredBundleId: configured, uniqueId: 'abc123' });
    });

    it('starts empty, and replaces nothing, when the saved case is not this bundle\'s or cannot be found', async () => {
        const { client, bundleId } = setUp();
        const { bundle } = await savedCase(client, bundleId);
        const other = await loadEdit(client, { ...bundle, id: 999 }, '?edit=9001&edit_uid=abc123');
        expect(other).toEqual({ ...NOT_EDITING, isEditing: true });
        const unknown = await loadEdit(client, bundle, '?edit=424242&edit_uid=abc123');
        expect(unknown).toEqual({ ...NOT_EDITING, isEditing: true });
    });

    it('is not editing when the page was not opened from the cart', async () => {
        const { client, bundleId } = setUp();
        const { bundle } = await savedCase(client, bundleId);
        expect(await loadEdit(client, bundle, '?utm_source=email')).toBe(NOT_EDITING);
    });
});
