/*
 * Subscribe and save, in the shop's words.
 *
 * The plan itself is the SDK's: `useRecurringPlan` holds the choice, `useBundlePrice` prices it,
 * `addToCart` sends it to `/configure` and writes its line properties. Kitenzo Recurring bundles
 * are NOT Shopify selling plans: nobody is billed on a schedule. The customer gets a reminder
 * email with a reorder link (`?subscription=<id>`), and each reorder is a normal checkout. Every
 * word the widget says about a plan has to promise that, and only that.
 *
 * What this file adds is the shop's wording, because every visible string here is a theme
 * setting: a sentence for each reason the SDK can refuse a plan (keyed by its stable `code`, handed
 * to the SDK's `messages` option), and how a cadence reads (the SDK's `formatFrequency` seam).
 */
import type { DiscountType, RecurringErrorCode, RecurringLineLabels, RecurringUnit } from '@kitenzo/react';

import { text, type Content, type TextKey } from './content';
import { discountLabel, type TierMoney } from './tiers';

const FREQUENCY_KEYS: Record<RecurringUnit, [TextKey, TextKey]> = {
    days: ['frequencyDay', 'frequencyDays'],
    weeks: ['frequencyWeek', 'frequencyWeeks'],
    months: ['frequencyMonth', 'frequencyMonths'],
};

/** "Every 4 weeks", from the theme's wording. Also what the cart line's "Frequency" says. */
export function frequencyText(content: Content, frequency: number, unit: RecurringUnit): string {
    const [one, many] = FREQUENCY_KEYS[unit] ?? FREQUENCY_KEYS.weeks;
    return frequency === 1 ? text(content, one) : text(content, many, { count: frequency });
}

/** The visible property names and cadence wording written on a subscribed cart line. */
export function lineLabels(content: Content): RecurringLineLabels {
    return {
        frequency: content.propertyFrequency,
        email: content.propertyEmail,
        formatFrequency: (frequency, unit) => frequencyText(content, frequency, unit),
    };
}

/**
 * The theme's sentence for every reason a plan cannot be added yet. Passed to `useRecurringPlan`
 * (whose `errors[0].message` the picker shows) and to the cart hook (whose `shopperMessage` says
 * the same if an add is refused for it).
 */
export function planMessages(content: Content): Record<RecurringErrorCode, string> {
    return {
        'recurring-email-required': content.emailMissing,
        'recurring-email-invalid': content.emailInvalid,
        'recurring-frequency-required': content.frequencyMissing,
        'recurring-plan-unavailable': content.planGone,
        'recurring-reorder-unavailable': content.planGone,
    };
}

/** "an extra 10% off", or the plan's money equivalent. Null when the plan carries no discount. */
export function planDiscount(content: Content, type: DiscountType | '', value: number | null, money: TierMoney): string | null {
    if (!type || !value) return null;
    return discountLabel(content, type, value, money);
}
