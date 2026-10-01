/*
 * Every word the shopper sees, and the merchant's say over each one.
 *
 * The Liquid section writes the merchant's theme-editor settings into the mount element's
 * `data-content` as one JSON blob. This file is the only reader of it, and it reads defensively:
 *
 *   - anything that is not the type it should be is ignored, so one malformed field never costs
 *     the merchant every other string;
 *   - blank or whitespace-only text falls back to the default (a cleared field means "use the
 *     default", not "show nothing"), except where the setting says blank means "hide";
 *   - the defaults below are the same strings as the schema defaults in theme/, and
 *     test/content.test.ts fails if the two drift.
 *
 * Copy may carry `{count}`, `{step}`, `{amount}`, `{current}`, `{total}`, `{reasons}`
 * placeholders, filled by `fill`.
 *
 * The quiz is content too, and lives in the section's blocks: one "Question" block per question,
 * each with its title, hint, and up to five answers, each answer a label and the product tags it
 * matches. A merchant whose catalogue is tagged differently reconfigures the quiz in the theme
 * editor, without a line of code, and adds, removes or reorders questions the way they would any
 * block. Inside a question, blank means "none" rather than "the default": a cleared answer label
 * removes the answer, a cleared title removes the question, and cleared tags make an answer that
 * steers nothing (a "Both" that should not move the routine).
 */

/** One "Question" block, as the section writes it. Tags are as the merchant typed them. */
export interface QuestionContent {
    title: string;
    hint: string;
    answers: { label: string; tags: string }[];
}

export interface Content {
    /** Blank means "use the bundle's own name". */
    heading: string;
    /** Blank means "use the bundle's own description". */
    intro: string;
    addToCart: string;
    adding: string;
    added: string;
    chooseMore: string;
    chooseMoreStep: string;
    stepCount: string;
    stepCountRange: string;
    stepOptional: string;
    stepFull: string;
    bundleFull: string;
    soldOut: string;
    onlyLeft: string;
    stockReached: string;
    included: string;
    summaryHeading: string;
    summaryEmpty: string;
    total: string;
    saving: string;
    add: string;
    remove: string;
    details: string;
    close: string;
    unavailable: string;
    loadFailed: string;
    editNotice: string;
    editMissing: string;
    notAllowed: string;
    retryAdd: string;
    quizEyebrow: string;
    quizHeading: string;
    quizIntro: string;
    quizStart: string;
    quizSkip: string;
    quizProgress: string;
    back: string;
    routineHeading: string;
    routineIntro: string;
    routineReason: string;
    routineFallback: string;
    routineAdjust: string;
    routineRetake: string;
    recommended: string;
    stepEmpty: string;
    wizardStep: string;
    wizardContinue: string;
    wizardReview: string;
    choose: string;
    chosen: string;
    change: string;
    /** The section's question blocks, in the merchant's order. */
    questions: QuestionContent[];
    afterAdd: 'cart' | 'stay';
    hidePrices: boolean;
}

