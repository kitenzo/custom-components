/*
 * The headless API's wire format: what `GET /bundles/:id`, `GET /bundles/:id/products` and
 * `GET /settings` actually send, before the SDK merges and renames them.
 *
 * Field for field, this is what Kitenzo's serializer emits (test/wire-shape.test.ts holds the key
 * sets taken from real serializer output and fails if these drift). The mock backend serves these
 * shapes so the published SDK runs unmodified in dev, in the gallery and in the e2e suite: the
 * widget never knows it is talking to a fake.
 *
 * Do not hand-write objects of these types. Describe a bundle with `defineCatalog` (catalog.ts)
 * and let it produce them.
 */
import type {
    BundleDetail,
    ComparisonOperator,
    DiscountTier,
    DiscountType,
    LimitRuleType,
    ProductStatus,
    RecurringOption,
    ShopSettings,
} from '@kitenzo/core';

/** Not exported by the SDK on its own; read off the bundle type so it can never drift. */
export type PersonalisationField = NonNullable<BundleDetail['personalisation']>[string][number];
export type { RecurringOption };

export interface RawLimitRule {
    operation: ComparisonOperator;
    sectionId: number | null;
    type: LimitRuleType;
    value: string;
}

export interface RawDiscount {
    flatOrTiered: 'flat' | 'tiered';
    minimum: string | null;
    operator: 'max' | 'cumulative';
    tiers: DiscountTier[];
    type: DiscountType | '';
    value: string | null;
}

export interface RawSectionProductRef {
    bundleItemId: number;
    shopifyProductId: string;
    variantIds: string[];
}

export interface RawSection {
    autoNextSection: boolean;
    description: string;
    id: number;
    imageUrl: string;
    name: string;
    order: number;
    products: RawSectionProductRef[];
}

export interface RawRequiredProduct {
    quantity: number;
    shopifyProductId: string;
    variantIds: string[];
}

export interface RawBundle {
    bundlingOption: 'bundles';
    conditionsEngineEnabled: boolean;
    conditionsEngineNodes: unknown[];
    conditionsPartial: boolean;
    description: string;
    discount: RawDiscount | null;
    hideSingleOption: boolean;
    id: number;
    imageUrl: string;
    layout: string;
    limitRules: RawLimitRule[];
    name: string;
    published: boolean;
    requiredProducts: RawRequiredProduct[];
    sections: RawSection[];
    type: 'native' | 'multiple-products' | 'single-product';
    weightUnit: string;
    applyVariantSurcharges?: boolean;
    personalisation?: Record<string, PersonalisationField[]>;
    recurringOptions?: RecurringOption[];
}

export interface RawVariant {
    available: boolean;
    compareAtPrice: string | null;
    grams: number;
    inventoryQuantity: number;
    maxOrderableQuantity: number | null;
    optionValues: string[];
    price: string;
    shopifyVariantGid: string;
    shopifyVariantId: string;
    sku: string;
    title: string;
    image?: string;
    surcharge?: string;
    presentmentPrice?: string;
    presentmentCurrency?: string;
    priceInShopCurrency?: string;
    availableForSale?: boolean;
}

export interface RawImage {
    alt: string;
    id: string;
    url: string;
}

export interface RawOption {
    name: string;
    position: number;
    values: string[];
}

export interface RawProduct {
    descriptionHtml: string;
    handle: string;
    imageUrl: string;
    images: RawImage[];
    options: RawOption[];
    shopifyProductGid: string;
    shopifyProductId: string;
    status: ProductStatus;
    tags: string[];
    title: string;
    variants: RawVariant[];
}

export type RawSettings = Required<
    Pick<
        ShopSettings,
        | 'activeFeatures'
        | 'currency'
        | 'enableLineItemProps'
        | 'groupLineItemProps'
        | 'hideDraftProducts'
        | 'hideOptions'
        | 'hideOutOfStockProducts'
        | 'moneyFormat'
        | 'showSku'
        | 'thirdPartyInventoryCheck'
        | 'weightUnit'
    >
>;

/** One bundle as the API would serve it: the bundle, its products and the shop it belongs to. */
export interface Fixture {
    bundle: RawBundle;
    products: RawProduct[];
    settings: RawSettings;
}
