/*
 * Describe a bundle in a few lines; get exactly what the headless API would serve for it.
 *
 * Products come from a snapshot of the Kitenzo demo store's public catalogue
 * (`demo-store.json`, refreshed by `bun run snapshot`), so titles, prices, options, variants and
 * photographs are real Shopify data. What the catalogue cannot say (a bundle's sections, its
 * limit rules, its discount, how much stock is left) is written here, next to the bundle it
 * belongs to.
 *
 * Every override that makes a catalogue unlike the store (a stock level, a sold-out variant, an
 * archived product) is an edge case on purpose. Name it in a comment where you write it.
 */
import type { DiscountTier, LimitRuleType, ComparisonOperator, ProductStatus } from '@kitenzo/core';

import type {
    Fixture,
    PersonalisationField,
    RawBundle,
    RawDiscount,
    RawLimitRule,
    RawProduct,
    RawSettings,
    RawVariant,
    RecurringOption,
} from './wire';

/** A product as Shopify's public `/products.json` serves it, trimmed to what we use. */
export interface StoreProduct {
    id: number;
    title: string;
    handle: string;
    body_html: string;
    vendor: string;
    product_type: string;
    tags: string[];
    options: { name: string; position: number; values: string[] }[];
    variants: {
        id: number;
        title: string;
        option1: string | null;
        option2: string | null;
        option3: string | null;
        sku: string | null;
        available: boolean;
        price: string;
        compare_at_price: string | null;
        grams: number;
        featured_image: { src: string } | null;
    }[];
    images: { id: number; src: string; alt?: string | null; variant_ids: number[] }[];
}

/** What to change about one variant, matched by its option values or its title. */
export interface VariantOverride {
    /** `"Silver / 16 inch"` or `"Default Title"`: the variant's title, as Shopify writes it. */
    title: string;
    soldOut?: boolean;
    /** `maxOrderableQuantity`. `null` means nobody counts stock and it sells freely. */
    stock?: number | null;
    /** Added to the bundle total when this variant is picked (bundles that apply surcharges). */
    surcharge?: string;
}

/** What to change about one product, for the edge cases a live catalogue does not have on cue. */
export interface ProductOverride {
    status?: ProductStatus;
    soldOut?: boolean;
    /** A stock ceiling for every variant. */
    stock?: number | null;
    title?: string;
    variants?: VariantOverride[];
    /** Replace the description. */
    descriptionHtml?: string;
    tags?: string[];
}

export interface SectionDef {
    id: number;
    name: string;
    description?: string;
    imageUrl?: string;
    /** The merchant's "advance when this step is done" setting. */
    autoNextSection?: boolean;
    /** Product handles, in the merchant's order. */
    products: string[];
    /**
     * Restrict a product to some of its variants, as a merchant can in the bundle editor. Keyed by
     * handle; values are variant titles. An empty or missing list means every variant.
     */
    variants?: Record<string, string[]>;
    /** Count rules for this step. See `rule` below; `sectionId` is filled in for you. */
    rules?: RuleDef[];
}

export interface RuleDef {
    type?: LimitRuleType;
    operation: ComparisonOperator;
    value: number;
}

export interface CatalogDef {
    id: number;
    name: string;
    description?: string;
    imageUrl?: string;
    type?: RawBundle['type'];
    published?: boolean;
    sections: SectionDef[];
    /** Bundle-wide count rules: "pick any N across steps". */
    rules?: RuleDef[];
    /** Raw limit rules, for shapes the helpers do not express. */
    limitRules?: RawLimitRule[];
    discount?: RawDiscount | null;
    required?: { handle: string; quantity?: number; variant?: string }[];
    overrides?: Record<string, ProductOverride>;
    settings?: Partial<RawSettings>;
    applyVariantSurcharges?: boolean;
    personalisation?: Record<string, PersonalisationField[]>;
    recurringOptions?: RecurringOption[];
}

/** The shop the demo store is: GBP, two decimal places, sold-out products shown. */
export const DEFAULT_SETTINGS: RawSettings = {
    activeFeatures: [],
    currency: 'GBP',
    enableLineItemProps: true,
    groupLineItemProps: true,
    hideDraftProducts: true,
    hideOptions: 'show-all',
    hideOutOfStockProducts: false,
    moneyFormat: '£{{amount}}',
    showSku: false,
    thirdPartyInventoryCheck: false,
    weightUnit: 'kg',
};

