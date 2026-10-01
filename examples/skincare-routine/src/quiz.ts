/*
 * The quiz: its questions, read from the theme settings, and the routine its answers build.
 *
 * Answers map to product TAGS, never to product handles or ids. The merchant already tags their
 * catalogue for their own collections and filters ("dry-skin", "acne-prone"); a quiz that reads
 * those tags keeps working when a product is added to a step, renamed, or swapped for a new
 * formula, and a merchant with different tags rewires it in the theme editor (content.ts).
 *
 * `planRoutine` is pure and has no say over what is sold. It reads each step's count from the
 * bundle's own rules (through the model), skips anything sold out, and its result still goes
 * through `clampSeed` and the SDK's builder like any other seed. It cannot put a product in a
 * routine that the shopper could not have picked by hand.
 */
import type { SectionSelections } from '@kitenzo/react';

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

function firstAvailableVariant(product: ViewProduct) {
    return product.soldOut ? undefined : product.variants.find((variant) => variant.available);
}

/**
 * How many products the quiz puts in a step: the step's own minimum. A step with no minimum is
 * optional, so it gets one only when something in it matched the answers and the step allows one.
 */
function wanted(section: ViewSection, bestScore: number): number {
    if (section.limits.min > 0) return section.limits.min;
    return bestScore > 0 && section.limits.max >= 1 ? 1 : 0;
}

/**
 * The routine for a set of answers, step by step.
 *
 * Products that match more answers come first; a tie keeps the merchant's own order in the step.
 * Sold-out products (and sold-out sizes) are never picked. When nothing in a step matches, or too
 * little matches to meet the step's minimum, the rest comes from the first available products in
 * the merchant's order, marked as a fallback so the widget does not claim a match it did not make.
 * Each product goes in once, in its first available variant.
 */
export function planRoutine(model: ViewModel, answers: QuizAnswer[]): RoutinePlan {
    const selections: SectionSelections = {};
    const picks: Recommendation[] = [];
    for (const section of model.sections) {
        const candidates = section.products.flatMap((product, index) => {
            const variant = firstAvailableVariant(product);
            return variant ? [{ product, variant, index, match: matchProduct(product, answers) }] : [];
        });
        const ranked = candidates
            .filter((candidate) => candidate.match.score > 0)
            .sort((a, b) => b.match.score - a.match.score || a.index - b.index);
        const count = wanted(section, ranked[0]?.match.score ?? 0);
        const chosen = ranked.slice(0, count);
        for (const candidate of candidates) {
            if (chosen.length >= count) break;
            if (!chosen.includes(candidate)) chosen.push({ ...candidate, match: { score: 0, tags: [] } });
        }
        for (const { product, variant, match } of chosen) {
            (selections[section.id] ??= []).push({ variantId: variant.id, quantity: 1 });
            picks.push({ sectionId: section.id, productId: product.id, variantId: variant.id, matched: match.tags });
        }
    }
    return { selections, picks };
}
