import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { DEFAULT_CONTENT, parseContent } from '../src/content';
import { toViewModel } from '../src/model';
import { matchProduct, parseTags, planRoutine, quizFrom, tagAsWords, type QuizAnswer } from '../src/quiz';
import { splitTitle } from '../src/ui/names';
import { load, soldOut, withProduct } from './support';
import type { Fixture } from '../dev/mock/wire';

async function modelOf(change?: (fixture: Fixture) => Fixture) {
    const { bundle, settings } = await load(change);
    return toViewModel(bundle, settings);
}

const questions = quizFrom(DEFAULT_CONTENT);
/** The default quiz's answers, by label: `answers('Dry', 'Fine lines')`. */
function answers(...labels: string[]): QuizAnswer[] {
    return labels.map((label) => questions.flatMap((question) => question.answers).find((answer) => answer.label === label)!);
}

/** handle (and size, when it has one) of each step's pick, in step order. */
function picked(model: Awaited<ReturnType<typeof modelOf>>, plan: ReturnType<typeof planRoutine>) {
    return plan.picks.map((pick) => {
        const product = model.sections.flatMap((section) => section.products).find((entry) => entry.id === pick.productId)!;
        const variant = product.variants.find((entry) => entry.id === pick.variantId)!;
        return `${product.handle} ${variant.title}`;
    });
}

describe('quizFrom', () => {
    it('reads the default quiz: three questions, the last with three answers', () => {
        expect(questions.map((question) => question.answers.length)).toEqual([5, 5, 3]);
        expect(questions[0]!.answers[0]).toEqual({ id: 'q1a1', label: 'Dry', tags: ['dry-skin', 'very-dry-skin'] });
        // "Both" steers nothing: it has no tags, on purpose.
        expect(questions[2]!.answers[2]).toEqual({ id: 'q3a3', label: 'Both', tags: [] });
    });

    it('a cleared title removes its question, a cleared label its answer (blank means none here)', () => {
        const [first, second, third] = DEFAULT_CONTENT.questions;
        const content = parseContent(
            JSON.stringify({
                questions: [
                    { ...first, answers: first!.answers.map((answer, index) => (index === 1 ? { ...answer, label: '  ' } : answer)) },
                    { ...second, hint: '' },
                    { ...third, title: '' },
                ],
            }),
        );
        const quiz = quizFrom(content);
        expect(quiz.map((question) => question.id)).toEqual(['q1', 'q2']);
        expect(quiz[0]!.answers.map((answer) => answer.label)).toEqual(['Dry', 'Combination', 'Sensitive', 'Balanced, or not sure']);
        expect(quiz[0]!.answers.map((answer) => answer.id)).toEqual(['q1a1', 'q1a2', 'q1a3', 'q1a4']);
        expect(quiz[1]!.hint).toBe('');
    });

    it('a question whose answers are all cleared is removed, and ids follow the questions shown', () => {
        const [first, second, third] = DEFAULT_CONTENT.questions;
        const quiz = quizFrom(parseContent(JSON.stringify({ questions: [first, { ...second, answers: second!.answers.map((answer) => ({ ...answer, label: '' })) }, third] })));
        expect(quiz.map((question) => question.title)).toEqual([first!.title, third!.title]);
        expect(quiz[1]!.id).toBe('q2');
    });

    it('no list is the default quiz; an empty list (every block removed) is no quiz; junk is ignored', () => {
        expect(quizFrom(parseContent('{}'))).toHaveLength(3);
        expect(quizFrom(parseContent(JSON.stringify({ questions: [] })))).toEqual([]);
        expect(quizFrom(parseContent(JSON.stringify({ questions: [42, { title: 'Skin?', answers: [{ label: 'Dry', tags: 7 }, 'x'] }] })))).toEqual([
            { id: 'q1', title: 'Skin?', hint: '', answers: [{ id: 'q1a1', label: 'Dry', tags: [] }] },
        ]);
    });
});

describe('tags', () => {
    it('parses a merchant-typed list: trimmed, lower-cased, no blanks or repeats', () => {
        expect(parseTags(' Dry-Skin, very-dry-skin,, dry-skin ')).toEqual(['dry-skin', 'very-dry-skin']);
        expect(parseTags('')).toEqual([]);
    });

    it('says a tag as words', () => {
        expect(tagAsWords('very-dry-skin')).toBe('very dry skin');
        expect(tagAsWords('anti_ageing')).toBe('anti ageing');
    });

    it('scores one point per answer matched, and names the matched tags in question order', () => {
        const product = { tags: ['Brightening', 'morning-only', 'dullness', 'serum'] };
        expect(matchProduct(product, answers('Dry', 'Dullness and uneven tone', 'Mornings'))).toEqual({
            score: 2,
            tags: ['brightening', 'dullness', 'morning-only'],
        });
        expect(matchProduct(product, [])).toEqual({ score: 0, tags: [] });
    });
});

