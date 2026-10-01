import { describe, expect, it } from 'vitest';

import { PAPERS, artKind, cardFront, hash, initialOf, paperFor, swatchFor } from '../src/ui/art';

describe('artKind', () => {
    it('draws what the product is, from its title first and then its tags', () => {
        expect(artKind({ title: 'Engravable Brass Matchbox' })).toBe('matchbox');
        expect(artKind({ title: 'The Keepsake Gift Box' })).toBe('box');
        expect(artKind({ title: 'With Love Letterpress Card' })).toBe('card');
        expect(artKind({ title: 'Loose Leaf Tea Tin' })).toBe('tea');
        expect(artKind({ title: 'Steak Knife' })).toBe('initial');
        expect(artKind({ title: 'Midnight', tags: ['candle', 'contents'] })).toBe('candle');
    });

    it('falls back to a typeset initial, skipping markup and quotes', () => {
        expect(artKind({ title: '<img src=x onerror=1>' })).toBe('initial');
        expect(initialOf(`"maman's" blend`)).toBe('M');
        expect(initialOf('عصير')).toBe('ع');
        expect(initialOf('***')).toBe('·');
    });
});

describe('colours', () => {
    it('gives a handle the same paper on every visit, from the palette', () => {
        expect(paperFor('loose-leaf-tea-tin')).toBe(paperFor('loose-leaf-tea-tin'));
        expect(PAPERS).toContain(paperFor('anything-at-all'));
        expect(hash('a')).not.toBe(hash('b'));
    });

    it('paints a known colour name, and a stable colour for any other', () => {
        expect(swatchFor('Terracotta')).toBe(swatchFor(' terracotta '));
        expect(swatchFor('Oat')).not.toBe(swatchFor('Forest'));
        expect(swatchFor('Ultraviolet Haze')).toMatch(/^#[0-9a-f]{6}$/);
    });
});

describe('cardFront', () => {
    it('sets a card\'s greeting on its front, and leaves other titles whole', () => {
        expect(cardFront('Happy Birthday Letterpress Card')).toBe('Happy Birthday');
        expect(cardFront('Thank You Card')).toBe('Thank You');
        expect(cardFront('Card')).toBe('Card');
        expect(cardFront('Cardamom Tea')).toBe('Cardamom Tea');
    });
});
