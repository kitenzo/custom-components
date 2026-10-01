/*
 * Subscribe and save, in the shop's words.
 *
 * The plan itself is the SDK's: `useRecurringPlan` holds the choice, `useBundlePrice` prices it,
 * `addToCart` sends it to `/configure` and writes its line properties. Kitenzo Recurring bundles
 * are NOT Shopify selling plans: nobody is billed on a schedule. The customer gets a reminder
 * email with a reorder link (`?subscription=<id>`), and each reorder is a normal checkout. Every
 * word the widget says about a plan has to promise that, and only that.
 *
 * What this file adds is translation: the SDK's validation errors and its cadence wording are
 * English sentences, and every visible string here is a theme setting. The errors are matched on
 * their `type` (stable), never on their message (copy that can change in any SDK release).
 */
import type { BundleDetail, DiscountType, RecurringChoice, RecurringLineLabels, RecurringUnit, ValidationError } from '@kitenzo/react';

import { text, type Content, type TextKey } from './content';
import { discountLabel } from './tiers';

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

/** The first reason the plan cannot be added yet, as a theme sentence. Null when it can. */
export function planProblem(content: Content, errors: ValidationError[], choice: RecurringChoice | null): string | null {
    const first = errors[0];
    if (!first) return null;
    switch (first.type) {
        case 'recurring-email':
            return choice?.type === 'new' && choice.email.trim() === '' ? text(content, 'emailMissing') : text(content, 'emailInvalid');
        case 'recurring-frequency':
            return text(content, 'frequencyMissing');
        default:
            return text(content, 'planGone');
    }
}

/** "an extra 10% off", or the plan's money equivalent. Null when the plan carries no discount. */
export function planDiscount(
    content: Content,
    type: DiscountType | '',
    value: number | null,
    formatMoney: (amount: number) => string | null,
): string | null {
    if (!type || !value) return null;
    return discountLabel(content, type, value, formatMoney);
}

/**
 * The page was opened from a reminder's reorder link, but the bundle came back without the
 * subscription it named (expired, cancelled, another shop's). The shopper gets a one-time case
 * and a sentence saying so, never a silent change of price.
 */
export function reorderExpired(subscriptionId: string | null, bundle: BundleDetail): boolean {
    return subscriptionId !== null && !bundle.recurringSubscription;
}