// ----- Rule and discount helpers, so a catalogue reads like the admin it mirrors --------------

export const rule = {
    /** Exactly n. Several `eq` rules on one step are alternatives: 6, 12 or 24. */
    eq: (value: number): RuleDef => ({ operation: 'eq', value }),
    min: (value: number): RuleDef => ({ operation: 'gte', value }),
    max: (value: number): RuleDef => ({ operation: 'lte', value }),
    /** The pair the admin's "Limits" tab writes for a range. */
    range: (min: number, max: number): RuleDef[] => [
        { operation: 'gte', value: min },
        { operation: 'lte', value: max },
    ],
};

export const discount = {
    none: (): RawDiscount | null => null,
    percentage: (value: number): RawDiscount => flat('percentage', value),
    /** Money off the total, in the shop's currency. */
    fixed: (value: number): RawDiscount => flat('fixed', value),
    /** A set price for the whole bundle, whatever is in it. */
    price: (value: number): RawDiscount => flat('price', value),
    /**
     * Tiers on the number of products. `type` is what each tier's `discount` means: a percentage,
     * money off, or a set price. `operator: 'max'` applies the best tier that matches.
     */
    tiers: (
        type: RawDiscount['type'],
        tiers: { atLeast: number; discount: number; customText?: string }[],
        operator: RawDiscount['operator'] = 'max',
    ): RawDiscount => ({
        flatOrTiered: 'tiered',
        minimum: null,
        operator,
        type,
        value: null,
        tiers: tiers.map<DiscountTier>((tier) => ({
            customText: tier.customText ?? null,
            discount: money(tier.discount),
            operation: 'gte',
            type: 'total_products',
            value: money(tier.atLeast),
        })),
    }),
};

function flat(type: RawDiscount['type'], value: number): RawDiscount {
    return { flatOrTiered: 'flat', minimum: null, operator: 'max', tiers: [], type, value: money(value) };
}

/** The API writes every decimal as a two-place string: `8` is `"8.00"`. */
function money(value: number): string {
    return value.toFixed(2);
}

// ----- The conversion ------------------------------------------------------------------------

const PLACEHOLDER_IMAGE = '';

function toRawVariant(product: StoreProduct, variant: StoreProduct['variants'][number], override: ProductOverride | undefined): RawVariant {
    const own = override?.variants?.find((entry) => entry.title === variant.title);
    const soldOut = own?.soldOut ?? override?.soldOut;
    const available = soldOut === undefined ? variant.available : !soldOut;
    // Public products.json carries no inventory, so the snapshot cannot say how many are left.
    // Untracked (null) unless the catalogue says otherwise: that is what most demo variants are.
    const stockSetting = own?.stock !== undefined ? own.stock : override?.stock;
    const stock = available ? (stockSetting === undefined ? null : stockSetting) : 0;
    const optionValues = [variant.option1, variant.option2, variant.option3]
        .slice(0, product.options.length)
        .filter((value): value is string => typeof value === 'string');
    const isDefault = product.options.length === 1 && product.options[0]?.name === 'Title';
    return {
        available,
        compareAtPrice: variant.compare_at_price,
        grams: variant.grams,
        inventoryQuantity: stock ?? 0,
        maxOrderableQuantity: stock,
        optionValues: isDefault ? [] : optionValues,
        price: variant.price,
        shopifyVariantGid: `gid://shopify/ProductVariant/${variant.id}`,
        shopifyVariantId: String(variant.id),
        sku: variant.sku ?? '',
        title: variant.title,
        ...(variant.featured_image ? { image: variant.featured_image.src } : {}),
        ...(own?.surcharge !== undefined ? { surcharge: own.surcharge } : {}),
    };
}

