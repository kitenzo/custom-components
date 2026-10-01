/*
 * One mounted widget: check the config, load the bundle, answer the cart's "Edit", then build.
 *
 * Each gate renders something. A missing key, an unpublished bundle, a slow API: the shopper
 * always sees a sentence or a loading state inside the widget, never a blank space, and the
 * merchant in the theme editor sees what to fix.
 */
import { keyProblem, type MountConfig } from './config';
import { text } from './content';
import { createClient, loadBundle } from './load';
import { toViewModel } from './model';
import { isThemeEditor } from './themeEditor';
import { createBuilder } from './ui/builder';
import { errorState, loading } from './ui/notice';

export interface Mounted {
    destroy: () => void;
}

export function mountWidget(el: HTMLElement, config: MountConfig): Mounted {
    const editor = isThemeEditor();
    const { content } = config;
    let destroyed = false;
    let teardown = () => {};
    const destroy = () => {
        destroyed = true;
        teardown();
        el.replaceChildren();
    };

    if (config.bundleId === null) {
        el.replaceChildren(
            errorState(
                text(content, 'unavailable'),
                'No bundle is selected. Set "Bundle source" to "Selected bundle" and pick one, or paste a draft bundle\'s ID into "Unpublished bundle ID".',
                editor,
            ),
        );
        return { destroy };
    }
    const keyIssue = keyProblem(config.apiKey);
    if (keyIssue) {
        el.replaceChildren(
            errorState(
                text(content, 'unavailable'),
                keyIssue === 'no-key'
                    ? "Add your Kitenzo headless API key in this section's settings. Create one in Kitenzo under Settings, Headless."
                    : "The API key in this section's settings is not a Kitenzo key. Keys start with kit_live_ or kit_test_.",
                editor,
            ),
        );
        return { destroy };
    }

    const bundleId = config.bundleId;
    el.replaceChildren(loading());
    void loadBundle(createClient(config), bundleId, window.location.search).then((loaded) => {
        // The theme editor may have unloaded the section while the API was answering.
        if (destroyed) return;
        if (!loaded.ok) {
            // A 404 is a bundle the merchant unpublished or deleted: an absence, not a fault, so it
            // never tells the shopper to refresh. Anything else is ours to apologise for.
            const { status } = loaded;
            el.replaceChildren(
                errorState(
                    text(content, status === 404 ? 'unavailable' : 'loadFailed'),
                    status === 404
                        ? `Bundle ${bundleId} was not found. It may be unpublished or deleted. A draft previews here only when its ID is in "Unpublished bundle ID".`
                        : status === 401 || status === 403
                          ? `Kitenzo refused the API key (${status}). Check the key is active and that its allowed origins include this store's domain.`
                          : `The bundle could not be loaded${status ? ` (${status})` : ''}. ${loaded.message}`,
                    editor,
                ),
            );
            return;
        }
        const built = createBuilder({
            model: toViewModel(loaded.bundle, { settings: loaded.settings }),
            settings: loaded.settings,
            client: loaded.client,
            config,
            editor,
            edit: loaded.edit,
        });
        teardown = built.destroy;
        el.replaceChildren(built.el);
    });
    return { destroy };
}
