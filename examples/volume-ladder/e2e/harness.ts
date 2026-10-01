/*
 * Mount the built widget the way the Liquid section does, on a hostile theme, against the mock
 * backend, with no server and no network.
 *
 * Every page the suite opens lives at http://store.test. `page.route` answers:
 *   /                     a theme page carrying the mount element(s), exactly as Liquid renders them:
 *                         for the ladder, in the product page's column beside the photos
 *                         (dev/shell.ts); for the grid, in a page-width section
 *   /assets/<file>        the built asset from dist-embed/
 *   /api/headless/v1/…    the mock Kitenzo API
 *   /cart*.js             the mock Shopify AJAX cart
 *   /cart                 a bare cart page (where the widget redirects after an add)
 *   cdn.shopify.com       a 1px image, so tests never wait on photographs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';

import { loadFixtures } from '../dev/catalog';
import { createMockBackend, type MockBackend } from '../dev/mock/backend';
import { combineScenarios, findScenarios } from '../dev/mock/scenarios';
import type { Fixture } from '../dev/mock/wire';
import { galleryPhotos, sectionShell, type DevLayout } from '../dev/shell';

export const ORIGIN = 'http://store.test';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSET = 'kitenzo-volume-ladder';
export const MOUNT_ATTR = 'data-volume-ladder-bundle';
const HOSTILE = readFileSync(resolve(ROOT, 'dev/hostile.css'), 'utf8');
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

function asset(file: string): Buffer {
    try {
        return readFileSync(resolve(ROOT, 'dist-embed', file));
    } catch {
        throw new Error(`dist-embed/${file} is missing. Run \`bun run build:embed\` first (\`bun run test:e2e\` does).`);
    }
}

const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface OpenOptions {
    scenarios?: string[];
    sections?: number;
    content?: Record<string, unknown>;
    /** Override or add mount attributes, e.g. { 'data-api-key': '' }. */
    attributes?: Record<string, string>;
    /** Query string for the page, e.g. '?edit=9001&edit_uid=…'. */
    query?: string;
    /** Reuse a backend (and its cart) across page loads. */
    backend?: MockBackend;
    rootUrl?: string;
    /** Extra markup for <head>, e.g. the <style> block the Liquid section writes. */
    head?: string;
    /** The section's Layout setting. The suite runs on both. */
    layout?: DevLayout;
    /** A change to the bundle no scenario makes (a sold-out flavour, a bundle maximum). */
    transform?: (fixture: Fixture) => Fixture;
}

export const LAYOUTS: DevLayout[] = ['ladder', 'grid'];

