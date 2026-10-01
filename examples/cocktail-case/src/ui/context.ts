import { createContext, useContext } from 'react';

import type { UseRecurringPlanResult } from '@kitenzo/react';

import type { Content } from '../content';
import type { ActiveFacets, FacetDef } from '../facets';
import type { ViewModel } from '../model';
import type { Money } from '../money';
import type { Selection } from '../selection';
import type { Ladder } from '../tiers';

export interface BuilderContextValue {
    model: ViewModel;
    selection: Selection;
    money: Money;
    content: Content;
    /** Rendering in the Shopify theme editor. */
    editor: boolean;
    /** True while an add is in flight or unconfirmed: every control that changes the selection is held. */
    locked: boolean;
    /** Unique per mounted widget, for element ids. */
    idPrefix: string;
    openDetails: (productId: string, sectionId: number) => void;
    /** The configured facets (empty when the merchant turned filters off). */
    facetDefs: FacetDef[];
    activeFacets: ActiveFacets;
    setActiveFacets: (next: ActiveFacets) => void;
    /** The discount ladder for the current count, or null when the bundle has no tiers. */
    ladder: Ladder | null;
    plan: UseRecurringPlanResult;
}

export const BuilderContext = createContext<BuilderContextValue | null>(null);

export function useBuilder(): BuilderContextValue {
    const value = useContext(BuilderContext);
    if (!value) throw new Error('useBuilder() outside <BuilderContext.Provider>');
    return value;
}
