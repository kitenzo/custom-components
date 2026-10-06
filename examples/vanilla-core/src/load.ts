/*
 * Everything a widget needs before it can draw a single bottle: the client, the bundle, the shop's
 * settings, and (when the page was opened from the cart's "Edit") what was in the case before.
 *
 * In the starter this is `<KitenzoProvider>`, `useBundle`, `useSettingsState` and `useBundleEdit`.
 * Here it is the same calls on `@kitenzo/core`, awaited in order.
 */
import { followABTestRedirect, KitenzoClient, KitenzoError, loadBundleEdit, type BundleDetail, type BundleEdit, type ShopSettings } from '@kitenzo/core';

import type { MountConfig } from './config';
import { isThemeEditor } from './themeEditor';

export type Loaded =
    | { state: 'ready'; client: KitenzoClient; bundle: BundleDetail; settings: ShopSettings; edit: BundleEdit }
    /** The shopper belongs to the other variant of an A/B test and the page is on its way there. */
    | { state: 'redirecting' }
    /** The widget that asked is gone, so nothing was done with the answer. */
    | { state: 'cancelled' }
    | { state: 'failed'; status: number | null; message: string };

/**
 * The client for one mount. Call only with a key `keyProblem` accepted: the constructor throws on
 * anything else.
 *
 * `preview` is what `<KitenzoProvider>` switches on by itself inside the theme editor: it lets the
 * merchant design against a draft bundle there. The API still refuses to configure a draft, so no
 * shopper can buy one.
 */
export function createClient(config: MountConfig): KitenzoClient {
    return new KitenzoClient({
        apiKey: config.apiKey,
        baseUrl: config.apiBase,
        countryCode: config.countryCode || undefined,
        preview: isThemeEditor(),
    });
}

/**
 * Load the bundle, the shop's settings and the cart's "Edit".
 *
 * Settings are part of the load: the widget needs them to decide what is offered (sold-out and
 * draft products) and to format money, so a failure is a sentence, never a spinner.
 *
 * Kitenzo's A/B tests need two things from a widget that has no `useBundle`, and the first is
 * here. `getBundle` itself sends the visitor id and says where the shopper belongs; when that is
 * the other variant's page, `followABTestRedirect` navigates there, and the caller keeps its
 * loading state instead of drawing a case the shopper is about to leave. The second, counting the
 * impression, waits until the case is on screen (`recordImpression` below).
 *
 * `isCancelled` is asked once the bundle has answered, before anything is done with it. A section
 * the theme editor unloaded mid-load, or one a theme's own navigation dropped from the page, must
 * not send the shopper anywhere: the page they are on is no longer the one that asked.
 */
export async function loadBundle(client: KitenzoClient, bundleId: number, search: string, isCancelled: () => boolean = () => false): Promise<Loaded> {
    // Asked for alongside the bundle, and awaited after it: a redirect should not wait for them.
    const settingsLoading = settingsWithRetry(client);
    settingsLoading.catch(() => {});
    try {
        const bundle = await client.getBundle(bundleId);
        if (isCancelled()) return { state: 'cancelled' };
        if (followABTestRedirect(bundle)) return { state: 'redirecting' };
        const settings = await settingsLoading;
        // The widget collects no personalisation, so it has no use for what was typed into the
        // edited case: `cart: null` spares the read of the theme's cart that would fetch it.
        const edit = await loadBundleEdit(client, bundle, search, { cart: null });
        return { state: 'ready', client, bundle, settings, edit };
    } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        return { state: 'failed', status: error instanceof KitenzoError ? error.status : null, message: error.message };
    }
}

/**
 * Count this shopper as a visitor of the A/B test the bundle is in, if it is in one.
 *
 * Call it once the case is on screen, not when the bundle is fetched: the count is what the
 * merchant's conversion rate is divided by, so a load that never rendered, or rendered into an
 * element that has left the page, must not add to it.
 * `abTestRouted` is absent for a bundle in no test and for a shopper the test does not measure.
 * The SDK swallows a failure here; an impression is never worth breaking the page for.
 */
export function recordImpression(client: KitenzoClient, bundle: BundleDetail): void {
    if (bundle.abTestRouted) void client.recordImpression(bundle.id, bundle.abTestVisitorId);
}

/** How long to wait before asking for the shop's settings a second time. */
const SETTINGS_RETRY_MS = 4000;

/**
 * The shop's settings, asked for twice: a blip on `/settings` should not cost the shopper the
 * whole case, but a settings endpoint that keeps failing ends in a sentence, never a spinner.
 */
async function settingsWithRetry(client: KitenzoClient): Promise<ShopSettings> {
    try {
        return await client.getSettings();
    } catch {
        await new Promise((resolve) => setTimeout(resolve, SETTINGS_RETRY_MS));
        return client.getSettings();
    }
}
