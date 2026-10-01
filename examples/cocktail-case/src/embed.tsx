/*
 * The storefront entry. The Liquid section renders
 *
 *   <div data-cocktail-case-bundle="42"
 *        data-api-key="kit_live_…"
 *        data-shop-domain="store.myshopify.com"
 *        data-country-code="GB"
 *        data-root-url="/"
 *        data-content='{…}'></div>
 *
 * and this script mounts a widget on every such element. Three things it gets right that a
 * plain `createRoot(el).render(...)` does not:
 *
 *   1. Mounted roots live in a registry on `window`, not in this module. Every section on a page
 *      includes the script, so two sections load two copies of it, and a module-level set would
 *      start empty in the second copy and mount the first section twice.
 *   2. It answers the theme editor's `shopify:section:load` / `shopify:section:unload`. The editor
 *      re-renders a section in place without re-running its scripts; without these the preview
 *      goes blank after every settings change.
 *   3. It remounts when the page comes back from the back-forward cache, so returning from the
 *      cart never shows a stale "Added" state inviting a second add.
 *
 * Imports nothing from dev/: the mock backend and demo catalogue never reach a merchant's theme.
 */
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { App } from './App';
import { readMountConfig } from './config';
import './styles.css';

/** The mount attribute. `bun run rename` rewrites it with the rest of the store's names. */
export const MOUNT_ATTR = 'data-cocktail-case-bundle';
const GLOBAL = '__KITENZO_STARTER__';

interface Registry {
    roots: Map<HTMLElement, Root>;
    listening: boolean;
}

const host = window as unknown as Record<string, Registry | undefined>;
const registry: Registry = (host[GLOBAL] ??= { roots: new Map(), listening: false });

function mount(el: HTMLElement) {
    if (registry.roots.has(el)) return;
    const root = createRoot(el);
    registry.roots.set(el, root);
    root.render(
        <StrictMode>
            <App config={readMountConfig(el, MOUNT_ATTR)} />
        </StrictMode>,
    );
}

function unmount(el: HTMLElement) {
    registry.roots.get(el)?.unmount();
    registry.roots.delete(el);
}

function mountWithin(scope: ParentNode) {
    // A theme's own AJAX navigation can remove a section without an unload event.
    for (const el of registry.roots.keys()) if (!el.isConnected) unmount(el);
    for (const el of scope.querySelectorAll<HTMLElement>(`[${MOUNT_ATTR}]`)) mount(el);
}

function init() {
    mountWithin(document);
    if (registry.listening) return;
    registry.listening = true;

    document.addEventListener('shopify:section:unload', (event) => {
        const section = event.target as Node | null;
        for (const el of registry.roots.keys()) if (section?.contains(el)) unmount(el);
    });
    document.addEventListener('shopify:section:load', (event) => {
        mountWithin((event.target as ParentNode | null) ?? document);
    });
    window.addEventListener('pageshow', (event) => {
        if (!event.persisted) return;
        for (const el of [...registry.roots.keys()]) unmount(el);
        mountWithin(document);
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
