/*
 * A product's option grid (Size by Colour), as this widget draws it.
 *
 * The rule underneath all of it is the SDK's: option order is significance order. A value is
 * offered or withheld based only on the options BEFORE it (`reachableOptionValues`), and changing
 * one repairs only the options AFTER it (`selectOptionValue`). On these products Size comes first,
 * so a shopper's size is never moved by a colour change; a size change may move the colour, and
 * when it does the widget says so (`repairs`) instead of doing it quietly.
 *
 * This file adds only what the SDK leaves to a UI: which option is drawn as swatches and in what
 * colour, why an unreachable value is unreachable (in words a shopper can act on), which
 * photograph belongs to a choice, and the plan for "Match colours". Everything is a pure function
 * of the product and the values, so test/options.test.ts drives it without a browser.
 */
import {
    defaultOptionValues,
    reachableOptionValues,
    resolveVariant,
    selectOptionValue,
    type BundleProduct,
    type BundleVariant,
    type OptionSelection,
    type ProductOption,
} from '@kitenzo/react';

function orderedOptions(product: BundleProduct): ProductOption[] {
    return [...(product.options ?? [])].sort((a, b) => a.position - b.position);
}

/** Every variant names a value for every option. Without that there is no grid to resolve. */
export function hasOptionGrid(product: BundleProduct): boolean {
    const options = product.options ?? [];
    return options.length > 0 && product.variants.every((variant) => (variant.optionValues?.length ?? 0) === options.length);
}

/** Options the shopper chooses between. A single-value option ("Size: One size") is not a choice. */
function choosableOptions(product: BundleProduct): ProductOption[] {
    return orderedOptions(product).filter((option) => option.values.length > 1);
}

// ----- Swatches ---------------------------------------------------------------------------------

/** "Colour, Color" → ['colour', 'color']. */
export function parseNameList(raw: string): string[] {
    return raw
        .split(',')
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean);
}

/**
 * Only colour syntax a merchant would type: hex, rgb()/hsl(), or one CSS colour word. Anything
 * else is ignored rather than handed to a style, so a stray `url(` or `;` in a textarea can never
 * become CSS.
 */
const SAFE_COLOUR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/]+\)|[a-z]{3,30})$/i;

/** "Onyx: #1d1d1f", one per line → value (lower case) → colour. Malformed lines are skipped. */
export function parseSwatchColours(raw: string): Map<string, string> {
    const colours = new Map<string, string>();
    for (const line of raw.split(/\r?\n/)) {
        const at = line.indexOf(':');
        if (at <= 0) continue;
        const name = line.slice(0, at).trim().toLowerCase();
        const colour = line.slice(at + 1).trim();
        if (name && SAFE_COLOUR.test(colour)) colours.set(name, colour);
    }
    return colours;
}

/** Drawn as swatches: named so in the merchant's setting, or carrying Shopify's own swatches. */
function isSwatchOption(option: ProductOption, swatchNames: string[]): boolean {
    return swatchNames.includes(option.name.trim().toLowerCase()) || Object.keys(option.swatches ?? {}).length > 0;
}

export function swatchOptionOf(product: BundleProduct, swatchNames: string[]): ProductOption | null {
    return choosableOptions(product).find((option) => isSwatchOption(option, swatchNames)) ?? null;
}

export interface Swatch {
    /** A CSS colour to fill the swatch with. */
    color: string | null;
    /** A photograph to fill it with instead. */
    image: string | null;
}

/**
 * What one swatch is painted with, best source first:
 *
 *   1. the merchant's own mapping in the section settings (a brand's "Moss" is its own green);
 *   2. Shopify's native swatch for the value, colour or image, when the API sends one;
 *   3. the value itself, when it is a colour word ("Black", "Navy");
 *   4. a photograph of a variant in that value, cropped, so the swatch still shows the colour;
 *   5. nothing: the swatch shows the value's initial on a neutral tile.
 */
export function swatchFor(
    product: BundleProduct,
    option: ProductOption,
    value: string,
    colours: Map<string, string>,
    isCssColour: (value: string) => boolean = cssColour,
): Swatch {
    const mapped = colours.get(value.trim().toLowerCase());
    if (mapped) return { color: mapped, image: null };
    const native = option.swatches?.[value];
    if (native?.color && SAFE_COLOUR.test(native.color)) return { color: native.color, image: null };
    if (native?.imageUrl) return { color: null, image: native.imageUrl };
    if (/^[a-z]+$/i.test(value) && isCssColour(value)) return { color: value.toLowerCase(), image: null };
    const index = orderedOptions(product).findIndex((candidate) => candidate.name === option.name);
    const photo = product.variants.find((variant) => variant.optionValues?.[index] === value && variant.image)?.image;
    return { color: null, image: photo ?? null };
}

