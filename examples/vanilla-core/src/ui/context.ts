/*
 * What every region of one mounted widget can read. The starter passes this down as React
 * context; here it is one plain object, made once per mount and handed to each render function.
 */
import type { BundleBuilder, BundleBuilderSnapshot, BundleCartState, BundleDetail, MoneyFormatter, ShopSettings } from '@kitenzo/core';

import type { Content } from '../content';
import type { ViewModel } from '../model';

export interface Ctx {
    bundle: BundleDetail;
    /** What is offered at this moment: the SDK's offer, less what the conditions engine hides. */
    model: () => ViewModel;
    content: Content;
    settings: ShopSettings;
    /** Every amount on screen goes through this one formatter, so no two are in different formats. */
    money: MoneyFormatter;
    builder: BundleBuilder;
    /** The engine's current snapshot: selections, isSatisfied, problems, progress, conditions. */
    state: () => BundleBuilderSnapshot;
    cart: () => BundleCartState;
    /** An add is in flight or owed: every control that changes the case is held. */
    locked: () => boolean;
    openDetails: (productId: string, sectionId: number) => void;
    /** The capsule colour this product's bottles wear in the case, so a shopper can match them to the shelf. */
    capsule: (productId: string) => string;
}
