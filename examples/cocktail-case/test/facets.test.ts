import { describe, expect, it } from 'vitest';

import { DEFAULT_CONTENT } from '../src/content';
import { applyFacets, facetGroups, facetLabelsOf, facetsMatched, matchesFacets, parseFacetDefs, toggleFacet, type ActiveFacets } from '../src/facets';
import { toViewModel } from '../src/model';
import { load } from './support';

const defs = parseFacetDefs(DEFAULT_CONTENT.facets);

async function cans() {
    const { bundle, settings } = await load();
    return toViewModel(bundle, { settings }).sections[0]!.products;
}

const chips = (groups: ReturnType<typeof facetGroups>) => Object.fromEntries(groups.map((group) => [group.label, group.values.map((value) => `${value.label} ${value.count}`)]));
const handlesOf = (list: { product: { handle: string } }[]) => list.map((entry) => entry.product.handle).sort();

describe('parseFacetDefs', () => {
    it('reads the theme setting: one facet per line, prefix = label', () => {
        expect(defs).toEqual([
            { prefix: 'Flavor_', label: 'Flavour' },
            { prefix: 'Strength_', label: 'Strength' },
        ]);
    });

    it('keeps the well-formed lines of a half-edited setting', () => {
        expect(parseFacetDefs('Flavor_ = Flavour\n\n  = Orphan label\nflavor_ = Duplicate\nOrigin_\nABV- = Strength = high')).toEqual([
            { prefix: 'Flavor_', label: 'Flavour' },
            { prefix: 'Origin_', label: 'Origin' },
            { prefix: 'ABV-', label: 'Strength = high' },
        ]);
    });
});

describe('facetGroups', () => {
    it('makes chips only from prefixed tags, in the order the merchant\'s products first carry them, with a count each', async () => {
        expect(chips(facetGroups(await cans(), defs, {}))).toEqual({
            Flavour: ['Fruity 5', 'Bold 4', 'Botanical 4', 'Citrus 4'],
            Strength: ['Stronger 6', 'Light 4'],
        });
    });

    it('ignores the unprefixed copies ("Fruity", "Light") a store also carries', () => {
        const products = [{ id: 'a', tags: ['Fruity', 'Light'] }, { id: 'b', tags: ['Flavor_Citrus', 'Flavor_Fruity'] }];
        expect(chips(facetGroups(products, defs, {}))).toEqual({ Flavour: ['Citrus 1', 'Fruity 1'] });
    });

    it('counts each chip against the OTHER facets\' selections, never its own', async () => {
        const groups = facetGroups(await cans(), defs, { Flavor_: ['citrus'] });
        expect(chips(groups)).toEqual({
            Flavour: ['Fruity 5', 'Bold 4', 'Botanical 4', 'Citrus 4'],
            Strength: ['Stronger 2', 'Light 2'],
        });
        expect(groups[0]!.values.find((value) => value.key === 'citrus')?.active).toBe(true);
    });

    it('leaves out a facet with fewer than two values: it would filter nothing', () => {
        expect(facetGroups([{ id: 'a', tags: ['Strength_Light'] }], defs, {})).toEqual([]);
    });

    it('matches prefixes and values without regard to case', () => {
        expect(chips(facetGroups([{ id: 'a', tags: ['flavor_fruity'] }, { id: 'b', tags: ['FLAVOR_Citrus'] }], defs, {}))).toEqual({ Flavour: ['fruity 1', 'Citrus 1'] });
    });
});

describe('matching', () => {
    it('ORs within a facet and ANDs across facets', async () => {
        const products = await cans();
        const either = applyFacets(products, defs, { Flavor_: ['fruity', 'citrus'] }, new Set());
        expect(either).toHaveLength(9);
        const both = applyFacets(products, defs, { Flavor_: ['fruity'], Strength_: ['light'] }, new Set());
        expect(handlesOf(both)).toEqual(['raspberry-hibiscus', 'watermelon-basil']);
    });

    it('never hides a can already in the case: it stays, marked as outside the filter', async () => {
        const products = await cans();
        const pear = products.find((product) => product.handle === 'pear-cardamom')!;
        const shown = applyFacets(products, defs, { Strength_: ['light'] }, new Set([pear.id]));
        expect(shown.find((entry) => entry.product === pear)).toEqual({ product: pear, matches: false, inCase: true });
        expect(shown.filter((entry) => entry.matches)).toHaveLength(4);
    });

    it('no selection filters nothing', async () => {
        const products = await cans();
        expect(applyFacets(products, defs, {}, new Set())).toHaveLength(products.length);
        expect(matchesFacets([], defs, { Flavor_: [] })).toBe(true);
    });

    it('counts how many active facets a can satisfies (what "Surprise me" leans on)', () => {
        const active: ActiveFacets = { Flavor_: ['citrus'], Strength_: ['light'] };
        expect(facetsMatched(['Flavor_Citrus', 'Strength_Light'], defs, active)).toBe(2);
        expect(facetsMatched(['Flavor_Citrus', 'Strength_Stronger'], defs, active)).toBe(1);
        expect(facetsMatched(['Flavor_Bold'], defs, active)).toBe(0);
    });
});

describe('toggleFacet', () => {
    it('adds and removes a value, and drops a facet once it is empty', () => {
        const one = toggleFacet({}, 'Flavor_', 'fruity');
        expect(one).toEqual({ Flavor_: ['fruity'] });
        expect(toggleFacet(one, 'Flavor_', 'citrus')).toEqual({ Flavor_: ['fruity', 'citrus'] });
        expect(toggleFacet(one, 'Flavor_', 'fruity')).toEqual({});
    });
});

describe('facetLabelsOf', () => {
    it('lists a product\'s values for the small tags on its card', () => {
        expect(facetLabelsOf(['Flavor_Citrus', 'Citrus', 'Strength_Light', 'Flavor_Sour_Cherry'], defs)).toEqual(['Citrus', 'Sour Cherry', 'Light']);
    });
});
