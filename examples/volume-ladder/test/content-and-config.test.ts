import { describe, expect, it } from 'vitest';

import { cartUrl, keyProblem, normaliseRootUrl, parseBundleId, parseLayout, routePrefix } from '../src/config';
import { DEFAULT_CONTENT, fill, parseContent, text } from '../src/content';

describe('parseContent', () => {
    it('falls back to the defaults for a missing, malformed or hostile blob', () => {
        expect(parseContent(undefined)).toEqual(DEFAULT_CONTENT);
        expect(parseContent('{not json')).toEqual(DEFAULT_CONTENT);
        expect(parseContent('[1,2]')).toEqual(DEFAULT_CONTENT);
    });

    it('takes what is valid and ignores what is not, field by field', () => {
        const content = parseContent(JSON.stringify({ addToCart: "Add Maman's box", soldOut: {}, total: 42, hidePrices: 'yes', afterAdd: 'stay' }));
        expect(content.addToCart).toBe("Add Maman's box");
        expect(content.soldOut).toBe(DEFAULT_CONTENT.soldOut);
        expect(content.total).toBe(DEFAULT_CONTENT.total);
        expect(content.hidePrices).toBe(false);
        expect(content.afterAdd).toBe('stay');
    });

    it('treats blank text as "use the default"', () => {
        expect(parseContent(JSON.stringify({ addToCart: '   ' })).addToCart).toBe(DEFAULT_CONTENT.addToCart);
    });
});

describe('fill', () => {
    it('fills known placeholders and leaves unknown ones visible', () => {
        expect(fill('Add {count} more to “{step}”', { count: 2, step: 'Flavours' })).toBe('Add 2 more to “Flavours”');
        expect(text(DEFAULT_CONTENT, 'progressNext', { count: 1, discount: '15%' })).toBe('Add 1 more to save 15%');
        expect(fill('{count} and {typo}', { count: 1 })).toBe('1 and {typo}');
        expect(text(DEFAULT_CONTENT, 'onlyLeft', { count: 3 })).toBe('Only 3 left');
    });
});

describe('config', () => {
    it('refuses a key the SDK would throw on, instead of letting it white-screen the page', () => {
        expect(keyProblem('')).toBe('no-key');
        expect(keyProblem('kit_missing_key')).toBe('bad-key');
        expect(keyProblem('shpat_123')).toBe('bad-key');
        expect(keyProblem('kit_live_abc123')).toBeNull();
        expect(keyProblem('kit_test_abc123')).toBeNull();
    });

    it('reads a bundle id whole or not at all', () => {
        expect(parseBundleId('42')).toBe(42);
        expect(parseBundleId(' 42 ')).toBe(42);
        expect(parseBundleId('42x')).toBeNull();
        expect(parseBundleId('0')).toBeNull();
        expect(parseBundleId('')).toBeNull();
        expect(parseBundleId(undefined)).toBeNull();
    });

    it('reads the layout setting, and falls back to the ladder for anything it does not know', () => {
        expect(parseLayout('grid')).toBe('grid');
        expect(parseLayout(' Grid ')).toBe('grid');
        expect(parseLayout('ladder')).toBe('ladder');
        expect(parseLayout('carousel')).toBe('ladder');
        expect(parseLayout('')).toBe('ladder');
        expect(parseLayout(undefined)).toBe('ladder');
    });

    it('keeps a locale prefix on every cart route', () => {
        expect(normaliseRootUrl('/')).toBe('/');
        expect(normaliseRootUrl('/en-gb/')).toBe('/en-gb');
        expect(normaliseRootUrl('//evil.example')).toBe('/');
        expect(normaliseRootUrl('https://evil.example')).toBe('/');
        expect(routePrefix('/')).toBe('');
        expect(cartUrl('/')).toBe('/cart');
        expect(cartUrl('/de')).toBe('/de/cart');
    });
});
