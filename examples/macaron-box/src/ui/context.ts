/*
 * What every component of one mounted widget shares, in two parts so that a card is drawn again
 * only when its answer can have changed.
 *
 * `BuilderContext` holds what stays the same while the shopper picks. `SelectionContext` holds
 * the builder's snapshot and the box being filled, a new value on every pick and every change of
 * box. Both values are memoised by the Builder, so a render of the Builder that changed neither
 * (the nudge, the details dialog opening) reaches no memoised component below it.
 */
import { createContext, useContext } from 'react';

import type { MoneyFormatter, SectionSelections, SelectionProgress, UseBundleBuilderResult } from '@kitenzo/react';

import type { BoxOffer, FlavourPricing, Placed } from '../box';
import type { Content } from '../content';
import type { ViewModel, ViewSection } from '../model';

/** The box the bundle sells: the step it is built in, and the sizes on offer with their prices. */
export interface Box {
    section: ViewSection;
    /** The exact counts the bundle's rules allow. Empty when the bundle sells no fixed sizes. */
    sizes: number[];
    offers: BoxOffer[];
    /** What a flavour in the box says about money: see `flavourPricing` in box.ts. */
    flavourPricing: FlavourPricing;
}

/**
 * The builder's own methods keep their identity for the life of the bundle. `blockedReason`
 * answers for the selection as it is when called, so a component that calls it while rendering
 * also reads `useSelection()`, which is what draws it again after a pick.
 */
export interface BuilderContextValue extends Pick<UseBundleBuilderResult, 'addItem' | 'removeItem' | 'updateQuantity' | 'blockedReason'> {
    /** Changes only with the bundle, the shop's settings, or what the conditions engine hides. */
    model: ViewModel;
    /** Every amount besides the total, in the total's currency and format. */
    money: MoneyFormatter;
    content: Content;
    /** Rendering in the Shopify theme editor. */
    editor: boolean;
    /** Unique per mounted widget, for element ids. */
    idPrefix: string;
    /** `null` when no step sells anything. */
    box: Box | null;
    openDetails: (productId: string, sectionId: number) => void;
}

export interface SelectionContextValue {
    selections: SectionSelections;
    progress: SelectionProgress;
    /** True while an add is in flight or unconfirmed: every control that changes the selection is held. */
    locked: boolean;
    /** One entry per macaron, in the order the shopper picked them. */
    order: Placed[];
    /** Take the macaron at this position of `order` out: that slot empties, not the newest of its flavour. */
    removeAt: (index: number) => void;
    /** The chosen size. `null` until the shopper chooses (or makes a first pick). */
    size: number | null;
    /** How many slots the tray draws: the chosen size, else the step's own maximum when it has one. */
    slots: number | null;
    /** Choose a size; a smaller box than the tray holds asks first. */
    choose: (size: number) => void;
    /** Fill every empty slot (see autofill.ts). */
    fillRest: () => void;
    /** Why the last fill came up short, if it did. */
    fillNote: string | null;
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
