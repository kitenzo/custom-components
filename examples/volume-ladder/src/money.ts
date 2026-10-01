/*
 * Every amount on screen goes through here, so a price can never be in two formats at once.
 *
 * In a Shopify Market (the theme reported a country and the API sent presentment prices) amounts
 * are the shopper's currency, formatted by `Intl` with that currency's own decimals (JPY has none).
 * Otherwise they are the shop's currency in the shop's own `moneyFormat`. This mirrors the SDK's
 * `useBundlePrice`, so a unit price and the total always agree.
 *
 * Never a hardcoded symbol, and never a money amount typed into a theme setting: both break in
 * every other currency.
 */
import { useMemo } from 'react';

import { calculatePriceWithConditions } from '@kitenzo/core';
import {
    formatCurrency,
    formatMoney,
    resolveMarketPricingContext,
    resolvePresentmentPricing,
    type BundleDetail,
    type BundleVariant,
    type SectionSelections,
    type ShopSettings,
} from '@kitenzo/react';

export interface Money {
    /** Format an amount already in display currency. */
    format: (amount: number | string) => string;
    /** What one of this variant costs, in display currency. */
    unitPrice: (variant: BundleVariant) => number;
}

export function useMoney(bundle: BundleDetail, settings: ShopSettings): Money {
    return useMemo(() => {
        const market = resolveMarketPricingContext(bundle);
        const locale = typeof document !== 'undefined' ? document.documentElement.lang || undefined : undefined;
        return {
            format: (amount) => {
                if (market) return formatCurrency(amount, market.currency, locale);
                return formatMoney(amount, settings.moneyFormat);
            },
            unitPrice: (variant) => Number.parseFloat(market && variant.presentmentPrice !== undefined ? variant.presentmentPrice : variant.price) || 0,
        };
    }, [bundle, settings]);
}

export interface Priced {
    original: number;
    discounted: number;
}

/**
 * What a selection would cost, in display currency: the same two SDK calls `useBundlePrice`
 * makes (the engine's price with conditions, then localised to the shopper's market), as a
 * plain function, because the ladder prices four selections the shopper has not made and a
 * hook cannot run in a loop. Never a widget's own arithmetic on discounts.
 */
export function priceOf(bundle: BundleDetail, selections: SectionSelections): Priced {
    const base = calculatePriceWithConditions(bundle, selections);
    const pricing = resolvePresentmentPricing(bundle, selections, base) ?? base;
    return { original: Number.parseFloat(pricing.originalPrice) || 0, discounted: Number.parseFloat(pricing.discountedPrice) || 0 };
}
