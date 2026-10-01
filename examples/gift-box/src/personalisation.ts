/*
 * What the shopper types for a product (an engraving, a card message) and how it reaches the order.
 *
 * The field definitions are the bundle's (`bundle.personalisation`, keyed by Shopify product id),
 * never written here: a merchant renames a label, changes a limit or adds a field in Kitenzo, and
 * the widget follows. What the widget owns is the shopper's answers, their validation, and the
 * route into the cart.
 *
 * The route. Each answer goes onto the cart line of the product it belongs to, as a line item
 * property named by the field's frozen `key` (never its `label`, which the merchant may reword
 * after orders exist). Every line of one bundle already carries the same `_bundle_data`
 * (`<configured id>#<parent variant>#<instance>`), so an order with two gift boxes reads as two
 * groups of lines, each with its own engraving and its own message. A message sent anywhere
 * else (a cart note, a separate line, a cart attribute) cannot be matched to its box.
 *
 * `useBundleAjaxCart` has no option for line properties (an SDK gap, see README). Its `fetchImpl`
 * option is the seam: `personalisedFetch` adds the answers to the `/cart/add.js` body on its way
 * out and touches nothing else, so the hook still does the configure, the add, the `_bundles`
 * merge, the Edit replacement and the shopper-safe error messages.
 *
 * One answer per product per box. Kitenzo defines personalisation per product, so two of the same
 * matchbox in one box (or one in Brass and one in Matte Black) share an engraving.
 */
import type { BundleDetail, BundleProduct, BundleSelection, SectionSelections } from '@kitenzo/react';

/** One personalisation field, as the bundle defines it. Read off the SDK's type so it cannot drift. */
export type Field = NonNullable<BundleDetail['personalisation']>[string][number];

/** The shopper's answers: product id → field id → what they typed or chose. */
export type Answers = Record<string, Record<string, string>>;

/** Variant id (numeric, as the AJAX cart sends it) → the properties its line should carry. */
export type LinePlan = Map<string, Record<string, string>>;

export type FieldIssueKind = 'missing' | 'too-long';

export interface FieldIssue {
    productId: string;
    productTitle: string;
    field: Field;
    kind: FieldIssueKind;
    /** For `too-long`: how many characters over the limit. */
    over: number;
}

/**
 * Why this widget cannot collect a field, or null when it can.
 *
 * `image` needs an upload the shopper's file is hosted from, and a field with a fee needs its fee
 * product added as a line of its own; neither is in the SDK, and either one done halfway sells
 * the engraving for nothing or loses the photo.
 */
export function unsupportedReason(field: Field): 'image' | 'fee' | null {
    if (field.type === 'image') return 'image';
    if (field.fee || (field.feeOptionId !== null && field.feeOptionId !== undefined)) return 'fee';
    return null;
}

/** Every field the bundle defines for a product, collectable or not. */
export function definedFields(bundle: BundleDetail, productId: string): Field[] {
    return bundle.personalisation?.[productId] ?? [];
}

/** The fields this widget renders and sends for a product. */
export function fieldsFor(bundle: BundleDetail, productId: string): Field[] {
    return definedFields(bundle, productId).filter((field) => unsupportedReason(field) === null);
}

/**
 * Length as the shopper counts it: "café" is 4, an emoji is 1. Counting UTF-16 units would tell
 * someone with an accent on a dead key that they are over a limit they can see they are under.
 */
export function characterCount(value: string): number {
    return [...value].length;
}

/** What is sent: the answer without surrounding whitespace. A checkbox is "Yes" or nothing. */
export function normalise(field: Field, raw: string | undefined): string {
    const value = (raw ?? '').trim();
    if (field.type === 'checkbox') return value === 'Yes' ? 'Yes' : '';
    if (field.type === 'dropdown') return (field.options ?? []).includes(value) ? value : '';
    return value;
}

/** Why one answer cannot be sent, or null when it can. */
export function checkAnswer(field: Field, raw: string | undefined): { kind: FieldIssueKind; over: number } | null {
    const value = normalise(field, raw);
    if (value === '') return field.required ? { kind: 'missing', over: 0 } : null;
    const limit = field.characterLimit;
    if (field.type === 'text' && limit && limit > 0 && characterCount(value) > limit) {
        return { kind: 'too-long', over: characterCount(value) - limit };
    }
    return null;
}

/**
 * The products going into the box, in the order the shopper meets them: every step's picks, then
 * the required products (in every box, so their fields are always asked for).
 */
