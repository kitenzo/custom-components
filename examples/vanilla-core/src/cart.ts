/*
 * Adding the case to the theme's cart, without `useBundleAjaxCart`.
 *
 * The engine still does every part that decides money: `client.submitBundle` configures the case
 * (and signs its discount), `addBundleToCart` builds the lines, adds them, reads the cart's
 * attributes back and merges this case into `_bundles`, which Kitenzo's Cart Transform reads at
 * checkout. `createAjaxCartOperations` is the theme's `/cart/*.js`, locale prefix included, with
 * every non-2xx turned into an `AjaxCartError` that carries a sentence for the shopper.
 *
 * What the hook did around those calls is here, in about the same number of lines:
 *
 *   - the phases (configuring, adding, attributes, added, failed), so the button can say what is
 *     happening and only "added" ever means "safe to check out";
 *   - one add at a time (`busy`);
 *   - a lost connection is not a refusal: the lines may have landed, so the next press reads the
 *     cart back before adding anything, instead of risking a second case the shopper pays for;
 *   - a basket Edit replaces the case it came from, using core's own `findEditedLines`,
 *     `hasOtherNativeInstance` and `withoutBundleDefinition` exactly as the hook does.
 *
 * Two of the hook family's guards do not apply to this transport, and are not here: `cart-busy`
 * and `hasMissingItems` belong to the Storefront API (Hydrogen) hook, whose cart can be mid-update
 * and silently drop a line. `/cart/add.js` adds every line or answers 422. README, "What you give
 * up", has the detail.
 */
import {
    AjaxCartError,
    addBundleToCart,
    createAjaxCartOperations,
    findEditedLines,
    hasOtherNativeInstance,
    withoutBundleDefinition,
    type BundleDetail,
    type BundleEditTarget,
    type BundleType,
    type CartLine,
    type CartOperations,
    type KitenzoClient,
    type SectionSelections,
    type ShopSettings,
    type SubmitBundleResult,
} from '@kitenzo/core';

export type CartPhase = 'idle' | 'configuring' | 'adding' | 'attributes' | 'added' | 'failed';

export interface CartState {
    phase: CartPhase;
    /** An add is in flight: hold every control that changes the case. */
    busy: boolean;
    /** Lines AND `_bundles` are on the cart. Only now is checkout safe. */
    added: boolean;
    /** The failure, written for the shopper. Never `error.message`, which carries routes and statuses. */
    shopperMessage: string | null;
    /** The failure, for the console and the theme editor. Never rendered on the storefront. */
    error: Error | null;
    /**
     * A configured add is held after a failure that may have left its lines in the cart (a dropped
     * connection, a failed `_bundles` write). The next press finishes THAT add, with the selection
     * it started with, so the widget must hold the selection until it does. `useBundleAjaxCart`
     * leaves this for the widget to infer (`failureReason === 'cart-error'` and an error that is not
     * an `AjaxCartError`); here the flow knows, so it says.
     */
    resumable: boolean;
}

export const IDLE: CartState = { phase: 'idle', busy: false, added: false, shopperMessage: null, error: null, resumable: false };

/** What every failure says when the cart gave us nothing quotable. Same words as the SDK's. */
const FALLBACK = 'We could not add this to your cart. Please try again.';

export interface CartFlowOptions {
    client: KitenzoClient;
    settings: ShopSettings | null;
    /** '' at the root, '/en-gb' under a locale path. */
    routePrefix: string;
    /** The case a basket Edit started from, which the next add replaces. */
    replace: BundleEditTarget | null;
    onChange: (state: CartState) => void;
    /** Tests only: answer the cart routes without a network. */
    fetchImpl?: typeof fetch;
}

export interface CartFlow {
    readonly state: CartState;
    /** Configure and add. Resolves true once the case is safely in the cart; never rejects. */
    add: (bundle: BundleDetail, selections: SectionSelections) => Promise<boolean>;
    /** Back to idle. Ignored mid-add, and while a lost add is waiting to be checked. */
    reset: () => void;
}

