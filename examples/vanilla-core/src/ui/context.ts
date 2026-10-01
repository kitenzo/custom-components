/*
 * What every region of one mounted widget can read. The starter passed this down as React
 * context; here it is one plain object, made once per mount and handed to each render function.
 */
import type { BundleBuilder, BundleBuilderSnapshot, ShopSettings } from '@kitenzo/core';

import type { CartState } from '../cart';
import type { Content } from '../content';
import type { ViewModel } from '../model';
import type { Money } from '../money';

export interface Ctx {
    model: ViewModel;
    content: Content;
    settings: ShopSettings;
    money: Money;
    builder: BundleBuilder;
    /** Rendering in the Shopify theme editor. */
    editor: boolean;
    /** The engine's current snapshot: selections, isSatisfied, errors, conditions. */
    state: () => BundleBuilderSnapshot;
    cart: () => CartState;
    /** An add is in flight: every control that changes the case is held. */
    locked: () => boolean;
    /** Re-render every region from the current state. Cheap, and safe to call often. */
    render: () => void;
    openDetails: (productId: string, sectionId: number) => void;
    /** The capsule colour this product's bottles wear in the case, so a shopper can match them to the shelf. */
    capsule: (productId: string) => string;
}
