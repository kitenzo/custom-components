import { recurringCartAttributes, validateRecurringChoice, type RecurringChoice } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { DEFAULT_CONTENT, parseContent } from '../src/content';
import { frequencyText, lineLabels, planDiscount, planProblem, reorderExpired } from '../src/recurring';
import { load } from './support';

const pounds = (amount: number) => `£${amount.toFixed(2)}`;
const club = (email: string, frequency = 4): RecurringChoice => ({ type: 'new', optionId: 71, frequency, unit: 'weeks', email });

describe('frequencyText', () => {
    it('reads a cadence in the theme\'s words, singular and plural', () => {
        expect(frequencyText(DEFAULT_CONTENT, 4, 'weeks')).toBe('Every 4 weeks');
        expect(frequencyText(DEFAULT_CONTENT, 1, 'weeks')).toBe('Every week');
        expect(frequencyText(DEFAULT_CONTENT, 1, 'months')).toBe('Every month');
        const french = parseContent(JSON.stringify({ frequencyWeeks: 'Toutes les {count} semaines' }));
        expect(frequencyText(french, 2, 'weeks')).toBe('Toutes les 2 semaines');
    });

    it('is what the cart line says, through the SDK\'s own property builder', () => {
        const labels = lineLabels(parseContent(JSON.stringify({ propertyFrequency: 'Rappel', propertyEmail: 'Courriel', frequencyWeeks: 'Toutes les {count} semaines' })));
        const properties = recurringCartAttributes(club('sam@example.com'), 'sub_1', labels);
        expect(properties).toEqual(
            expect.arrayContaining([
                { key: '_bundle_frequency', value: '4-weeks' },
                { key: 'Rappel', value: 'Toutes les 4 semaines' },
                { key: 'Courriel', value: 'sam@example.com' },
                { key: '_subscription_email', value: 'sam@example.com' },
            ]),
        );
    });
});

describe('planProblem', () => {
    it('turns the SDK\'s validation into the theme\'s sentences, by error type', async () => {
        const { bundle } = await load();
        const problem = (choice: RecurringChoice | null) => planProblem(DEFAULT_CONTENT, validateRecurringChoice(bundle, choice), choice);
        expect(problem(null)).toBeNull();
        expect(problem(club('sam@example.com'))).toBeNull();
        expect(problem(club('  '))).toBe(DEFAULT_CONTENT.emailMissing);
        expect(problem(club('sam@'))).toBe(DEFAULT_CONTENT.emailInvalid);
        expect(problem(club('sam@example.com', 3))).toBe(DEFAULT_CONTENT.frequencyMissing);
        expect(problem({ type: 'new', optionId: 999, frequency: 4, unit: 'weeks', email: 'sam@example.com' })).toBe(DEFAULT_CONTENT.planGone);
        expect(problem({ type: 'reorder', subscriptionId: 'sub_gone' })).toBe(DEFAULT_CONTENT.planGone);
    });
});

describe('planDiscount', () => {
    it('describes the plan\'s saving, or nothing when it has none', () => {
        expect(planDiscount(DEFAULT_CONTENT, 'percentage', 10, pounds)).toBe('10% off');
        expect(planDiscount(DEFAULT_CONTENT, 'fixed', 3, pounds)).toBe('£3.00 off');
        expect(planDiscount(DEFAULT_CONTENT, '', null, pounds)).toBeNull();
        expect(planDiscount(DEFAULT_CONTENT, 'percentage', 0, pounds)).toBeNull();
    });
});

describe('reorderExpired', () => {
    it('is true only for a reorder link the bundle came back without', async () => {
        const { bundle } = await load();
        expect(reorderExpired(null, bundle)).toBe(false);
        expect(reorderExpired('sub_gone', bundle)).toBe(true);
        expect(reorderExpired('sub_1', { ...bundle, recurringSubscription: { id: 'sub_1', email: 'a@b.co', frequency: 4, unit: 'weeks', discountType: 'percentage', discountValue: 10, applyDiscountToInitialOrder: true } })).toBe(false);
    });
});