export async function openWidget(page: Page, options: OpenOptions = {}) {
    const combined = combineScenarios(findScenarios(options.scenarios ?? []));
    const fixtures = loadFixtures().map(combined.transform).map(options.transform ?? ((fixture) => fixture));
    const layout = options.layout ?? 'ladder';
    const backend = options.backend ?? createMockBackend({ fixtures, behaviour: combined.behaviour });
    const bundleId = fixtures[0]!.bundle.id;
    const rootUrl = options.rootUrl ?? '/';

    const mount = (index: number) => {
        const attributes: Record<string, string> = {
            id: `kitenzo-${index}`,
            [MOUNT_ATTR]: String(bundleId),
            'data-api-key': 'kit_test_e2e',
            'data-api-base': `${ORIGIN}/api/headless/v1`,
            'data-shop-domain': 'bundle-builder-demo-store-1.myshopify.com',
            'data-country-code': combined.countryCode ?? 'GB',
            'data-root-url': rootUrl,
            'data-layout': layout,
            'data-content': JSON.stringify(options.content ?? {}),
            ...options.attributes,
        };
        const attrs = Object.entries(attributes)
            .map(([key, value]) => `${key}="${escapeAttr(value)}"`)
            .join(' ');
        return `<div class="shopify-section" id="shopify-section-${index}"><div ${attrs}></div><script src="/assets/${ASSET}.js" defer></script></div>`;
    };
    const sections = Array.from({ length: options.sections ?? 1 }, (_, index) => mount(index + 1)).join('\n');
    const designMode = combined.designMode ? '<script>window.Shopify = { designMode: true };</script>' : '';
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="/assets/${ASSET}.css"><style>${HOSTILE}</style>${designMode}${options.head ?? ''}</head>
        <body><header style="position:sticky;top:0;z-index:5;background:#1b407c;color:#fff;padding:12px">Hostile theme</header>
        <main class="theme-main">${sectionShell(layout, galleryPhotos(fixtures[0]!)).replace('data-mount-here>', `data-mount-here>${sections}`)}</main><footer style="height:200px"></footer></body></html>`;

    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.hostname === 'cdn.shopify.com') return route.fulfill({ body: PIXEL, contentType: 'image/png' });
        if (url.origin !== ORIGIN) return route.abort();

        const body = request.postData();
        const answer = backend.handle({
            method: request.method(),
            path: url.pathname,
            query: Object.fromEntries(url.searchParams),
            body: body ? JSON.parse(body) : null,
        });
        if (answer) {
            if (answer.delayMs === Infinity) return; // never answered
            if (answer.delayMs > 0) await new Promise((done) => setTimeout(done, Math.min(answer.delayMs, 3000)));
            if (answer.networkError) return route.abort('connectionreset');
            return route.fulfill({ status: answer.status, contentType: 'application/json', body: JSON.stringify(answer.body) });
        }
        if (url.pathname.startsWith('/assets/')) {
            const file = url.pathname.slice('/assets/'.length);
            return route.fulfill({ body: asset(file), contentType: file.endsWith('.css') ? 'text/css' : 'text/javascript' });
        }
        if (/\/cart\/?$/.test(url.pathname)) return route.fulfill({ body: '<!doctype html><h1>Cart</h1>', contentType: 'text/html' });
        return route.fulfill({ body: html, contentType: 'text/html' });
    });

    await page.goto(`${ORIGIN}/${options.query ?? ''}`);
    return { backend, fixtures };
}

/** The widget root that is mounted and visible. */
export const widget = (page: Page, index = 0) => page.getByTestId('cc-root').nth(index);

/** The add-to-cart button the shopper can see at this viewport (rail on desktop, bar on mobile). */
export const buyButton = (page: Page) => page.getByTestId('cc-add-to-cart').filter({ visible: true }).first();

export const product = (page: Page, handle: string) => page.locator(`[data-cc-product="${handle}"]`).first();

/** Press "Add" (or "+") on a product `times` times. */
export async function pick(page: Page, handle: string, times = 1) {
    for (let index = 0; index < times; index += 1) {
        await product(page, handle).getByTestId('cc-pick').click();
    }
}

/** A complete, valid selection for the demo bundle: three pouches, two flavours (the 15% tier). */
export async function completeSelection(page: Page) {
    await pick(page, 'chocolate-whey-protein', 2);
    await pick(page, 'vanilla-whey-protein', 1);
}

/** A fixture change: every variant of one product sold out. */
export const soldOutProduct = (handle: string) => (fixture: Fixture): Fixture => ({
    ...fixture,
    products: fixture.products.map((product) =>
        product.handle === handle
            ? { ...product, variants: product.variants.map((variant) => ({ ...variant, available: false, maxOrderableQuantity: 0, inventoryQuantity: 0 })) }
            : product,
    ),
});

/** A fixture change: a bundle-wide maximum the demo bundle does not have. */
export const withBundleMax = (max: number) => (fixture: Fixture): Fixture => ({
    ...fixture,
    bundle: {
        ...fixture.bundle,
        limitRules: [...fixture.bundle.limitRules, { operation: 'lte', sectionId: null, type: 'total-number-of-products', value: max.toFixed(2) }],
    },
});

export function requestsTo(backend: MockBackend, pattern: RegExp) {
    return backend.requests.filter((request) => pattern.test(request.path));
}