/** A configured case that has not been confirmed in the cart yet. */
interface Pending {
    result: SubmitBundleResult;
    bundle: BundleDetail;
    selections: SectionSelections;
    /** A request went missing after `/configure`: read the cart before adding anything again. */
    uncertain: boolean;
    replace: BundleEditTarget | null;
    original: Original;
    /** The instance id of the lines this add sent, so replacing the original can never remove them. */
    addedInstance?: string;
}

interface Original {
    /** A merged native line's quantity: the shopper had this many of the case. */
    instanceQuantity: number;
    /** The edited native case was still in the cart when the add started. */
    seen: boolean;
}

const attribute = (line: CartLine, key: string) => line.attributes.find((entry) => entry.key === key)?.value;

/** The instance id a native case's lines share (`_bundle_data` = "<configured>#<parent>#<instance>"). */
function instanceOf(line: CartLine): string | undefined {
    return attribute(line, '_unique_id') ?? attribute(line, '_bundle_data')?.split('#')[2];
}

function sameTarget(a: BundleEditTarget | null, b: BundleEditTarget | null): boolean {
    return Boolean(a && b && a.configuredBundleId === b.configuredBundleId && a.uniqueId === b.uniqueId && a.variantId === b.variantId);
}

export function createCartFlow(options: CartFlowOptions): CartFlow {
    const { client, settings, routePrefix, onChange } = options;
    const operations = createAjaxCartOperations({ routePrefix, fetchImpl: options.fetchImpl });
    let state: CartState = IDLE;
    let inFlight = false;
    let pending: Pending | null = null;
    /** The edit target already replaced: adding again from the same page adds a second case. */
    let replaced: BundleEditTarget | null = null;

    const set = (phase: CartPhase, extra: Partial<CartState> = {}) => {
        state = { ...state, shopperMessage: null, error: null, resumable: false, ...extra, phase, busy: phase === 'configuring' || phase === 'adding' || phase === 'attributes', added: phase === 'added' };
        onChange(state);
    };

    const fail = (cause: unknown) => {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        // `shopperMessage` is set by AjaxCartError (Shopify's own reason, or a plain sentence) and
        // by RecurringChoiceError. Everything else, a configure refusal included, gets the fallback.
        const carried = (error as { shopperMessage?: unknown }).shopperMessage;
        set('failed', { error, shopperMessage: typeof carried === 'string' && carried.trim() ? carried : FALLBACK, resumable: pending !== null });
        console.warn('[kitenzo] add to cart failed', error);
    };

    /** The edit target this add may replace. A native case is one instance among duplicates, so it needs its instance id. */
    const armed = (bundle: BundleDetail): BundleEditTarget | null => {
        const target = options.replace;
        if (!target || sameTarget(target, replaced)) return null;
        if (bundle.type === 'native' && !target.uniqueId) return null;
        return target;
    };

    async function readOriginal(target: BundleEditTarget, type: BundleType): Promise<Original> {
        try {
            const original = findEditedLines(await operations.getLines!(), target, type);
            const merged = original.filter((line) => attribute(line, '_unique_id'));
            return { instanceQuantity: Math.max(1, ...merged.map((line) => line.quantity)), seen: original.length > 0 };
        } catch {
            return { instanceQuantity: 1, seen: false };
        }
    }

    /** Take the edited case out, now that its replacement is safely in. As `useBundleAjaxCart` does it. */
    async function removeOriginal(p: Pending): Promise<void> {
        const target = p.replace!;
        const type = p.bundle.type;
        // A native case that was not in the cart when the add started has been removed already
        // (another tab, the shopper): never go looking for something else to remove.
        if (type === 'native' && !p.original.seen) return;
        const lines = await operations.getLines!();
        const original = findEditedLines(lines, target, type).filter((line) => line.key);
        if (type === 'native') {
            const own = original.filter((line) => instanceOf(line) !== p.addedInstance);
            if (own.length === 0) return;
            await operations.setLineQuantities!(Object.fromEntries(own.map((line) => [line.key!, 0])));
            // Duplicates of one configuration share its `_bundles` entry: it goes only with the last.
            const remaining = lines.filter((line) => !own.includes(line));
            if (target.configuredBundleId !== undefined && !hasOtherNativeInstance(remaining, target.configuredBundleId, target.uniqueId ?? '')) {
                const attributes = withoutBundleDefinition(await operations.getAttributes(), target.configuredBundleId);
                if (attributes) await operations.setAttributes(attributes);
            }
            return;
        }
        // One ghost line per configuration: take one off it.
        const line = original[0];
        if (line) await operations.setLineQuantities!({ [line.key!]: Math.max(0, line.quantity - 1) });
    }

    /** Are this configuration's lines already in the cart? The answer to a lost `/cart/add.js`. */
    async function linesLanded(p: Pending): Promise<boolean> {
        const id = String(p.result.configuredBundleId);
        const ghost = `gid://shopify/ProductVariant/${p.result.variantId.replace(/^gid:\/\/shopify\/ProductVariant\//, '')}`;
        return (await operations.getLines!()).some(
            (line) =>
                (p.bundle.type === 'single-product' && line.merchandiseId === ghost) ||
                attribute(line, '_configured_bundle_id') === id ||
                attribute(line, '_bundle_data')?.split('#')[0] === id,
        );
    }

    /**
     * The cart, as `addBundleToCart` drives it, with two things added at the seam it offers: the
     * `attributes` phase is reported when it starts reading them, a merged native case goes back
     * in at the quantity the shopper had, and the lines' instance id is noted for the replacement.
     */
    function cartFor(p: Pending, skipLines: boolean): CartOperations {
        const quantity = p.bundle.type === 'native' ? p.original.instanceQuantity : 1;
        return {
            ...operations,
            addLines: (lines) => {
                if (skipLines) return undefined;
                p.addedInstance = lines[0] ? instanceOf(lines[0]) : undefined;
                return operations.addLines(quantity > 1 ? lines.map((line) => ({ ...line, quantity: line.quantity * quantity })) : lines);
            },
            getAttributes: () => {
                set('attributes');
                return operations.getAttributes();
            },
        };
    }

    async function settle(p: Pending): Promise<boolean> {
        set('adding');
        try {
            const skipLines = p.uncertain && (await linesLanded(p));
            p.uncertain = false;
            await addBundleToCart(p.result, cartFor(p, skipLines), { bundle: p.bundle, selections: p.selections }, { settings });
        } catch (cause) {
            // Shopify refused the lines themselves: nothing was written, so the next press starts
            // over with a fresh configuration. Anything else (a dropped connection, a failed
            // attribute write) may have left the lines in the cart: keep this one and check first.
            if (cause instanceof AjaxCartError && /\/cart\/add\.js$/.test(cause.url)) pending = null;
            else p.uncertain = true;
            fail(cause);
            return false;
        }
        if (p.replace) {
            try {
                await removeOriginal(p);
            } catch (cause) {
                // The new case is in and discounted; the old one staying is the lesser problem,
                // and the shopper can see and remove it in the cart.
                console.warn('[kitenzo] the edited case is in the cart, but the original could not be removed', cause);
            }
            replaced = p.replace;
        }
        pending = null;
        set('added');
        return true;
    }

    return {
        get state() {
            return state;
        },
        async add(bundle, selections) {
            if (inFlight) return false;
            inFlight = true;
            try {
                if (!pending) {
                    set('configuring');
                    let result: SubmitBundleResult;
                    try {
                        result = await client.submitBundle(bundle, selections);
                    } catch (cause) {
                        fail(cause);
                        return false;
                    }
                    const replace = armed(bundle);
                    const original = replace ? await readOriginal(replace, bundle.type) : { instanceQuantity: 1, seen: false };
                    pending = { result, bundle, selections, uncertain: false, replace, original };
                }
                return await settle(pending);
            } finally {
                inFlight = false;
            }
        },
        reset() {
            if (inFlight || pending) return;
            state = IDLE;
            onChange(state);
        },
    };
}
