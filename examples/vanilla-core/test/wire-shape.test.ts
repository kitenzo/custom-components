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
import real from './serializer-key-paths.json' with { type: 'json' };

function paths(value: unknown, prefix: string, out: Set<string>) {
    if (Array.isArray(value)) value.forEach((entry) => paths(entry, `${prefix}[]`, out));
    else if (value && typeof value === 'object') for (const [key, entry] of Object.entries(value)) paths(entry, `${prefix}.${key}`, out);
    else out.add(prefix);
}

// Fields the serializer sends only for some shops or bundles, which the captured fixtures did not
// happen to include. Each is typed in @kitenzo/core.
const OPTIONAL = [
    /^products\[\]\.variants\[\]\.(image|surcharge|presentmentPrice|presentmentCurrency|priceInShopCurrency|availableForSale)$/,
    /^products\[\]\.variants\[\]\.maxOrderableQuantity$/,
    // The captured products happened to have no tags; the serializer sends them as a list of strings.
    /^products\[\]\.tags\[\]$/,
    /^bundle\.(personalisation|recurringOptions|applyVariantSurcharges)/,
    /^bundle\.discount\.(tiers\[\]\.)?customText$/,
    // A bundle with no discount: the serializer sends `discount: null`.
    /^bundle\.discount$/,
];

describe('wire shape', () => {
    it('emits only paths the real serializer emits', () => {
        const known = new Set(real.paths);
        for (const fixture of loadFixtures()) {
            const emitted = new Set<string>();
            paths({ bundle: fixture.bundle, products: fixture.products, settings: fixture.settings }, '', emitted);
            const unknown = [...emitted].map((path) => path.slice(1)).filter((path) => !known.has(path) && !OPTIONAL.some((pattern) => pattern.test(path)));
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
});