describe('planRoutine', () => {
    it('builds a whole routine from the answers: the best match per step, ties in the merchant\'s order', async () => {
        const model = await modelOf();
        const plan = planRoutine(model, answers('Dry', 'Dullness and uneven tone', 'Mornings'));
        expect(picked(model, plan)).toEqual([
            // Two cleansers match "dry"; the oil balm comes first in the step.
            'squalane-camellia-cleansing-oil-balm 75ml',
            'vitamin-c-ferulic-brightening-serum 30ml',
            // Three moisturisers match one answer each; the balm comes first in the step.
            'centella-panthenol-barrier-balm 30ml',
        ]);
        expect(plan.picks[1]!.matched).toEqual(['brightening', 'uneven-tone', 'dullness', 'morning-only']);
    });

    it('never recommends a sold-out product, even the only one that matches', async () => {
        const model = await modelOf();
        // The retinal serum is the only one tagged anti-ageing and fine-lines, and it is sold out.
        const plan = planRoutine(model, [{ id: 'x', label: 'Fine lines', tags: ['anti-ageing', 'fine-lines'] }]);
        const treat = picked(model, plan)[1]!;
        expect(treat).not.toContain('retinal');
        // Nothing else in Treat matches, so it falls back to the first available, and says so.
        expect(treat).toBe('vitamin-c-ferulic-brightening-serum 30ml');
        expect(plan.picks[1]!.matched).toEqual([]);
    });

    it('with the default "Fine lines" answer, finds the next best match instead', async () => {
        const model = await modelOf();
        const plan = planRoutine(model, answers('Fine lines'));
        expect(picked(model, plan)[1]).toBe('polyglutamic-acid-beta-glucan-serum 30ml');
        expect(plan.picks[1]!.matched).toEqual(['plumping']);
    });

    it('never seeds a sold-out size: the cream cleanser goes in at 150ml', async () => {
        const model = await modelOf();
        const plan = planRoutine(model, answers('Sensitive', 'Redness and irritation'));
        expect(picked(model, plan)[0]).toBe('ceramide-oat-cream-cleanser 150ml');
    });

    it('falls back to the first available product when nothing matches, skipping sold-out ones', async () => {
        const model = await modelOf((fixture) => withProduct(fixture, 'vitamin-c-ferulic-brightening-serum', soldOut));
        const plan = planRoutine(model, [{ id: 'x', label: 'Nothing', tags: ['no-such-tag'] }]);
        expect(picked(model, plan)).toEqual([
            'squalane-camellia-cleansing-oil-balm 75ml',
            // Vitamin C and retinal are both sold out.
            'niacinamide-zinc-blemish-serum 30ml',
            'centella-panthenol-barrier-balm 30ml',
        ]);
        expect(plan.picks.every((pick) => pick.matched.length === 0)).toBe(true);
    });

    it('takes each step\'s count from its own rule, and fills an optional step only on a match', async () => {
        const model = await modelOf((fixture) => ({
            ...fixture,
            bundle: {
                ...fixture.bundle,
                limitRules: [
                    { operation: 'eq', sectionId: 21, type: 'total-number-of-products', value: '2.00' },
                    { operation: 'eq', sectionId: 22, type: 'total-number-of-products', value: '1.00' },
                    { operation: 'lte', sectionId: 23, type: 'total-number-of-products', value: '1.00' },
                ],
            },
        }));
        const oily = planRoutine(model, answers('Oily'));
        expect(oily.selections[21]).toHaveLength(2);
        // PHA matches "oily"; nothing else in Cleanse does, so the second pick is the first available.
        expect(picked(model, oily).slice(0, 2)).toEqual(['pha-zinc-exfoliating-cleanser 75ml', 'squalane-camellia-cleansing-oil-balm 75ml']);
        expect(oily.selections[23]).toHaveLength(1); // the gel-cream matches "oily"

        const nothing = planRoutine(model, [{ id: 'x', label: 'Nothing', tags: ['no-such-tag'] }]);
        expect(nothing.selections[23]).toBeUndefined();
    });

    it('a merchant with other tags rewires the quiz from the theme settings alone', async () => {
        const model = await modelOf();
        const quiz = quizFrom(parseContent(JSON.stringify({ questions: [{ title: 'By noon?', hint: '', answers: [{ label: 'Shine', tags: 'Oily-Skin' }] }] })));
        const plan = planRoutine(model, [quiz[0]!.answers[0]!]);
        expect(picked(model, plan)[0]).toBe('pha-zinc-exfoliating-cleanser 75ml');
    });

    it('produces a seed the SDK takes whole, and can sell', async () => {
        const model = await modelOf();
        const plan = planRoutine(model, answers('Combination', 'Breakouts', 'Evenings'));
        const state = createBundleBuilder(model.bundle, { initialSelections: plan.selections }).getState();
        expect(state.selections).toEqual(plan.selections);
        expect(state.isSatisfied).toBe(true);
    });

    it('never recommends more than the stock has: the next product takes the place', async () => {
        // "Dry" ranks the oil balm first in Cleanse. With none left to order, it is not in the routine.
        const model = await modelOf((fixture) =>
            withProduct(fixture, 'squalane-camellia-cleansing-oil-balm', (product) => ({ ...product, variants: product.variants.map((entry) => ({ ...entry, maxOrderableQuantity: 0 })) })),
        );
        const plan = planRoutine(model, answers('Dry'));
        expect(picked(model, plan)[0]).toBe('ceramide-oat-cream-cleanser 150ml');
    });

    it('recommends only what a rule leaves room for: a bundle-wide maximum of 2 is a routine of 2', async () => {
        const model = await modelOf((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, limitRules: [...fixture.bundle.limitRules, { operation: 'lte', sectionId: null, type: 'total-number-of-products', value: '2.00' }] },
        }));
        const plan = planRoutine(model, answers('Dry', 'Dullness and uneven tone', 'Mornings'));
        // Every pick the plan names is in its selection: the card never says "Recommended" of a product the routine left out.
        expect(plan.picks.map((pick) => pick.sectionId)).toEqual([21, 22]);
        expect(Object.keys(plan.selections)).toEqual(['21', '22']);
    });
});

describe('splitTitle', () => {
    it('sets the formula as the name and the format under it', () => {
        expect(splitTitle('Ceramide + Oat - Cream Cleanser')).toEqual({ name: 'Ceramide + Oat', kind: 'Cream Cleanser' });
        expect(splitTitle('Plain title')).toEqual({ name: 'Plain title', kind: '' });
        expect(splitTitle(' - starts with a dash')).toEqual({ name: ' - starts with a dash', kind: '' });
    });
});
