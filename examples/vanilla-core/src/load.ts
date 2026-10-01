/*
 * Everything a widget needs before it can draw a single bottle: the client, the bundle, the shop's
 * settings, and (when the page was opened from the cart's "Edit") what was in the case before.
 *
 * In the starter this is `<KitenzoProvider>`, `useBundle`, `useSettings` and `useBundleEdit`. Here
 * it is the same calls on `@kitenzo/core`, awaited in order, and each of the hooks' quieter jobs
 * is done by hand and named where it happens.
 */
import {
    KitenzoClient,
    KitenzoError,
    readEditTarget,
    selectionsFromSaved,
    type BundleDetail,
    type BundleEditTarget,
    type SavedBundleItem,
    type SectionSelections,
    type ShopSettings,
} from '@kitenzo/core';

import type { MountConfig } from './config';
import { withRequiredVariantIds } from './sdkFixes';
import { isThemeEditor } from './themeEditor';

export interface EditState {
    isEditing: boolean;
    /** The saved case, ready to seed the builder with; null when there is nothing to restore. */
    selections: SectionSelections | null;
    /** Saved bottles this bundle no longer offers. */
    missing: SavedBundleItem[];
    /** The cart line the next add replaces, or null to add alongside it. */
    replace: BundleEditTarget | null;
}

export const NOT_EDITING: EditState = { isEditing: false, selections: null, missing: [], replace: null };

export type Loaded =
    | { ok: true; client: KitenzoClient; bundle: BundleDetail; settings: ShopSettings; edit: EditState }
    | { ok: false; status: number | null; message: string };

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
 * Load the bundle and the shop's settings together.
 *
 * The provider fetched settings on its own and quietly left them null on failure; the starter
 * then waited for them forever. Here they are part of the load: the widget needs them to decide
 * what is offered (sold-out and draft products) and to format money, so a failure is a sentence.
 *
 * What the provider and `useBundle` do NOT do in @kitenzo/react 0.9.0 is anything for A/B tests:
 * `useBundle` is `client.getBundle(id)` and three pieces of state. The release after 0.9.0 adds a
 * redirect to the shopper's variant page and an impression count to `useBundle`. When you
 * upgrade, do both here: redirect before returning (and keep the loading state), and count the
 * impression once the case has rendered. README, "What you give up without @kitenzo/react".
 */
export async function loadBundle(client: KitenzoClient, bundleId: number, search: string): Promise<Loaded> {
    let bundle: BundleDetail;
    let settings: ShopSettings;
    try {
        [bundle, settings] = await Promise.all([client.getBundle(bundleId), settingsWithRetry(client)]);
    } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        return { ok: false, status: error instanceof KitenzoError ? error.status : null, message: error.message };
    }
    // Patched here, the one place a bundle enters the widget, so nothing downstream sees the
    // unpatched data (src/sdkFixes.ts says why).
    const fixed = withRequiredVariantIds(bundle);
    const edit = await loadEdit(client, fixed, search);
    return { ok: true, client, bundle: fixed, settings, edit };
}

/** How long to wait before asking for the shop's settings a second time. */
export const SETTINGS_RETRY_MS = 4000;

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

/**
 * What `useBundleEdit` does: read the cart's "Edit" link, fetch what was saved for that line, and
 * turn it back into selections for this bundle.
 *
 * Everything that goes wrong here degrades to "editing, but starting empty": a saved case for
 * another bundle, a lookup that fails, a case whose every bottle has since sold out. The shopper
 * can still build a case; the notice says why theirs did not come back. With nothing restored
 * there is nothing to replace, so the next add goes in alongside the old line rather than
 * silently removing it.
 */
export async function loadEdit(client: KitenzoClient, bundle: BundleDetail, search: string): Promise<EditState> {
    const target = readEditTarget(search);
    if (!target) return NOT_EDITING;
    const editing: EditState = { ...NOT_EDITING, isEditing: true };
    let saved;
    try {
        saved = await client.getSavedBundle(target);
    } catch {
        return editing;
    }
    if (!saved || saved.bundleId === null || saved.bundleId !== bundle.id) return editing;
    const { selections, missing } = selectionsFromSaved(bundle, saved.items);
    if (Object.keys(selections).length === 0) return { ...editing, missing };
    return {
        isEditing: true,
        selections,
        missing,
        replace: {
            configuredBundleId: saved.configuredBundleId,
            ...(target.uniqueId ? { uniqueId: target.uniqueId } : {}),
            ...(saved.variantId || target.variantId ? { variantId: saved.variantId || target.variantId } : {}),
        },
    };
}