function cssColour(value: string): boolean {
    return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('color', value);
}

// ----- Values, variants and why a value is out of reach -----------------------------------------

function matches(product: BundleProduct, variant: BundleVariant, values: OptionSelection): boolean {
    return orderedOptions(product).every((option, index) => values[option.name] === undefined || variant.optionValues?.[index] === values[option.name]);
}

/**
 * Where a product's choice starts. The swatch option (and any single-value option) is filled from
 * the first buyable variant, so the card opens on a real photograph and price. Every other choice
 * (the size) starts empty: a size picked for the shopper is a return waiting to happen.
 *
 * A piece restored from the cart (basket Edit) starts on exactly the variant it was.
 */
export function initialValues(product: BundleProduct, swatchNames: string[], chosen?: BundleVariant): OptionSelection {
    const options = orderedOptions(product);
    if (chosen?.optionValues && chosen.optionValues.length === options.length) {
        return Object.fromEntries(options.map((option, index) => [option.name, chosen.optionValues![index]!]));
    }
    const values = defaultOptionValues(product);
    for (const option of options) {
        if (option.values.length > 1 && !isSwatchOption(option, swatchNames)) delete values[option.name];
    }
    return values;
}

/** The first option the shopper still has to choose, or null when every choice is made. */
export function missingOption(product: BundleProduct, values: OptionSelection): ProductOption | null {
    return choosableOptions(product).find((option) => values[option.name] === undefined) ?? null;
}

export interface Resolved {
    /** The exact variant chosen, once every option has a value. Possibly sold out. */
    variant: BundleVariant | null;
    /** What to show meanwhile (photograph, price): the first buyable variant consistent with the choice. */
    preview: BundleVariant;
}

export function resolve(product: BundleProduct, values: OptionSelection): Resolved {
    const consistent = () => product.variants.find((variant) => matches(product, variant, values));
    // `resolveVariant` only answers with something buyable. A complete choice that is sold out
    // still IS the shopper's choice: show it, sold out, rather than jump to another variant.
    const variant = missingOption(product, values) === null ? (resolveVariant(product, values) ?? consistent() ?? null) : null;
    const preview = variant ?? resolveVariant(product, values) ?? consistent() ?? product.variants[0]!;
    return { variant, preview };
}

/** Why a value cannot be chosen right now. */
export type Unreachable =
    /** Sold out whatever else is chosen. */
    | { kind: 'sold-out' }
    /** Sold out in the shopper's earlier choices: `choice` is those values, "XS" or "XS / Long". */
    | { kind: 'sold-out-with'; choice: string }
    /** The product does not come in it at all (Match colours only). */
    | { kind: 'not-made' };

export interface ValueState {
    value: string;
    reachable: boolean;
    why: Unreachable | null;
}

export interface OptionState {
    option: ProductOption;
    /** The chosen value, or '' while unchosen. */
    value: string;
    swatch: boolean;
    values: ValueState[];
}

function whyUnreachable(product: BundleProduct, values: OptionSelection, option: ProductOption, value: string): Unreachable {
    // Reachable with nothing chosen before it: the earlier choices are what rule it out.
    if (!reachableOptionValues(product, {}, option.name).includes(value)) return { kind: 'sold-out' };
    const options = orderedOptions(product);
    const before = options.slice(0, options.findIndex((candidate) => candidate.name === option.name));
    const choice = before.map((candidate) => values[candidate.name]).filter((entry): entry is string => Boolean(entry));
    return { kind: 'sold-out-with', choice: choice.join(' / ') };
}

/** Every option the shopper chooses, with each value reachable or not, and why not. */
export function optionStates(product: BundleProduct, values: OptionSelection, swatchNames: string[]): OptionState[] {
    return choosableOptions(product).map((option) => {
        const reachable = new Set(reachableOptionValues(product, values, option.name));
        return {
            option,
            value: values[option.name] ?? '',
            swatch: isSwatchOption(option, swatchNames),
            values: option.values.map((value) => {
                const ok = reachable.has(value);
                return { value, reachable: ok, why: ok ? null : whyUnreachable(product, values, option, value) };
            }),
        };
    });
}

export interface Repair {
    option: string;
    previous: string;
    value: string;
}

