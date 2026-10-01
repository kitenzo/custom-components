import { createContext, useContext } from 'react';

import type { Content } from '../content';
import type { ViewModel, ViewSection } from '../model';
import type { Money } from '../money';
import type { QuizAnswer, Recommendation } from '../quiz';
import type { Selection } from '../selection';

export interface BuilderContextValue {
    model: ViewModel;
    selection: Selection;
    money: Money;
    content: Content;
    /** Rendering in the Shopify theme editor. */
    editor: boolean;
    /** True while an add is in flight: every control that changes the selection is held. */
    locked: boolean;
    /** Prefix for element ids, unique per widget: one bundle can be mounted twice on a page. */
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

export const BuilderContext = createContext<BuilderContextValue | null>(null);

export function useBuilder(): BuilderContextValue {
    const value = useContext(BuilderContext);
    if (!value) throw new Error('useBuilder() outside <BuilderContext.Provider>');
    return value;
}
