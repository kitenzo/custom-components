/*
 * What every component of one routine shares, in two parts so that a card is drawn again only
 * when its answer can have changed.
 *
 * `BuilderContext` holds what stays the same while the shopper picks. `SelectionContext` holds
 * the builder's snapshot, a new value on every pick. Both values are memoised by the Routine, so
 * a render of the Routine that changed neither (the nudge, the details dialog opening) reaches no
 * memoised component below it.
 */
import { createContext, useContext } from 'react';

import type { MoneyFormatter, SectionSelections, SelectionProgress, UseBundleBuilderResult } from '@kitenzo/react';

import type { Content } from '../content';
import type { ViewModel, ViewSection } from '../model';
import type { QuizAnswer, Recommendation } from '../quiz';

/**
 * The builder's own methods keep their identity for the life of the bundle. `blockedReason` and
 * `swapBlockedReason` answer for the selection as it is when called, so a component that calls
 * one while rendering also reads `useSelection()`, which is what draws it again after a pick.
 */
export interface BuilderContextValue extends Pick<UseBundleBuilderResult, 'addItem' | 'updateQuantity' | 'swapItem' | 'blockedReason' | 'swapBlockedReason'> {
    /** Changes only with the bundle, the shop's settings, or what the conditions engine hides. */
    model: ViewModel;
    /** Every amount besides the total, in the total's currency and format. */
    money: MoneyFormatter;
    content: Content;
    /** Rendering in the Shopify theme editor. */
    editor: boolean;
    /** Unique per mounted widget, for element ids. */
    idPrefix: string;
    /** The answers the routine was built from. Empty after "Skip" or a basket Edit. */
    answers: QuizAnswer[];
    /** What the quiz put in each step, so the wizard can mark it and say why. */
    recommended: Recommendation[];
    openDetails: (productId: string, sectionId: number) => void;
    /** Called after the shopper picks in a step, for the merchant's "advance when done". */
    onPicked: (section: ViewSection) => void;
    /** Open the wizard on a step. */
    goToStep: (sectionId: number) => void;
}

export interface SelectionContextValue {
    selections: SectionSelections;
    progress: SelectionProgress;
    /** True while an add is in flight or unconfirmed: every control that changes the selection is held. */
    locked: boolean;
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