/**
 * Apply one option change through the SDK, and report what it repaired. The repairs are only ever
 * options AFTER the one changed; the widget announces each one, because a colour that changes
 * without a word looks like a bug.
 */
export function choose(product: BundleProduct, values: OptionSelection, optionName: string, value: string): { values: OptionSelection; repairs: Repair[] } {
    const next = selectOptionValue(product, values, optionName, value);
    const repairs = orderedOptions(product)
        .filter((option) => option.name !== optionName && values[option.name] !== undefined && next[option.name] !== values[option.name])
        .map((option) => ({ option: option.name, previous: values[option.name]!, value: next[option.name]! }));
    return { values: next, repairs };
}

/** The photograph for a choice: the chosen colour's own, falling back to the product's. */
export function imageFor(product: BundleProduct, values: OptionSelection, fallback: string | undefined): string | undefined {
    const { variant, preview } = resolve(product, values);
    if (variant?.image) return variant.image;
    if (preview.image && matches(product, preview, values)) return preview.image;
    return product.variants.find((candidate) => candidate.image && matches(product, candidate, values))?.image ?? fallback;
}

// ----- Surcharges -------------------------------------------------------------------------------

/**
 * What picking a variant adds to the set, in display currency: the SDK's `money.surcharge`. The
 * amount is never worked out here, only which option value to name beside it.
 */
export type SurchargeOf = (variant: BundleVariant) => number;

/**
 * The one option value a variant's surcharge belongs to, so the widget can say "Slate adds £5"
 * rather than "XS / Slate adds £5": the value whose every variant carries the same surcharge.
 * Falls back to the variant's title when no single value explains it.
 */
export function surchargeCause(product: BundleProduct, variant: BundleVariant, surchargeOf: SurchargeOf): string {
    const amount = surchargeOf(variant);
    for (const [index, option] of orderedOptions(product).entries()) {
        if (option.values.length < 2) continue;
        const value = variant.optionValues?.[index];
        const same = product.variants.filter((candidate) => candidate.optionValues?.[index] === value);
        if (value && same.every((candidate) => surchargeOf(candidate) === amount)) return value;
    }
    return variant.title;
}

/** The surcharge every variant in `value` carries, for a "+£5" on its swatch; 0 when they differ. */
export function valueSurcharge(product: BundleProduct, option: ProductOption, value: string, surchargeOf: SurchargeOf): number {
    const index = orderedOptions(product).findIndex((candidate) => candidate.name === option.name);
    const amounts = product.variants.filter((variant) => variant.optionValues?.[index] === value).map(surchargeOf);
    return amounts.length > 0 && amounts.every((amount) => amount === amounts[0]) ? amounts[0]! : 0;
}

// ----- Match colours ----------------------------------------------------------------------------

export interface Piece {
    key: string;
    product: BundleProduct;
    values: OptionSelection;
}

/** Every swatch value across the pieces, in the order the first piece to carry it lists them. */
export function matchableValues(pieces: Piece[], swatchNames: string[]): string[] {
    const seen: string[] = [];
    for (const piece of pieces) {
        for (const value of swatchOptionOf(piece.product, swatchNames)?.values ?? []) if (!seen.includes(value)) seen.push(value);
    }
    return seen;
}

export interface MatchPlan {
    apply: { key: string; values: OptionSelection }[];
    blocked: { key: string; why: Unreachable }[];
}

/**
 * Put every piece in one colour where that colour can be had, and list the pieces where it
 * cannot, with the reason. The match is just `selectOptionValue` on each piece's swatch option,
 * so the significance rule holds: a piece whose chosen size is sold out in the colour is reported,
 * never moved to another size to reach it.
 */
export function planColourMatch(pieces: Piece[], swatchNames: string[], value: string): MatchPlan {
    const plan: MatchPlan = { apply: [], blocked: [] };
    for (const piece of pieces) {
        const option = swatchOptionOf(piece.product, swatchNames);
        if (!option) continue;
        if (!option.values.includes(value)) {
            plan.blocked.push({ key: piece.key, why: { kind: 'not-made' } });
            continue;
        }
        if (!reachableOptionValues(piece.product, piece.values, option.name).includes(value)) {
            plan.blocked.push({ key: piece.key, why: whyUnreachable(piece.product, piece.values, option, value) });
            continue;
        }
        plan.apply.push({ key: piece.key, values: selectOptionValue(piece.product, piece.values, option.name, value) });
    }
    return plan;
}