export function toRawProduct(product: StoreProduct, override?: ProductOverride): RawProduct {
    const isDefault = product.options.length === 1 && product.options[0]?.name === 'Title';
    const images = product.images.map((image) => ({ alt: image.alt ?? '', id: String(image.id), url: image.src }));
    return {
        descriptionHtml: override?.descriptionHtml ?? product.body_html ?? '',
        handle: product.handle,
        imageUrl: images[0]?.url ?? PLACEHOLDER_IMAGE,
        images,
        options: isDefault ? [] : product.options.map((option) => ({ name: option.name, position: option.position, values: option.values })),
        shopifyProductGid: `gid://shopify/Product/${product.id}`,
        shopifyProductId: String(product.id),
        status: override?.status ?? 'ACTIVE',
        tags: override?.tags ?? product.tags,
        title: override?.title ?? product.title,
        variants: product.variants.map((variant) => toRawVariant(product, variant, override)),
    };
}

function toRules(rules: RuleDef[] | undefined, sectionId: number | null): RawLimitRule[] {
    return (rules ?? []).map((entry) => ({
        operation: entry.operation,
        sectionId,
        type: entry.type ?? 'total-number-of-products',
        value: money(entry.value),
    }));
}

/**
 * Build one fixture. Throws on a handle the snapshot does not have, so a typo fails loudly at
 * dev start instead of quietly rendering a section one product short.
 */
export function defineCatalog(def: CatalogDef, store: StoreProduct[]): Fixture {
    const byHandle = new Map(store.map((product) => [product.handle, product]));
    const find = (handle: string): StoreProduct => {
        const product = byHandle.get(handle);
        if (!product) {
            throw new Error(`Catalogue "${def.name}" names "${handle}", which is not in the demo store snapshot. Run \`bun run snapshot\` after adding it.`);
        }
        return product;
    };

    const variantIdsFor = (product: StoreProduct, titles: string[] | undefined): string[] =>
        titles && titles.length > 0
            ? product.variants.filter((variant) => titles.includes(variant.title)).map((variant) => String(variant.id))
            : [];

    let itemId = 1;
    const sections = def.sections.map((section, order) => ({
        autoNextSection: section.autoNextSection ?? false,
        description: section.description ?? '',
        id: section.id,
        imageUrl: section.imageUrl ?? '',
        name: section.name,
        order,
        products: section.products.map((handle) => {
            const product = find(handle);
            return {
                bundleItemId: itemId++,
                shopifyProductId: String(product.id),
                variantIds: variantIdsFor(product, section.variants?.[handle]),
            };
        }),
    }));

    const required = (def.required ?? []).map((entry) => {
        const product = find(entry.handle);
        return {
            quantity: entry.quantity ?? 1,
            shopifyProductId: String(product.id),
            variantIds: entry.variant ? variantIdsFor(product, [entry.variant]) : [],
        };
    });

    const handles = new Set([...def.sections.flatMap((section) => section.products), ...(def.required ?? []).map((entry) => entry.handle)]);
    const products = [...handles].map((handle) => toRawProduct(find(handle), def.overrides?.[handle]));

    const bundle: RawBundle = {
        bundlingOption: 'bundles',
        conditionsEngineEnabled: false,
        conditionsEngineNodes: [],
        conditionsPartial: false,
        description: def.description ?? '',
        discount: def.discount === undefined ? null : def.discount,
        hideSingleOption: true,
        id: def.id,
        imageUrl: def.imageUrl ?? products[0]?.imageUrl ?? '',
        layout: 'single-page',
        limitRules: [
            ...def.sections.flatMap((section) => toRules(section.rules, section.id)),
            ...toRules(def.rules, null),
            ...(def.limitRules ?? []),
        ],
        name: def.name,
        published: def.published ?? true,
        requiredProducts: required,
        sections,
        type: def.type ?? 'native',
        weightUnit: 'kg',
        ...(def.applyVariantSurcharges ? { applyVariantSurcharges: true } : {}),
        ...(def.personalisation ? { personalisation: def.personalisation } : {}),
        ...(def.recurringOptions ? { recurringOptions: def.recurringOptions } : {}),
    };

    return { bundle, products, settings: { ...DEFAULT_SETTINGS, ...def.settings } };
}

/** Every handle a set of catalogue definitions names: what `bun run snapshot` keeps. */
export function handlesOf(defs: CatalogDef[]): string[] {
    const handles = new Set<string>();
    for (const def of defs) {
        for (const section of def.sections) for (const handle of section.products) handles.add(handle);
        for (const entry of def.required ?? []) handles.add(entry.handle);
    }
    return [...handles].sort();
}
