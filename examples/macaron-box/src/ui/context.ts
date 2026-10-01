import { createContext, useContext } from 'react';

import type { BoxOffer } from '../box';
import type { Content } from '../content';
import type { ViewModel, ViewSection } from '../model';
import type { Money } from '../money';
import type { Selection } from '../selection';

/** The box being filled: the step it is built in, the sizes on offer and the one chosen. */
export interface BoxState {
    section: ViewSection;
    /** From the bundle's `eq` rules. Empty when the bundle sells no fixed sizes. */
    sizes: number[];
    offers: BoxOffer[];
    /**
     * Sizes sold at a set price, so one macaron's own price is not what anyone pays and the
     * flavour cards leave it out.
     */
    setPriced: boolean;
    /** The chosen size. `null` until the shopper chooses (or makes a first pick). */
    size: number | null;
    /** How many slots the tray draws: the chosen size, else the step's own finite maximum. */
    slots: number | null;
    /** Choose a size; a smaller box than the tray holds asks first. */
    choose: (size: number) => void;
    /** Fill every empty slot (see autofill.ts). */
    fillRest: () => void;
    /** Why the last fill came up short, if it did. */
    fillNote: string | null;
}

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
    box: BoxState | null;
    openDetails: (productId: string, sectionId: number) => void;
}

export const BuilderContext = createContext<BuilderContextValue | null>(null);

export function useBuilder(): BuilderContextValue {
    const value = useContext(BuilderContext);
    if (!value) throw new Error('useBuilder() outside <BuilderContext.Provider>');
    return value;
}
