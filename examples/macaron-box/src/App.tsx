/*
 * One mounted widget: check the config, load the bundle, answer the cart's "Edit", then build.
 *
 * Each gate renders something. A missing key, an unpublished bundle, a slow API: the shopper
 * always sees a sentence or a loading state inside the widget, never a blank space, and the
 * merchant in the theme editor sees what to fix.
 */
import { KitenzoError, KitenzoProvider, useBundle, useBundleEdit, useSettingsState, type BundleDetail } from '@kitenzo/react';

import { keyProblem, type MountConfig } from './config';
import { text } from './content';
import { isThemeEditor } from './themeEditor';
import { Builder } from './ui/Builder';
import { ErrorState, Loading } from './ui/Notice';

export function App({ config }: { config: MountConfig }) {
    const editor = isThemeEditor();
    const { content } = config;

    if (config.bundleId === null) {
        return (
            <ErrorState
                editor={editor}
                message={text(content, 'unavailable')}
                detail={<p>No bundle is selected. Set "Bundle source" to "Selected bundle" and pick one, or paste a draft bundle's ID into "Unpublished bundle ID".</p>}
            />
        );
    }
    const keyIssue = keyProblem(config.apiKey);
    if (keyIssue) {
        return (
            <ErrorState
                editor={editor}
                message={text(content, 'unavailable')}
                detail={
                    <p>
                        {keyIssue === 'no-key'
                            ? 'Add your Kitenzo headless API key in this section\'s settings. Create one in Kitenzo under Settings, Headless.'
                            : 'The API key in this section\'s settings is not a Kitenzo key. Keys start with kit_live_ or kit_test_.'}
                    </p>
                }
            />
        );
    }

    return (
        <KitenzoProvider apiKey={config.apiKey} baseUrl={config.apiBase} countryCode={config.countryCode || undefined}>
            <BundleLoader bundleId={config.bundleId} config={config} editor={editor} />
        </KitenzoProvider>
    );
}

function BundleLoader({ bundleId, config, editor }: { bundleId: number; config: MountConfig; editor: boolean }) {
    // useBundle also runs Kitenzo's A/B tests: it may redirect this shopper to the other variant's
    // page, keeping isLoading true while it does. Keep rendering the loading state.
    const { bundle, isLoading, error } = useBundle(bundleId);

    if (error) {
        // A 404 is a bundle the merchant unpublished or deleted: an absence, not a fault, so it
        // never tells the shopper to refresh. Anything else is ours to apologise for.
        const status = error instanceof KitenzoError ? error.status : null;
        const notFound = status === 404;
        return (
            <ErrorState
                editor={editor}
                message={text(config.content, notFound ? 'unavailable' : 'loadFailed')}
                detail={
                    <p>
                        {notFound
                            ? `Bundle ${bundleId} was not found. It may be unpublished or deleted. A draft previews here only when its ID is in "Unpublished bundle ID".`
                            : status === 401 || status === 403
                              ? `Kitenzo refused the API key (${status}). Check the key is active and that its allowed origins include this store's domain.`
                              : `The bundle could not be loaded${status ? ` (${status})` : ''}. ${error.message}`}
                    </p>
                }
            />
        );
    }
    if (isLoading || !bundle) return <Loading />;
    return <BundleWithEdit bundle={bundle} config={config} editor={editor} />;
}

function BundleWithEdit({ bundle, config, editor }: { bundle: BundleDetail; config: MountConfig; editor: boolean }) {
    const edit = useBundleEdit(bundle);
    // What is offered depends on the shop's settings (sold-out, drafts), so the builder waits for
    // them rather than rendering once without and then rearranging itself.
    const { settings, error } = useSettingsState();
    if (error && !settings) {
        return <ErrorState editor={editor} message={text(config.content, 'loadFailed')} detail={<p>The shop's settings could not be loaded from Kitenzo, so prices cannot be shown in the shop's format.</p>} />;
    }
    if (edit.isLoading || !settings) return <Loading />;
    return <Builder bundle={bundle} settings={settings} config={config} editor={editor} edit={edit} />;
}
