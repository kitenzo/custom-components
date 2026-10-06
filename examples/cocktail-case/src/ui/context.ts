/*
 * What every component of one mounted widget shares, in two parts so that a card is drawn again
 * only when its answer can have changed.
 *
 * `BuilderContext` holds what stays the same while the shopper picks. `SelectionContext` holds
 * the builder's snapshot, a new value on every pick. Both values are memoised by the Builder, so
 * a render of the Builder that changed neither (the nudge, the details dialog opening, a letter
 * typed into the club's email field) reaches no memoised component below it.
 */
import { createContext, useContext } from 'react';

import type { MoneyFormatter, SectionSelections, SelectionProgress, UseBundleBuilderResult } from '@kitenzo/react';

import type { Content } from '../content';
import type { ActiveFacets, FacetIndex } from '../facets';
import type { ViewModel } from '../model';
import type { Ladder } from '../tiers';

/**
 * The builder's own methods keep their identity for the life of the bundle. `blockedReason`
 * answers for the selection as it is when called, so a component that calls it while rendering
 * also reads `useSelection()`, which is what draws it again after a pick.
 */
export interface BuilderContextValue extends Pick<UseBundleBuilderResult, 'addItem' | 'updateQuantity' | 'blockedReason'> {
    /** Changes only with the bundle, the shop's settings, or what the conditions engine hides. */
    model: ViewModel;
    /** Every amount besides the total, in the total's currency and format. */
    money: MoneyFormatter;
    content: Content;
    /** Rendering in the Shopify theme editor. */
    editor: boolean;
    /** Unique per mounted widget, for element ids. */
    idPrefix: string;
    openDetails: (productId: string, sectionId: number) => void;
    /** The configured facets and each product's values in them (no facets when filters are off). */
    facets: FacetIndex;
    /** Changes when the shopper presses a chip, which redraws the grid anyway. */
    activeFacets: ActiveFacets;
    setActiveFacets: (next: ActiveFacets) => void;
}

export interface SelectionContextValue {
    selections: SectionSelections;
    progress: SelectionProgress;
    /** True while an add is in flight or unconfirmed: every control that changes the selection is held. */
    locked: boolean;
    /** The discount ladder for the current count, or null when the bundle has no tiers to climb. */
    ladder: Ladder | null;
}

export const BuilderContext = createContext<BuilderContextValue | null>(null);
export const SelectionContext = createContext<SelectionContextValue | null>(null);

export function useBuilder(): BuilderContextValue {
    const value = useContext(BuilderContext);
    if (!value) throw new Error('useBuilder() outside <BuilderContext.Provider>');
    return value;
}

export function useSelection(): SelectionContextValue {
    const value = useContext(SelectionContext);
    if (!value) throw new Error('useSelection() outside <SelectionContext.Provider>');
    return value;
}
