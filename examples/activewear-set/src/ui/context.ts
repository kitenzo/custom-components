import { createContext, useContext } from 'react';

import type { Content } from '../content';
import type { ViewModel } from '../model';
import type { Money } from '../money';
import type { Selection } from '../selection';
import type { Pieces } from './usePieces';

export interface BuilderContextValue {
    model: ViewModel;
    selection: Selection;
    money: Money;
    content: Content;
    /** Every piece's option choice, shared by its card, its dialog and "Match colours". */
    pieces: Pieces;
    /** Rendering in the Shopify theme editor. */
    editor: boolean;
    /** True while an add is in flight: every control that changes the selection is held. */
    locked: boolean;
    /** Prefix for element ids, unique per widget: the same bundle can be mounted twice on a page. */
    idPrefix: string;
    openDetails: (productId: string, sectionId: number) => void;
}

export const BuilderContext = createContext<BuilderContextValue | null>(null);

export function useBuilder(): BuilderContextValue {
    const value = useContext(BuilderContext);
    if (!value) throw new Error('useBuilder() outside <BuilderContext.Provider>');
    return value;
}
