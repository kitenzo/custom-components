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

import { formatCurrency, formatMoney, resolveMarketPricingContext, type BundleDetail, type BundleVariant, type ShopSettings } from '@kitenzo/react';

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
