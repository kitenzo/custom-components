/*
 * The quiz: its questions, read from the theme settings, and the routine its answers build.
 *
 * Answers map to product TAGS, never to product handles or ids. The merchant already tags their
 * catalogue for their own collections and filters ("dry-skin", "acne-prone"); a quiz that reads
 * those tags keeps working when a product is added to a step, renamed, or swapped for a new
 * formula, and a merchant with different tags rewires it in the theme editor (content.ts).
 *
 * `planRoutine` is pure and has no say over what is sold. It reads each step's count from the
 * bundle's own rules (through the model) and offers every pick to a builder of its own, which
 * takes only what a shopper could have picked by hand: nothing sold out, nothing a rule or the
 * stock has no room for. The routine is whatever that builder ended up holding.
 */
import { createBundleBuilder, type SectionSelections } from '@kitenzo/react';

import type { Content } from './content';
import type { ViewModel, ViewProduct, ViewSection } from './model';

export interface QuizAnswer {
    id: string;
    label: string;
    /** Lower-cased, trimmed. Empty means the answer steers nothing. */
    tags: string[];
}

export interface QuizQuestion {
    id: string;
    title: string;
    hint: string;
    answers: QuizAnswer[];
}

/** The tags a product matched, and how many questions those came from. */
export interface Match {
    score: number;
    /** In question order, without repeats: what the "Matches: …" line names. */
    tags: string[];
}

export interface Recommendation {
    sectionId: number;
    productId: string;
    variantId: string;
    /** Empty when nothing in the step matched and the plan fell back to the first available product. */
    matched: string[];
}

export interface RoutinePlan {
    selections: SectionSelections;
    picks: Recommendation[];
}

/** "dry-skin, Very-Dry-Skin," → ["dry-skin", "very-dry-skin"]. Shopify tags compare case-insensitively. */
export function parseTags(raw: string): string[] {
    return [...new Set(raw.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

/** "very-dry-skin" → "very dry skin": a tag, said as words, for the shopper. */
export function tagAsWords(tag: string): string {
    return tag.replace(/[-_]+/g, ' ').trim();
}

/**
 * The questions the merchant configured, one per "Question" block, in block order. A question
 * without a title, or with no answer that has a label, is left out, so a half-written block never
 * reaches a shopper. Ids follow the position among the questions shown: `q1a2` is the second
 * answer of the first question.
 */
export function quizFrom(content: Content): QuizQuestion[] {
    return content.questions
        .map((question) => ({ ...question, answers: question.answers.filter((answer) => answer.label) }))
        .filter((question) => question.title && question.answers.length > 0)
        .map((question, n) => ({
            id: `q${n + 1}`,
            title: question.title,
            hint: question.hint,
            answers: question.answers.map((answer, m) => ({ id: `q${n + 1}a${m + 1}`, label: answer.label, tags: parseTags(answer.tags) })),
        }));
}

/** One point per answer the product's tags agree with, and which tags did the agreeing. */
export function matchProduct(product: Pick<ViewProduct, 'tags'>, answers: QuizAnswer[]): Match {
    const own = new Set(product.tags.map((tag) => tag.trim().toLowerCase()));
    const tags: string[] = [];
    let score = 0;
    for (const answer of answers) {
        const hits = answer.tags.filter((tag) => own.has(tag));
        if (hits.length === 0) continue;
        score += 1;
        for (const tag of hits) if (!tags.includes(tag)) tags.push(tag);
    }
    return { score, tags };
}

/**
 * How many products the quiz puts in a step: the step's own minimum. A step with no minimum is
 * optional, so it gets one only when something in it matched the answers.
 */
function wanted(section: ViewSection, bestScore: number): number {
    if (section.limits.min > 0) return section.limits.min;
    return bestScore > 0 ? 1 : 0;
}

/**
 * The routine for a set of answers, step by step.
 *
 * Products that match more answers come first; a tie keeps the merchant's own order in the step.
 * Only what the SDK's builder takes is in the routine, so a sold-out product (or size) is never
 * picked. When nothing in a step matches, or too little matches to meet the step's minimum, the
 * rest comes from the first products the builder takes in the merchant's order, marked as a
 * fallback so the widget does not claim a match it did not make. Each product goes in once, in
 * the first of its variants that can go in.
 */
export function planRoutine(model: ViewModel, answers: QuizAnswer[]): RoutinePlan {
    const builder = createBundleBuilder(model.bundle);
    const picks: Recommendation[] = [];
    for (const section of model.sections) {
        const candidates = section.products.flatMap((product, index) => {
            const variant = product.variants.find((entry) => builder.blockedReason(section.id, entry.id) === null);
            return variant ? [{ product, variant, index, match: matchProduct(product, answers) }] : [];
        });
        const ranked = candidates.filter((candidate) => candidate.match.score > 0).sort((a, b) => b.match.score - a.match.score || a.index - b.index);
        const unmatched = candidates.filter((candidate) => candidate.match.score === 0);
        let left = wanted(section, ranked[0]?.match.score ?? 0);
        for (const { product, variant, match } of [...ranked, ...unmatched]) {
            if (left === 0) break;
            // A pick before this one can use up the room this one needed (one per product, a
            // bundle-wide maximum): the builder refuses it and the next candidate gets its turn.
            if (builder.addItem(section.id, variant.id, 1) === 0) continue;
            left -= 1;
            picks.push({ sectionId: section.id, productId: product.id, variantId: variant.id, matched: match.tags });
        }
    }
    return { selections: builder.getState().selections, picks };
}
