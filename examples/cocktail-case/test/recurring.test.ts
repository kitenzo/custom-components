import { createMoneyFormatter, recurringCartAttributes, validateRecurringChoice, type RecurringChoice } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { DEFAULT_CONTENT, parseContent } from '../src/content';
import { frequencyText, lineLabels, planDiscount, planMessages } from '../src/recurring';
import { load } from './support';

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

describe('planMessages', () => {
    it('words every reason the SDK refuses a plan in the theme\'s sentences, by code', async () => {
        const { bundle } = await load();
        const messages = planMessages(DEFAULT_CONTENT);
        const problem = (choice: RecurringChoice | null) => validateRecurringChoice(bundle, choice, { messages })[0]?.message ?? null;
        expect(problem(null)).toBeNull();
        expect(problem(club('sam@example.com'))).toBeNull();
        expect(problem(club('  '))).toBe(DEFAULT_CONTENT.emailMissing);
        expect(problem(club('sam@'))).toBe(DEFAULT_CONTENT.emailInvalid);
        expect(problem(club('sam@example.com', 3))).toBe(DEFAULT_CONTENT.frequencyMissing);
        expect(problem({ type: 'new', optionId: 999, frequency: 4, unit: 'weeks', email: 'sam@example.com' })).toBe(DEFAULT_CONTENT.planGone);
        expect(problem({ type: 'reorder', subscriptionId: 'sub_gone' })).toBe(DEFAULT_CONTENT.planGone);
    });

    it('carries the merchant\'s own wording, not the default', async () => {
        const { bundle } = await load();
        const messages = planMessages(parseContent(JSON.stringify({ emailMissing: 'Votre courriel, s\'il vous plaît.' })));
        expect(validateRecurringChoice(bundle, club(''), { messages })[0]?.message).toBe('Votre courriel, s\'il vous plaît.');
    });
});

describe('planDiscount', () => {
    it('describes the plan\'s saving, or nothing when it has none', async () => {
        const { bundle, settings } = await load();
        const money = createMoneyFormatter(bundle, settings);
        expect(planDiscount(DEFAULT_CONTENT, 'percentage', 10, money)).toBe('10% off');
        expect(planDiscount(DEFAULT_CONTENT, 'fixed', 3, money)).toBe('£3.00 off');
        expect(planDiscount(DEFAULT_CONTENT, '', null, money)).toBeNull();
        expect(planDiscount(DEFAULT_CONTENT, 'percentage', 0, money)).toBeNull();
    });
});
