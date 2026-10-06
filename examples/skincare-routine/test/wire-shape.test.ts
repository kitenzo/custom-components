/*
 * The mock backend serves exactly the shape Kitenzo's serializer does.
 *
 * `serializer-key-paths.json` lists every key path real serializer output contained (paths, not
 * data). Every path the fixture builder emits must be one of them, and every path the serializer
 * always sends must be emitted. A fixture that drifted from the API would let the widget pass
 * every test against a payload no store will ever send.
 */
import { describe, expect, it } from 'vitest';

import { loadFixtures } from '../dev/catalog';
import { createMockBackend, type ABTest } from '../dev/mock/backend';
import real from './serializer-key-paths.json' with { type: 'json' };

function paths(value: unknown, prefix: string, out: Set<string>) {
    if (Array.isArray(value)) value.forEach((entry) => paths(entry, `${prefix}[]`, out));
    else if (value && typeof value === 'object') for (const [key, entry] of Object.entries(value)) paths(entry, `${prefix}.${key}`, out);
    else out.add(prefix);
}

/** As the key-paths file writes them: no leading dot, and `*` for the product id personalisation is keyed by. */
const asListed = (emitted: Set<string>) => [...emitted].map((path) => path.slice(1).replace(/^bundle\.personalisation\.\d+/, 'bundle.personalisation.*'));

// Fields the serializer sends only for some shops or bundles, which the captured fixtures did not
// happen to include. Each is typed in @kitenzo/core.
const OPTIONAL = [
    /^products\[\]\.variants\[\]\.(image|surcharge|presentmentPrice|presentmentCurrency|priceInShopCurrency|availableForSale)$/,
    /^products\[\]\.variants\[\]\.maxOrderableQuantity$/,
    /^bundle\.(recurringOptions|applyVariantSurcharges)/,
    /^bundle\.discount\.(tiers\[\]\.)?customText$/,
    // The serializer always sends `tags` (minus Kitenzo's own `bundle-builder-*` control tags),
    // but every product in the captured fixtures had none, and an empty list leaves no `[]` path.
    // The routine's products are tagged, so the path appears here. Typed in @kitenzo/core.
    /^products\[\]\.tags\[\]$/,
    // A bundle with no discount: the serializer sends `discount: null`.
    /^bundle\.discount$/,
];

describe('wire shape', () => {
    it('emits only paths the real serializer emits', () => {
        const known = new Set(real.paths);
        for (const fixture of loadFixtures()) {
            const emitted = new Set<string>();
            paths({ bundle: fixture.bundle, products: fixture.products, settings: fixture.settings }, '', emitted);
            const unknown = asListed(emitted).filter((path) => !known.has(path) && !OPTIONAL.some((pattern) => pattern.test(path)));
            expect(unknown).toEqual([]);
        }
    });

    it('emits every product, variant and settings field the serializer always sends', () => {
        const always = real.paths.filter((path) => /^(products\[\]\.(?!options|images)|settings\.)/.test(path) && !path.endsWith('[]'));
        const emitted = new Set<string>();
        for (const fixture of loadFixtures()) paths({ products: fixture.products, settings: fixture.settings }, '', emitted);
        const normalised = new Set([...emitted].map((path) => path.slice(1)));
        expect(always.filter((path) => !normalised.has(path))).toEqual([]);
    });

    it('adds to a bundle in an A/B test only the fields the serializer adds, and none to a bundle in no test', () => {
        const known = new Set(real.paths);
        const fixtures = loadFixtures();
        const answer = (abTest: ABTest | undefined, query: Record<string, string>) => {
            const backend = createMockBackend({ fixtures, behaviour: { abTest } });
            return backend.handle({ method: 'GET', path: `/api/headless/v1/bundles/${fixtures[0]!.bundle.id}`, query, body: null })!.body as Record<string, unknown>;
        };
        const added = (body: Record<string, unknown>) => Object.keys(body).filter((key) => key.startsWith('abTest')).sort();

        const stays = answer({ id: 5, assigned: 'a' }, { visitor_id: 'v-1' });
        const leaves = answer({ id: 5, assigned: 'b' }, { visitor_id: 'v-1' });
        expect(added(stays)).toEqual(['abTestBundleId', 'abTestId', 'abTestRouted', 'abTestVisitorId']);
        expect(added(leaves)).toEqual(['abTestBundleId', 'abTestId', 'abTestRedirectBundleId', 'abTestRedirectTo', 'abTestRouted', 'abTestVisitorId']);
        for (const body of [stays, leaves]) {
            const emitted = new Set<string>();
            paths({ bundle: body }, '', emitted);
            expect(asListed(emitted).filter((path) => !known.has(path) && !OPTIONAL.some((pattern) => pattern.test(path)))).toEqual([]);
        }
        // A client that sends no visitor id takes no part, and a shop with no test sends nothing.
        expect(added(answer({ id: 5, assigned: 'b' }, {}))).toEqual([]);
        expect(added(answer(undefined, { visitor_id: 'v-1' }))).toEqual([]);
    });
});
