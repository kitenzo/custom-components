/*
 * What the shopper types for a product (an engraving, a card message) and how it reaches the order.
 *
 * The field definitions are the bundle's (`bundle.personalisation`, keyed by Shopify product id),
 * never written here: a merchant renames a label, changes a limit or adds a field in Kitenzo, and
 * the widget follows. The route into the cart is the SDK's: the answers are handed to `addToCart`
 * as `properties`, and it puts each one on the cart line of the product it belongs to, named by the
 * field's frozen `key` (never its `label`, which the merchant may reword after orders exist), adds
 * a line for any fee a filled field carries, refuses the add while a required field has no answer,
 * and keeps a record on the cart so the cart's "Edit" can bring the answers back.
 *
 * Every line of one bundle carries the same `_bundle_data`
 * (`<configured id>#<parent variant>#<instance>`), so an order with two gift boxes reads as two
 * groups of lines, each with its own engraving and its own message. A message sent anywhere else
 * (a cart note, a separate line) cannot be matched to its box.
 *
 * What this file owns is the form: which fields it can draw and the answers as typed. Whether an
 * answer is acceptable is the SDK's to say (`missingPersonalisation`, `personalisationFieldProblems`).
 * The SDK would cut an answer over its character limit on its way to the cart; an engraving must
 * never be shortened behind the shopper's back, so the widget asks the SDK first, holds the add
 * and asks them to shorten it.
 *
 * One answer per product per box. Kitenzo defines personalisation per product, so two of the same
 * matchbox in one box (or one in Brass and one in Matte Black) share an engraving.
 */
import {
    missingPersonalisation,
    personalisationFieldProblems,
    personalisationValuesToProperties,
    propertiesToPersonalisationValues,
    takesLineProperties,
    type BundleDetail,
    type BundleLineProperties,
    type NormalisedLineProperties,
    type PersonalisationField,
    type SectionSelections,
} from '@kitenzo/react';

export type Field = PersonalisationField;

/** The shopper's answers as typed: product id → field id → what they typed or chose. */
export type Answers = Record<string, Record<string, string>>;

/** A product in the box, as far as its form is concerned. */
export interface Personalised {
    id: string;
    title: string;
    fields: Field[];
}

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
 * Whether this widget can draw a field. An `image` field needs somewhere to host the shopper's
 * file, which neither the SDK nor this widget has: the SDK takes the image's web address, not the
 * image.
 */
export function isCollectable(field: Field): boolean {
    return field.type !== 'image';
}

/**
 * Every field the bundle asks for on a product. None for a bundle whose lines cannot carry an
 * answer (only a native bundle's can): the SDK asks for nothing there, so neither does the form.
 */
export function definedFields(bundle: BundleDetail, productId: string): Field[] {
    return takesLineProperties(bundle) ? (bundle.personalisation?.[productId] ?? []) : [];
}

/** The fields this widget renders and sends for a product. */
export function fieldsFor(bundle: BundleDetail, productId: string): Field[] {
    return definedFields(bundle, productId).filter(isCollectable);
}

/**
 * The character limit the merchant set on a text field, or null when they set none. Read as the
 * SDK reads it, so the counter is drawn for exactly the fields `personalisationFieldProblems` can
 * find too long.
 */
export function limitOf(field: Field): number | null {
    return field.type === 'text' && field.characterLimit ? field.characterLimit : null;
}

/**
 * How long an answer is, counted the way the SDK counts it against the limit (surrounding
 * whitespace off, then `String.length`, so an emoji is two). Counting any other way would show
 * "0 left" on an answer the SDK finds too long.
 */
export function lengthOf(raw: string | undefined): number {
    return (raw ?? '').trim().length;
}

/** One answer as it will be written on the order, or '' when nothing will be. */
export function written(field: Field, raw: string | undefined): string {
    return personalisationValuesToProperties([field], { [field.id]: raw ?? '' })[field.key] ?? '';
}

/**
 * The answers as `addToCart` takes them: everything typed, under the product it was typed for.
 * An engraving typed for a matchbox the shopper took back out is handed over with the rest; the
 * SDK puts an answer only on a line of its product, charges a fee only for a unit that carries
 * one, and keeps in the cart's record only what landed on a line, so it goes no further.
 */
export function lineProperties(bundle: BundleDetail, answers: Answers): BundleLineProperties {
    const byProduct: Record<string, Record<string, string>> = {};
    for (const [productId, typed] of Object.entries(answers)) {
        const properties = personalisationValuesToProperties(fieldsFor(bundle, productId), typed);
        if (Object.keys(properties).length > 0) byProduct[productId] = properties;
    }
    return { byProduct };
}

/** What a box was added with, as answers to pre-fill the form on the cart's "Edit". */
export function answersFromProperties(bundle: BundleDetail, properties: NormalisedLineProperties | null): Answers {
    const answers: Answers = {};
    for (const [productId, stored] of Object.entries(properties?.byProduct ?? {})) {
        const values = propertiesToPersonalisationValues(fieldsFor(bundle, productId), stored);
        if (Object.keys(values).length > 0) answers[productId] = values;
    }
    return answers;
}

/**
 * Every answer that stops this box going into the cart, in the order the shopper meets the
 * products. Both findings are the SDK's: "missing" is `missingPersonalisation` (the same check its
 * cart flow refuses an add on), "too long" is `personalisationFieldProblems` (the answers its
 * conversion to properties would cut). Only the products in the box are asked about: an answer
 * left behind by a product taken back out is nobody's problem.
 */
export function fieldIssues(bundle: BundleDetail, selections: SectionSelections, boxed: Personalised[], answers: Answers): FieldIssue[] {
    const missing = new Set(missingPersonalisation(bundle, selections, lineProperties(bundle, answers)).map((entry) => `${entry.productId}:${entry.field.id}`));
    return boxed.flatMap((product) => {
        const problems = personalisationFieldProblems(product.fields, answers[product.id] ?? {});
        return product.fields.flatMap<FieldIssue>((field) => {
            const problem = problems[field.id];
            if (problem?.code === 'too-long') return [{ productId: product.id, productTitle: product.title, field, kind: 'too-long', over: problem.over }];
            if (missing.has(`${product.id}:${field.id}`)) return [{ productId: product.id, productTitle: product.title, field, kind: 'missing', over: 0 }];
            return [];
        });
    });
}
