/*
 * Shared by the dev server, the gallery and the e2e harness: read the page's query string, put the
 * mock backend in front of fetch, and render mount elements the way the Liquid section does.
 *
 *   ?scenario=cart-422,market-eur   one or more scenarios (dev/mock/scenarios.ts)
 *   ?theme=hostile                  load the hostile theme rules
 *   ?sections=2                     two sections on one page (two copies of the script)
 *   ?bundle=1001                    which fixture to mount
 *   ?edit=…&edit_uid=…              the cart's "Edit" link (handled by the widget itself)
 *   ?live=1&bundle=<id>             a real bundle from the real API, with your key from .env
 *                                   (VITE_KITENZO_API_KEY); the cart stays mocked
 */
import { installMockBackend } from './mock/browser';
import { combineScenarios, findScenarios } from './mock/scenarios';
import type { Fixture } from './mock/wire';

export const MOCK_API_BASE = '/mock/api/headless/v1';
export const MOCK_API_KEY = 'kit_test_mock_key_for_local_dev_only';

export interface PageOptions {
    fixtures: Fixture[];
    /** The mount attribute the widget looks for. */
    mountAttr: string;
    /** Settings the Liquid section would write into data-content. */
    content?: Record<string, unknown>;
    /** Extra data attributes the Liquid section would write (data-layout, …). */
    attributes?: Record<string, string>;
    /** Where the mount elements go. */
    container: HTMLElement;
}

export function pageParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        scenarioIds: (params.get('scenario') ?? '').split(',').map((id) => id.trim()).filter(Boolean),
        hostile: params.get('theme') === 'hostile',
        sections: Math.max(1, Math.min(3, Number(params.get('sections')) || 1)),
        bundleId: Number(params.get('bundle')) || null,
        live: params.get('live') === '1',
    };
}

const HOSTILE_CONTENT = {
    heading: `Maman's "Best" <b>Box</b> & more`,
    intro: `It's a test: </div><script>document.body.dataset.pwned='1'</script> & an apostrophe's apostrophe.`,
    addToCart: `Add Maman's box`,
};

export function setUpPage(options: PageOptions) {
    const params = pageParams();
    const combined = combineScenarios(findScenarios(params.scenarioIds));
    const fixtures = options.fixtures.map(combined.transform);

    if (combined.designMode) {
        (window as unknown as { Shopify: { designMode: boolean } }).Shopify = { designMode: true };
    }
    if (params.hostile) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = new URL('./hostile.css', import.meta.url).href;
        document.head.append(link);
    }

    const liveKey = import.meta.env.VITE_KITENZO_API_KEY as string | undefined;
    const live = params.live && Boolean(liveKey);
    if (params.live && !liveKey) console.warn('?live=1 needs VITE_KITENZO_API_KEY in .env (see .env.example). Using the mock backend.');
    installMockBackend({ fixtures, behaviour: combined.behaviour, ...(live ? { only: 'cart' as const } : {}) });

    const bundleId = params.bundleId ?? fixtures[0]!.bundle.id;
    const content = params.scenarioIds.includes('hostile-strings') ? { ...options.content, ...HOSTILE_CONTENT } : options.content ?? {};

    const render = () => {
        options.container.replaceChildren();
        for (let index = 0; index < params.sections; index += 1) {
            const section = document.createElement('div');
            section.className = 'theme-section shopify-section';
            section.id = `shopify-section-${index + 1}`;
            const mount = document.createElement('div');
            mount.id = `kitenzo-${index + 1}`;
            mount.setAttribute(options.mountAttr, String(bundleId));
            mount.dataset.apiKey = live ? liveKey! : MOCK_API_KEY;
            mount.dataset.apiBase = live ? (import.meta.env.VITE_KITENZO_API_BASE as string | undefined) || 'https://live.bb.eight-cdn.com/api/headless/v1' : MOCK_API_BASE;
            mount.dataset.shopDomain = 'bundle-builder-demo-store-1.myshopify.com';
            mount.dataset.countryCode = combined.countryCode ?? 'GB';
            mount.dataset.rootUrl = '/';
            // What `| json | escape` produces, decoded by the browser: the exact string the widget reads.
            mount.dataset.content = JSON.stringify(content);
            for (const [key, value] of Object.entries(options.attributes ?? {})) mount.setAttribute(key, value);
            section.append(mount);
            options.container.append(section);
        }
    };
    render();
    return { params, combined, render };
}

/** What the theme editor does after a settings change: unload the section, swap its markup, load it. */
export function simulateSectionReload(container: HTMLElement) {
    for (const section of container.querySelectorAll<HTMLElement>('.shopify-section')) {
        section.dispatchEvent(new CustomEvent('shopify:section:unload', { bubbles: true }));
        const fresh = section.cloneNode(true) as HTMLElement;
        for (const mount of fresh.querySelectorAll('*')) mount.replaceChildren();
        section.replaceWith(fresh);
        fresh.dispatchEvent(new CustomEvent('shopify:section:load', { bubbles: true }));
    }
}
