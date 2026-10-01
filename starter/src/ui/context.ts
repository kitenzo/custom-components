import { createContext, useContext } from 'react';

import type { Content } from '../content';
import type { ViewModel } from '../model';
import type { Money } from '../money';
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
    /** Unique per mounted widget, for element ids. */
    idPrefix: string;
    openDetails: (productId: string, sectionId: number) => void;
}

export const BuilderContext = createContext<BuilderContextValue | null>(null);

export function useBuilder(): BuilderContextValue {
    const value = useContext(BuilderContext);
    if (!value) throw new Error('useBuilder() outside <BuilderContext.Provider>');
    return value;
}
