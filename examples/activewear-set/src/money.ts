/*
 * Every amount on screen goes through here, so a price can never be in two formats at once.
 *
 * In a Shopify Market (the theme reported a country and the API sent presentment prices) amounts
 * are the shopper's currency, formatted by `Intl` with that currency's own decimals (JPY has none).
 * Otherwise they are the shop's currency in the shop's own `moneyFormat`. This mirrors the SDK's
 * `useBundlePrice`, so a unit price and the total always agree.
 *
 * The set price and the surcharges are stored in the shop's currency. In a market they are
 * converted at the rate the SDK itself reads off the bundle (`resolveMarketPricingContext`), which
 * is the rate `useBundlePrice` converts the total at: "Slate adds €5.85" and the €5.85 the total
 * moves by are the same number.
 *
 * Never a hardcoded symbol, and never a money amount typed into a theme setting: both break in
 * every other currency.
 */
import { useMemo } from 'react';

import {
    formatCurrency,
    formatMoney,
    resolveMarketPricingContext,
    resolveUpfrontFixedPrice,
    type BundleDetail,
    type BundleVariant,
    type ShopSettings,
} from '@kitenzo/react';

import { surchargeOf } from './options';

export interface Money {
    /** Format an amount already in display currency. */
    format: (amount: number | string) => string;
    /** What one of this variant costs, in display currency. */
    unitPrice: (variant: BundleVariant) => number;
    /** What picking this variant adds to the set, in display currency. 0 for none. */
    surcharge: (variant: BundleVariant) => number;
    /** An amount stored in the shop's currency (a surcharge), in display currency. */
    fromShop: (amount: number) => number;
    /** The set's fixed price in display currency, when the bundle has one; known before any pick. */
    setPrice: number | null;
}

export function useMoney(bundle: BundleDetail, settings: ShopSettings): Money {
    return useMemo(() => {
        const market = resolveMarketPricingContext(bundle);
        const rate = market?.rate ?? 1;
        const locale = typeof document !== 'undefined' ? document.documentElement.lang || undefined : undefined;
        const fixed = resolveUpfrontFixedPrice(bundle);
        const applies = bundle.applyVariantSurcharges === true;
        return {
            format: (amount) => {
                if (market) return formatCurrency(amount, market.currency, locale);
                return formatMoney(amount, settings.moneyFormat);
            },
            unitPrice: (variant) => Number.parseFloat(market && variant.presentmentPrice !== undefined ? variant.presentmentPrice : variant.price) || 0,
            surcharge: (variant) => surchargeOf(variant, applies) * rate,
            fromShop: (amount) => amount * rate,
            setPrice: fixed === null ? null : Number.parseFloat(fixed) * rate,
        };
    }, [bundle, settings]);
}
