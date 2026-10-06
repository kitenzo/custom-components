/*
 * Filter chips, generated from product tags.
 *
 * A merchant who wants shoppers to filter by flavour tags their products `Flavor_Fruity`,
 * `Flavor_Citrus`, and names the prefix in the theme editor ("Flavor_ = Flavour"). Every tag that
 * starts with a configured prefix becomes a chip in that facet; every other tag is ignored. That
 * is what keeps a store's housekeeping tags ("Fruity", "Sale", "bundle-builder-…") out of the
 * filters, and why no facet or value is ever hardcoded here.
 *
 * The rules a shopper expects from a faceted filter:
 *
 *   - within one facet, chips are alternatives (Fruity OR Citrus);
 *   - across facets, they narrow (Fruity AND Light);
 *   - a chip's count is how many products you would see with that chip on and every other facet
 *     as it is, so a count never promises a result the next tap does not deliver;
 *   - a product already in the case is never hidden by a filter. Filtering is a way to find the
 *     next can, not a way to lose sight of the ones you chose (and their - buttons).
 *
 * Pure functions only: the UI holds the active state and renders what these return. A product's
 * tags are read once (`indexFacets`); every question after that is a lookup.
 */

export interface FacetDef {
    /** The tag prefix, as the merchant typed it: `Flavor_`. Matched without regard to case. */
    prefix: string;
    /** What the shopper reads: `Flavour`. */
    label: string;
}

/** Selected values per facet prefix. A facet with no entry (or an empty one) does not filter. */
export type ActiveFacets = Record<string, string[]>;

interface TagValue {
    /** Lowercased, the identity of the chip. */
    key: string;
    /** The tag's remainder as first written, underscores read as spaces: `Fruity`. */
    label: string;
}

export interface FacetValue extends TagValue {
    count: number;
    active: boolean;
}

export interface FacetGroup {
    prefix: string;
    label: string;
    values: FacetValue[];
}

export interface Taggable {
    id: string;
    tags: string[];
}

/**
 * The configured facets and every product's values in each, by product id then facet prefix.
 * Built once for the products on the page, so a pick or a pressed chip reads no tag again.
 */
export interface FacetIndex {
    /** Empty when the merchant turned filters off. */
    defs: FacetDef[];
    byProduct: ReadonlyMap<string, Record<string, TagValue[]>>;
}

/**
 * The theme setting, one facet per line: `Flavor_ = Flavour`. A line without `=` uses the prefix
 * itself as the label, minus a trailing separator. Blank and repeated lines are skipped, so a
 * half-edited setting still yields the facets that are well formed.
 */
export function parseFacetDefs(raw: string): FacetDef[] {
    const defs: FacetDef[] = [];
    for (const line of raw.split(/\r?\n/)) {
        const [rawPrefix = '', ...rest] = line.split('=');
        const prefix = rawPrefix.trim();
        if (!prefix) continue;
        if (defs.some((def) => def.prefix.toLowerCase() === prefix.toLowerCase())) continue;
        const label = rest.join('=').trim() || prefix.replace(/[\s_:\-/]+$/, '') || prefix;
        defs.push({ prefix, label });
    }
    return defs;
}

function valuesOf(tags: string[], def: FacetDef): TagValue[] {
    const prefix = def.prefix.toLowerCase();
    const values: TagValue[] = [];
    for (const tag of tags) {
        if (!tag.toLowerCase().startsWith(prefix)) continue;
        const label = tag.slice(def.prefix.length).replace(/_/g, ' ').trim();
        if (!label) continue;
        const key = label.toLowerCase();
        if (!values.some((value) => value.key === key)) values.push({ key, label });
    }
    return values;
}

export function indexFacets(products: Taggable[], defs: FacetDef[]): FacetIndex {
    return { defs, byProduct: new Map(products.map((product) => [product.id, Object.fromEntries(defs.map((def) => [def.prefix, valuesOf(product.tags, def)]))])) };
}

function own(facets: FacetIndex, productId: string, def: FacetDef): TagValue[] {
    return facets.byProduct.get(productId)?.[def.prefix] ?? [];
}

function selected(active: ActiveFacets, def: FacetDef): string[] {
    return active[def.prefix] ?? [];
}

/** Whether one facet lets this product through: no selection, or any selected value matches. */
function passes(facets: FacetIndex, productId: string, def: FacetDef, active: ActiveFacets): boolean {
    const wanted = selected(active, def);
    return wanted.length === 0 || own(facets, productId, def).some((value) => wanted.includes(value.key));
}

/** How many filtering facets this product satisfies. "Surprise me" leans toward the higher. */
export function facetsMatched(productId: string, facets: FacetIndex, active: ActiveFacets): number {
    return facets.defs.filter((def) => selected(active, def).length > 0 && passes(facets, productId, def, active)).length;
}

export function isFiltering(facets: FacetIndex, active: ActiveFacets): boolean {
    return facets.defs.some((def) => selected(active, def).length > 0);
}

/**
 * The chips to draw, with their counts. A facet no product carries is left out, and so is a
 * facet with a single value: a filter with one option filters nothing.
 */
export function facetGroups(products: { id: string }[], facets: FacetIndex, active: ActiveFacets): FacetGroup[] {
    return facets.defs.flatMap<FacetGroup>((def) => {
        // Counted against every OTHER facet's selection: within a facet the chips are
        // alternatives, so this facet's own selection must not shrink its own counts.
        const others = facets.defs.filter((other) => other !== def);
        const seen = new Map<string, FacetValue>();
        const chosen = selected(active, def);
        for (const product of products) {
            const counted = others.every((other) => passes(facets, product.id, other, active));
            for (const value of own(facets, product.id, def)) {
                const chip = seen.get(value.key) ?? { ...value, count: 0, active: chosen.includes(value.key) };
                if (counted) chip.count += 1;
                seen.set(value.key, chip);
            }
        }
        return seen.size < 2 ? [] : [{ prefix: def.prefix, label: def.label, values: [...seen.values()] }];
    });
}

/** Turn one chip on or off. Returns a new object; an emptied facet is removed. */
export function toggleFacet(active: ActiveFacets, prefix: string, key: string): ActiveFacets {
    const current = active[prefix] ?? [];
    const next = current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key];
    const { [prefix]: _dropped, ...rest } = active;
    return next.length > 0 ? { ...rest, [prefix]: next } : rest;
}

interface Filtered<T> {
    product: T;
    /** Passes every facet (OR within a facet, AND across facets). False for a product shown only because it is in the case. */
    matches: boolean;
    inCase: boolean;
}

/**
 * What the grid shows, in the merchant's order: every product that passes the filters, and every
 * product in the case whether it passes or not.
 */
export function applyFacets<T extends { id: string }>(products: T[], facets: FacetIndex, active: ActiveFacets, inCase: ReadonlySet<string>): Filtered<T>[] {
    return products.flatMap((product) => {
        const matches = facets.defs.every((def) => passes(facets, product.id, def, active));
        const chosen = inCase.has(product.id);
        return matches || chosen ? [{ product, matches, inCase: chosen }] : [];
    });
}

/** The labels of a product's values in each facet, for the small tags on a card. */
export function facetLabelsOf(productId: string, facets: FacetIndex): string[] {
    return facets.defs.flatMap((def) => own(facets, productId, def).map((value) => value.label));
}
