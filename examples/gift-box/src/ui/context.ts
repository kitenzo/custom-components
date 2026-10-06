/*
 * What every component of one mounted widget shares, in three parts so that a card is drawn again
 * only when its answer can have changed.
 *
 * `BuilderContext` holds what stays the same while the shopper picks. `SelectionContext` holds
 * the builder's snapshot, a new value on every pick. `AnswersContext` holds what the shopper has
 * typed, a new value on every keystroke, and only the form, the summary and the price read it.
 * Every value is memoised by the Builder, so a render of the Builder that changed none of what a
 * component reads (the nudge, the details dialog opening, a letter typed) does not reach it.
 */
import { createContext, useContext } from 'react';

import type { BundleLineProperties, MoneyFormatter, SectionSelections, SelectionProgress, UseBundleBuilderResult } from '@kitenzo/react';

import type { Content } from '../content';
import type { ViewModel } from '../model';
import type { Answers, FieldIssue } from '../personalisation';

/**
 * The builder's own methods keep their identity for the life of the bundle. `blockedReason` and
 * `swapBlockedReason` answer for the selection as it is when called, so a component that calls
 * one while rendering also reads `useSelection()`, which is what draws it again after a pick.
 */
export interface BuilderContextValue extends Pick<UseBundleBuilderResult, 'addItem' | 'removeItem' | 'updateQuantity' | 'swapItem' | 'blockedReason' | 'swapBlockedReason'> {
    /** Changes only with the bundle, the shop's settings, or what the conditions engine hides. */
    model: ViewModel;
    /** Every amount besides the total, in the total's currency and format. */
    money: MoneyFormatter;
    content: Content;
    /** Rendering in the Shopify theme editor. */
    editor: boolean;
    /** Unique per mounted widget, so two sections on one page never share an element id. */
    idPrefix: string;
    openDetails: (productId: string, sectionId: number) => void;
}

export interface SelectionContextValue {
    selections: SectionSelections;
    progress: SelectionProgress;
    /** True while an add is in flight or unconfirmed: every control that changes the selection is held. */
    locked: boolean;
}

export interface AnswersContextValue {
    /** What the shopper has typed, per product and field. */
    answers: Answers;
    setAnswer: (productId: string, fieldId: string, value: string) => void;
    /** Everything typed, as the SDK's cart and price take it. */
    properties: BundleLineProperties;
    /** Every answer that stops the box going into the cart right now. */
    issues: FieldIssue[];
    /** The shopper tried to add with something missing: show "required" on the empty fields. */
    showMissing: boolean;
}

export const BuilderContext = createContext<BuilderContextValue | null>(null);
export const SelectionContext = createContext<SelectionContextValue | null>(null);
export const AnswersContext = createContext<AnswersContextValue | null>(null);

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

export function useAnswers(): AnswersContextValue {
    const value = useContext(AnswersContext);
    if (!value) throw new Error('useAnswers() outside <AnswersContext.Provider>');
    return value;
}

/** The element id of one field's input, which the buy button focuses when it is what is missing. */
export function fieldElementId(idPrefix: string, productId: string, fieldId: string): string {
    return `${idPrefix}-field-${productId}-${fieldId}`.replace(/[^\w-]/g, '_');
}
