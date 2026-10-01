import { createContext, useContext } from 'react';

import type { Content } from '../content';
import type { ViewModel } from '../model';
import type { Money } from '../money';
import type { Answers, FieldIssue } from '../personalisation';
import type { Selection } from '../selection';

export interface BuilderContextValue {
    model: ViewModel;
    selection: Selection;
    money: Money;
    content: Content;
    /** Rendering in the Shopify theme editor. */
    editor: boolean;
    /** True while an add is in flight or unconfirmed: every control that changes the selection is held. */
    locked: boolean;
    openDetails: (productId: string, sectionId: number) => void;
    /** What the shopper has typed, per product and field. */
    answers: Answers;
    setAnswer: (productId: string, fieldId: string, value: string) => void;
    /** Every answer that stops the box going into the cart right now. */
    issues: FieldIssue[];
    /** The shopper tried to add with something missing: show "required" on the empty fields. */
    showMissing: boolean;
    /** Unique per mounted widget, so two sections on one page never share an element id. */
    idPrefix: string;
}

export const BuilderContext = createContext<BuilderContextValue | null>(null);

export function useBuilder(): BuilderContextValue {
    const value = useContext(BuilderContext);
    if (!value) throw new Error('useBuilder() outside <BuilderContext.Provider>');
    return value;
}

/** The element id of one field's input, which the buy button focuses when it is what is missing. */
export function fieldElementId(idPrefix: string, productId: string, fieldId: string): string {
    return `${idPrefix}-field-${productId}-${fieldId}`.replace(/[^\w-]/g, '_');
}
