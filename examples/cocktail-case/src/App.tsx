/*
 * One mounted widget: check the config, load the bundle, answer the cart's "Edit", then build.
 *
 * Each gate renders something. A missing key, an unpublished bundle, a slow API: the shopper
 * always sees a sentence or a loading state inside the widget, never a blank space, and the
 * merchant in the theme editor sees what to fix.
 */
import { useEffect, useMemo, useState } from 'react';

import { KitenzoError, KitenzoProvider, readRecurringSubscriptionId, useBundle, useBundleEdit, useKitenzo, useSettings, type BundleDetail, type ShopSettings } from '@kitenzo/react';

import { keyProblem, type MountConfig } from './config';
import { text } from './content';
import { toViewModel } from './model';
import { withRequiredVariantIds } from './sdkFixes';
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
    // A Recurring bundles reminder email links back here with `?subscription=<id>`. Fetched with
    // that id, the bundle carries the subscription, and `useRecurringPlan` turns it into a reorder
    // at the member price. Read once: the URL does not change under a mounted widget.
    const [subscriptionId] = useState(() => readRecurringSubscriptionId());
    // From the SDK release after 0.9.0, useBundle also runs Kitenzo's A/B tests: it may redirect this shopper to the other
    // variant's page, keeping isLoading true while it does. Keep rendering the loading state.
    const { bundle, isLoading, error } = useBundle(bundleId, { subscriptionId });

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
    return <BundleWithEdit loaded={bundle} config={config} editor={editor} subscriptionId={subscriptionId} />;
}

/**
 * The shop's settings, or a failure.
 *
 * The provider fetches them once on mount and stays quiet if that fails, leaving `useSettings()`
 * null forever: a widget that waits for it would spin for good. So after a few seconds without
 * them, ask once more, and report a failure if that fails too.
 */
function useShopSettings(): { settings: ShopSettings | null; failed: boolean } {
    const provided = useSettings();
    const client = useKitenzo();
    const [fetched, setFetched] = useState<ShopSettings | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        if (provided) return undefined;
        let cancelled = false;
        const timer = window.setTimeout(() => {
            client.getSettings().then(
                (settings) => !cancelled && setFetched(settings),
                () => !cancelled && setFailed(true),
            );
        }, 4000);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [provided, client]);
    return { settings: provided ?? fetched, failed: !provided && !fetched && failed };
}

function BundleWithEdit({ loaded, config, editor, subscriptionId }: { loaded: BundleDetail; config: MountConfig; editor: boolean; subscriptionId: string | null }) {
    const bundle = useMemo(() => withRequiredVariantIds(loaded), [loaded]);
    const edit = useBundleEdit(bundle);
    const { settings, failed } = useShopSettings();
    // The model decides what is offered from the shop's settings (sold-out, drafts), so the
    // builder waits for them rather than rendering once without and then rearranging itself.
    const model = useMemo(() => (settings ? toViewModel(bundle, { settings }) : null), [bundle, settings]);
    if (failed) {
        return <ErrorState editor={editor} message={text(config.content, 'loadFailed')} detail={<p>The shop's settings could not be loaded from Kitenzo, so prices cannot be shown in the shop's format.</p>} />;
    }
    if (edit.isLoading || !model || !settings) return <Loading />;
    return <Builder model={model} settings={settings} config={config} editor={editor} edit={edit} subscriptionId={subscriptionId} />;
}