export function chosenProducts(bundle: BundleDetail, selections: SectionSelections): BundleProduct[] {
    const picks: BundleSelection[] = Object.values(selections).flat();
    const picked = new Set(picks.filter((pick) => pick.quantity > 0).map((pick) => pick.variantId));
    const seen = new Map<string, BundleProduct>();
    for (const section of [...bundle.sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
        for (const product of section.products) {
            if (!seen.has(product.id) && product.variants.some((variant) => picked.has(variant.id))) seen.set(product.id, product);
        }
    }
    for (const entry of bundle.requiredProducts ?? []) {
        if (entry.product && !seen.has(entry.product.id)) seen.set(entry.product.id, entry.product);
    }
    return [...seen.values()];
}

/**
 * Every answer that stops this selection going into the cart, in the order the shopper meets the
 * products. Only products in the box are checked: an engraving for a matchbox the shopper took
 * back out is not missing.
 */
export function fieldIssues(bundle: BundleDetail, selections: SectionSelections, answers: Answers): FieldIssue[] {
    return chosenProducts(bundle, selections).flatMap((product) =>
        fieldsFor(bundle, product.id).flatMap<FieldIssue>((field) => {
            const issue = checkAnswer(field, answers[product.id]?.[field.id]);
            return issue ? [{ productId: product.id, productTitle: product.title, field, ...issue }] : [];
        }),
    );
}

/** The cart line id the AJAX cart uses: the numeric variant id, whatever form it arrives in. */
function lineId(variantId: string | number): string {
    return String(variantId).replace(/^gid:\/\/shopify\/ProductVariant\//, '');
}

/**
 * The properties each of this selection's lines should carry, by variant id. Blank optional
 * answers are left off (an empty "Card message" on a packing slip reads as a mistake), and the
 * property name is always the field's `key`.
 */
export function linePlan(bundle: BundleDetail, selections: SectionSelections, answers: Answers): LinePlan {
    const plan: LinePlan = new Map();
    for (const product of chosenProducts(bundle, selections)) {
        const properties: Record<string, string> = {};
        for (const field of fieldsFor(bundle, product.id)) {
            const value = normalise(field, answers[product.id]?.[field.id]);
            if (value !== '') properties[field.key] = value;
        }
        if (Object.keys(properties).length === 0) continue;
        for (const variant of product.variants) plan.set(lineId(variant.id), properties);
    }
    return plan;
}

interface AjaxAddBody {
    items?: { id: number | string; quantity: number; properties?: Record<string, string> }[];
    [other: string]: unknown;
}

/**
 * The `/cart/add.js` body with each line's answers added. The SDK's own properties are written
 * last, so a field whose key happened to be `_bundle_data` could never pull a line out of its box.
 */
export function withLineProperties(body: AjaxAddBody, plan: LinePlan): AjaxAddBody {
    if (!Array.isArray(body.items) || plan.size === 0) return body;
    return {
        ...body,
        items: body.items.map((item) => {
            const extra = plan.get(lineId(item.id));
            return extra ? { ...item, properties: { ...extra, ...item.properties } } : item;
        }),
    };
}

const ADD_ROUTE = /\/cart\/add\.js$/;

function pathOf(input: RequestInfo | URL): string {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    try {
        return new URL(raw, 'https://placeholder.invalid').pathname;
    } catch {
        return raw;
    }
}

/**
 * A `fetch` for `useBundleAjaxCart`'s `fetchImpl` that adds the current plan's properties to the
 * `/cart/add.js` request and passes every other request through untouched.
 *
 * `currentPlan` is read when the request goes out, not when the hook is created: the hook keeps
 * one fetch for its lifetime, while the answers change with every keystroke. `base` is looked up
 * on each call too, so whatever `fetch` the page has at that moment (a theme's wrapper, the dev
 * mock) is the one used.
 */
export function personalisedFetch(currentPlan: () => LinePlan, base: () => typeof fetch = () => fetch): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (method !== 'POST' || !ADD_ROUTE.test(pathOf(input)) || typeof init?.body !== 'string') return base()(input, init);
        let body: AjaxAddBody;
        try {
            body = JSON.parse(init.body) as AjaxAddBody;
        } catch {
            return base()(input, init);
        }
        return base()(input, { ...init, body: JSON.stringify(withLineProperties(body, currentPlan())) });
    }) as typeof fetch;
}