export const DEFAULT_CONTENT: Content = {
    heading: '',
    intro: '',
    addToCart: 'Add routine to cart',
    adding: 'Adding…',
    added: 'Added to your cart',
    chooseMore: 'Add {count} more to continue',
    chooseMoreStep: 'Add {count} more to “{step}”',
    stepCount: '{count} chosen',
    stepCountRange: '{count} of {range} chosen',
    stepOptional: 'Optional',
    stepFull: 'This step is full. Remove one to choose another.',
    bundleFull: 'Your bundle is full. Remove one to choose another.',
    soldOut: 'Sold out',
    onlyLeft: 'Only {count} left',
    stockReached: 'That is all we have of this one.',
    included: 'Included',
    summaryHeading: 'Your routine',
    summaryEmpty: 'Nothing chosen yet.',
    total: 'Total',
    saving: 'You save {amount}',
    add: 'Add',
    remove: 'Remove',
    details: 'Details',
    close: 'Close',
    unavailable: 'This bundle is not available right now.',
    loadFailed: 'We could not load this bundle. Please refresh the page to try again.',
    editNotice: 'You are editing a bundle from your cart. Adding it again replaces the one in your cart.',
    editMissing: 'Some items from your saved bundle are no longer available, so please choose again.',
    notAllowed: 'This combination cannot be bought as it is. Please change your selection.',
    retryAdd: 'Press the button again to finish adding it; you will not be charged twice.',
    quizEyebrow: 'Skin consultation',
    quizHeading: 'Find your routine',
    quizIntro: 'A few short questions about your skin, and we will build a cleanse, treat and moisturise routine around your answers. You can change anything before it goes in your cart.',
    quizStart: 'Start',
    quizSkip: 'Skip the quiz and choose myself',
    quizProgress: 'Question {current} of {total}',
    back: 'Back',
    routineHeading: 'Your routine',
    routineIntro: 'Chosen from your answers. Change any step, or add the set as it is.',
    routineReason: 'Matches: {reasons}',
    routineFallback: 'Our suggestion for this step',
    routineAdjust: 'Adjust your routine',
    routineRetake: 'Retake the quiz',
    recommended: 'Recommended',
    stepEmpty: 'Not chosen yet',
    wizardStep: 'Step {current} of {total}',
    wizardContinue: 'Continue',
    wizardReview: 'Review your routine',
    choose: 'Choose',
    chosen: 'Chosen',
    change: 'Change',
    questions: [
        {
            title: 'How would you describe your skin?',
            hint: 'Think about how it feels by midday, before any products.',
            answers: [
                { label: 'Dry', tags: 'dry-skin, very-dry-skin' },
                { label: 'Oily', tags: 'oily-skin' },
                { label: 'Combination', tags: 'combination-skin' },
                { label: 'Sensitive', tags: 'sensitive-skin' },
                { label: 'Balanced, or not sure', tags: 'all-skin-types' },
            ],
        },
        {
            title: 'What would you most like to improve?',
            hint: 'Choose the one that matters most to you right now.',
            answers: [
                { label: 'Breakouts', tags: 'acne-prone, blemish-control' },
                { label: 'Dullness and uneven tone', tags: 'brightening, uneven-tone, dullness' },
                { label: 'Fine lines', tags: 'anti-ageing, fine-lines, mature-skin, plumping, peptide' },
                { label: 'Redness and irritation', tags: 'barrier-repair, sensitive-skin' },
                { label: 'Dehydration', tags: 'hydration, hyaluronic-acid' },
            ],
        },
        {
            title: 'When will you use it?',
            hint: 'We lean towards products made for that time of day.',
            answers: [
                { label: 'Mornings', tags: 'morning-only, daily' },
                { label: 'Evenings', tags: 'evening-only, overnight' },
                { label: 'Both', tags: '' },
            ],
        },
    ],
    afterAdd: 'cart',
    hidePrices: false,
};

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * The question blocks, read as defensively as the rest. A missing list (a blob written before the
 * quiz existed, or the dev page) is the default quiz; a list the section wrote, even an empty
 * one, is the merchant's, because removing every block is how they turn the quiz off.
 */
export function parseQuestions(value: unknown): QuestionContent[] {
    if (!Array.isArray(value)) return DEFAULT_CONTENT.questions;
    return value.map((entry) => {
        const question = asRecord(entry);
        return {
            title: asText(question.title),
            hint: asText(question.hint),
            answers: (Array.isArray(question.answers) ? question.answers : []).map((answer) => {
                const fields = asRecord(answer);
                return { label: asText(fields.label), tags: asText(fields.tags) };
            }),
        };
    });
}

type TextKey = { [K in keyof Content]: Content[K] extends string ? K : never }[keyof Content];

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Parse a mount element's `data-content`. A malformed blob is the defaults, never a crash. */
export function parseContent(raw: string | undefined): Content {
    let parsed: unknown = {};
    if (raw) {
        try {
            parsed = JSON.parse(raw);
        } catch {
            parsed = {};
        }
    }
    const input = asRecord(parsed);
    const content: Content = { ...DEFAULT_CONTENT };
    for (const key of Object.keys(DEFAULT_CONTENT) as (keyof Content)[]) {
        const value = input[key];
        const fallback = DEFAULT_CONTENT[key];
        if (typeof fallback === 'string' && key !== 'afterAdd') {
            // Liquid hands a cleared text setting over as '' (or, without `default: ''`, as an
            // empty object). Either way: the default.
            if (typeof value === 'string' && value.trim() !== '') (content as unknown as Record<string, unknown>)[key] = value.trim();
        } else if (typeof fallback === 'boolean') {
            if (typeof value === 'boolean') (content as unknown as Record<string, unknown>)[key] = value;
        }
    }
    content.questions = parseQuestions(input.questions);
    content.afterAdd = input.afterAdd === 'stay' ? 'stay' : 'cart';
    return content;
}

/** Fill `{name}` placeholders. Unknown placeholders are left as written, so a typo is visible. */
export function fill(template: string, values: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

/** One string, filled. The one way a component reads copy. */
export function text(content: Content, key: TextKey, values: Record<string, string | number> = {}): string {
    return fill(content[key], values);
}
