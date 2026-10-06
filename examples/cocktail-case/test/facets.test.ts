import { describe, expect, it } from 'vitest';

import { DEFAULT_CONTENT } from '../src/content';
import { applyFacets, facetGroups, facetLabelsOf, facetsMatched, indexFacets, parseFacetDefs, toggleFacet, type ActiveFacets, type Taggable } from '../src/facets';
import { toViewModel } from '../src/model';
import { load } from './support';

const defs = parseFacetDefs(DEFAULT_CONTENT.facets);

async function cans() {
    const { bundle, settings } = await load();
    const products = toViewModel(bundle, settings).sections[0]!.products;
    return { products, facets: indexFacets(products, defs) };
}

/** The chips for a list of tagged products, read through the index as the page reads them. */
const groupsOf = (products: Taggable[], active: ActiveFacets = {}) => facetGroups(products, indexFacets(products, defs), active);

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
        expect(chips(groupsOf((await cans()).products))).toEqual({
            Flavour: ['Fruity 5', 'Bold 4', 'Botanical 4', 'Citrus 4'],
            Strength: ['Stronger 6', 'Light 4'],
        });
    });

    it('ignores the unprefixed copies ("Fruity", "Light") a store also carries', () => {
        const products = [{ id: 'a', tags: ['Fruity', 'Light'] }, { id: 'b', tags: ['Flavor_Citrus', 'Flavor_Fruity'] }];
        expect(chips(groupsOf(products))).toEqual({ Flavour: ['Citrus 1', 'Fruity 1'] });
    });

    it('counts each chip against the OTHER facets\' selections, never its own', async () => {
        const groups = groupsOf((await cans()).products, { Flavor_: ['citrus'] });
        expect(chips(groups)).toEqual({
            Flavour: ['Fruity 5', 'Bold 4', 'Botanical 4', 'Citrus 4'],
            Strength: ['Stronger 2', 'Light 2'],
        });
        expect(groups[0]!.values.find((value) => value.key === 'citrus')?.active).toBe(true);
    });

    it('leaves out a facet with fewer than two values: it would filter nothing', () => {
        expect(groupsOf([{ id: 'a', tags: ['Strength_Light'] }])).toEqual([]);
    });

    it('matches prefixes and values without regard to case', () => {
        expect(chips(groupsOf([{ id: 'a', tags: ['flavor_fruity'] }, { id: 'b', tags: ['FLAVOR_Citrus'] }]))).toEqual({ Flavour: ['fruity 1', 'Citrus 1'] });
    });

    it('reads each product\'s tags once, when the index is built, and never again', () => {
        let reads = 0;
        const tagged = (id: string, tags: string[]): Taggable => ({
            id,
            get tags() {
                reads += 1;
                return tags;
            },
        });
        const products = [tagged('a', ['Flavor_Fruity', 'Strength_Light']), tagged('b', ['Flavor_Citrus', 'Strength_Light'])];
        const facets = indexFacets(products, defs);
        const built = reads;
        expect(built).toBeGreaterThan(0);
        const active = { Flavor_: ['citrus'] };
        expect(chips(facetGroups(products, facets, active))).toEqual({ Flavour: ['Fruity 1', 'Citrus 1'] });
        expect(applyFacets(products, facets, active, new Set())).toHaveLength(1);
        expect(facetsMatched('b', facets, active)).toBe(1);
        expect(facetLabelsOf('a', facets)).toEqual(['Fruity', 'Light']);
        expect(reads).toBe(built);
    });
});

describe('matching', () => {
    it('ORs within a facet and ANDs across facets', async () => {
        const { products, facets } = await cans();
        const either = applyFacets(products, facets, { Flavor_: ['fruity', 'citrus'] }, new Set());
        expect(either).toHaveLength(9);
        const both = applyFacets(products, facets, { Flavor_: ['fruity'], Strength_: ['light'] }, new Set());
        expect(handlesOf(both)).toEqual(['raspberry-hibiscus', 'watermelon-basil']);
    });

    it('never hides a can already in the case: it stays, marked as outside the filter', async () => {
        const { products, facets } = await cans();
        const pear = products.find((product) => product.handle === 'pear-cardamom')!;
        const shown = applyFacets(products, facets, { Strength_: ['light'] }, new Set([pear.id]));
        expect(shown.find((entry) => entry.product === pear)).toEqual({ product: pear, matches: false, inCase: true });
        expect(shown.filter((entry) => entry.matches)).toHaveLength(4);
    });

    it('no selection filters nothing', async () => {
        const { products, facets } = await cans();
        expect(applyFacets(products, facets, {}, new Set())).toHaveLength(products.length);
        expect(applyFacets(products, facets, { Flavor_: [] }, new Set())).toHaveLength(products.length);
    });

    it('counts how many active facets a can satisfies (what "Surprise me" leans on)', () => {
        const active: ActiveFacets = { Flavor_: ['citrus'], Strength_: ['light'] };
        const facets = indexFacets(
            [
                { id: 'both', tags: ['Flavor_Citrus', 'Strength_Light'] },
                { id: 'one', tags: ['Flavor_Citrus', 'Strength_Stronger'] },
                { id: 'none', tags: ['Flavor_Bold'] },
            ],
            defs,
        );
        expect(['both', 'one', 'none', 'not-on-the-page'].map((id) => facetsMatched(id, facets, active))).toEqual([2, 1, 0, 0]);
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
        const facets = indexFacets([{ id: 'a', tags: ['Flavor_Citrus', 'Citrus', 'Strength_Light', 'Flavor_Sour_Cherry'] }], defs);
        expect(facetLabelsOf('a', facets)).toEqual(['Citrus', 'Sour Cherry', 'Light']);
    });
});
