/*
 * The filter chips. Facets and values come from the products' tags (src/facets.ts); this draws
 * them and nothing more.
 *
 * Chips are toggle buttons (`aria-pressed`), not checkboxes styled as pills, so a screen reader
 * says "Fruity, 5, toggle button, pressed". A chip whose count is 0 stays pressable: pressing it
 * shows the "nothing matches" line and a way out, which explains more than a dead chip would.
 */
import { text } from '../content';
import { facetGroups, isFiltering, toggleFacet, type Taggable } from '../facets';
import { useBuilder } from './context';
import { CloseIcon } from './Icons';

export function FacetBar({ products }: { products: Taggable[] }) {
    const { content, facetDefs, activeFacets, setActiveFacets } = useBuilder();
    const groups = facetGroups(products, facetDefs, activeFacets);
    if (groups.length === 0) return null;
    const filtering = isFiltering(facetDefs, activeFacets);

    return (
        <div className="ckc-facets" role="group" aria-label={text(content, 'filterLabel')} data-testid="ckc-facets">
            {groups.map((group) => (
                <div key={group.prefix} className="ckc-facets__group" role="group" aria-label={group.label}>
                    <span className="ckc-facets__label" aria-hidden="true">
                        {group.label}
                    </span>
                    <div className="ckc-facets__chips">
                        {group.values.map((value) => (
                            <button
                                key={value.key}
                                type="button"
                                className={`ckc-chip${value.active ? ' ckc-chip--active' : ''}`}
                                aria-pressed={value.active}
                                data-ckc-facet={`${group.prefix}${value.key}`}
                                onClick={() => setActiveFacets(toggleFacet(activeFacets, group.prefix, value.key))}
                            >
                                <span>{value.label}</span>
                                <span className="ckc-chip__count">{value.count}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
            {filtering ? (
                <button type="button" className="ckc-facets__clear" onClick={() => setActiveFacets({})} data-testid="ckc-clear-filters">
                    <CloseIcon />
                    {text(content, 'clearFilters')}
                </button>
            ) : null}
        </div>
    );
}
