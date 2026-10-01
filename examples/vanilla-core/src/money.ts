/*
 * Every amount on screen goes through here, so a price can never be in two formats at once.
 *
 * In a Shopify Market (the theme reported a country and the API sent presentment prices) amounts
 * are the shopper's currency, formatted by `Intl` with that currency's own decimals (JPY has none).
 * Otherwise they are the shop's currency in the shop's own `moneyFormat`.
 *
 * `casePrice` is what `@kitenzo/react`'s `useBundlePrice` does, step for step, without the hook:
 * the engine prices the selection (`calculatePriceWithConditions`, which applies the bundle's
 * discount and any conditional one exactly as checkout will), then `resolvePresentmentPricing`
 * moves it into the market's currency. The widget never adds up a price itself.
 *
 * Never a hardcoded symbol, and never a money amount typed into a theme setting: both break in
 * every other currency.
 */
import {
    calculatePriceWithConditions,
    formatCurrency,
    formatMoney,
    resolveMarketPricingContext,
    resolvePresentmentPricing,
    resolveUpfrontFixedPrice,
    type BundleDetail,
    type BundleVariant,
    type SectionSelections,
    type ShopSettings,
} from '@kitenzo/core';

export interface Money {
    /** Format an amount already in display currency. */
    format: (amount: number | string) => string;
    /** What one of this variant costs, in display currency. */
    unitPrice: (variant: BundleVariant) => number;
}

export interface CasePrice {
    /** What the shopper pays, in display currency. */
    total: number;
    /** What the contents cost before the bundle's discount, when that is more than `total`. */
    original: number | null;
}

/** The page's language, for `Intl`. The theme sets `<html lang>` from the shopper's locale. */
function pageLocale(): string | undefined {
    return typeof document !== 'undefined' ? document.documentElement.lang || undefined : undefined;
}

export function createMoney(bundle: BundleDetail, settings: ShopSettings): Money {
    const market = resolveMarketPricingContext(bundle);
    const locale = pageLocale();
    return {
        format: (amount) => (market ? formatCurrency(amount, market.currency, locale) : formatMoney(amount, settings.moneyFormat)),
        unitPrice: (variant) => Number.parseFloat(market && variant.presentmentPrice !== undefined ? variant.presentmentPrice : variant.price) || 0,
    };
}

/**
 * The case's price for this selection, or null when there is nothing to price yet.
 *
 * An empty case has no price, except when the bundle sells at a set price whatever is in it: then
 * that price is known before the first pick, and showing it is the point of a set price.
 */
export function casePrice(bundle: BundleDetail, selections: SectionSelections, settings: ShopSettings): CasePrice | null {
    const picked = Object.values(selections).some((picks) => picks.length > 0);
    if (!picked) {
        const fixed = resolveUpfrontFixedPrice(bundle);
        if (fixed === null) return null;
        const market = resolveMarketPricingContext(bundle);
        const amount = Number.parseFloat(fixed);
        return { total: market ? Number((amount * market.rate).toFixed(2)) : amount, original: null };
    }
    const base = calculatePriceWithConditions(bundle, selections, { currency: settings.currency });
    const pricing = resolvePresentmentPricing(bundle, selections, base) ?? base;
    const total = Number(pricing.discountedPrice);
    const original = Number(pricing.originalPrice);
    return { total, original: original > total ? original : null };
}
