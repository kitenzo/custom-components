/*
 * What one mount element says about the store it is on.
 *
 * Read per element and passed down as props, never parked on a window global: two sections on one
 * page would otherwise both render with whichever mounted last.
 *
 * Each value comes from the Liquid section (theme/kitenzo-activewear-set.liquid), which takes it from
 * the theme itself: the shop's domain, the shopper's country (`localization`), the locale prefix
 * (`routes.root_url`). None of them is ever hardcoded, here or in the Liquid.
 */
import { parseContent, type Content } from './content';

/** The production headless API. Overridden only by a `data-api-base` attribute (dev) or VITE_ env. */
export const DEFAULT_API_BASE = 'https://live.bb.eight-cdn.com/api/headless/v1';

export interface MountConfig {
    bundleId: number | null;
    apiKey: string;
    apiBase: string;
    shopDomain: string;
    /** ISO 3166-1 alpha-2, from the theme's localization. Blank means the shop's own currency. */
    countryCode: string;
    /** `routes.root_url`: `/`, or `/en-gb` on a market served under a path. */
    rootUrl: string;
    content: Content;
}

export type ConfigProblem = 'no-bundle' | 'no-key' | 'bad-key';

/**
 * The SDK client throws in its constructor on any key that is not `kit_live_`/`kit_test_`. So the
 * key is checked here, before a provider is built, and a bad one becomes a sentence rather than a
 * white screen. Never substitute a placeholder key "to keep it rendering": that IS the white screen.
 */
export function keyProblem(apiKey: string): ConfigProblem | null {
    if (!apiKey) return 'no-key';
    return /^kit_(live|test)_\S+$/.test(apiKey) ? null : 'bad-key';
}

/**
 * The whole attribute or nothing. `parseInt("42x")` is 42, which would quietly load a bundle the
 * section never named.
 */
export function parseBundleId(raw: string | undefined): number | null {
    const trimmed = (raw ?? '').trim();
    return /^\d+$/.test(trimmed) && Number(trimmed) > 0 ? Number(trimmed) : null;
}

/** `/` stays `/`; `/en-gb/` becomes `/en-gb`. Anything that is not a path is the root. */
export function normaliseRootUrl(raw: string | undefined): string {
    const trimmed = (raw ?? '').trim();
    if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/';
    return trimmed === '/' ? '/' : trimmed.replace(/\/+$/, '');
}

/** The cart routes' prefix for the SDK: '' at the root, '/en-gb' under a locale path. */
export function routePrefix(rootUrl: string): string {
    return rootUrl === '/' ? '' : rootUrl;
}

export function cartUrl(rootUrl: string): string {
    return `${routePrefix(rootUrl)}/cart`;
}

export function readMountConfig(el: HTMLElement, mountAttr: string): MountConfig {
    const data = el.dataset;
    // .env values are for the dev server only. Vite writes any `import.meta.env.VITE_*` it can see
    // into the build as plain text, so reading them unguarded would ship a developer's own key and
    // API base inside every merchant's theme asset. `DEV` is false in `build:embed`, and the whole
    // branch is dropped from the output.
    const env = import.meta.env.DEV ? import.meta.env : { VITE_KITENZO_API_KEY: '', VITE_KITENZO_API_BASE: '' };
    return {
        bundleId: parseBundleId(el.getAttribute(mountAttr) ?? undefined),
        apiKey: (data.apiKey || env.VITE_KITENZO_API_KEY || '').trim(),
        apiBase: (data.apiBase || env.VITE_KITENZO_API_BASE || DEFAULT_API_BASE).trim(),
        shopDomain: (data.shopDomain || '').trim(),
        countryCode: (data.countryCode || '').trim().toUpperCase(),
        rootUrl: normaliseRootUrl(data.rootUrl),
        content: parseContent(data.content),
    };
}
