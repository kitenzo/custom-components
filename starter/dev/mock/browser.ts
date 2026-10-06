/*
 * Puts the mock backend in front of `fetch` in a browser page.
 *
 * Requests for the headless API and for the theme's cart routes are answered by the backend;
 * everything else (images on Shopify's CDN, Vite's own modules) goes to the network as normal.
 * Cart state is kept in sessionStorage so it survives the redirect to the dev cart page and back,
 * which is what makes the cart's "Edit" round trip testable locally.
 *
 * Exposes `window.__KITENZO_MOCK__` for the dev toolbar and for poking at in the console.
 */
import { createMockBackend, emptyState, type BackendOptions, type BackendState, type MockBackend } from './backend';

const STORAGE_KEY = 'kitenzo-mock-backend';

function loadState(): BackendState {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        // Over an empty state: whatever is in storage, every key the backend reads is there.
        return raw ? { ...emptyState(), ...(JSON.parse(raw) as Partial<BackendState>) } : emptyState();
    } catch {
        return emptyState();
    }
}

function saveState(state: BackendState) {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Private mode or storage blocked: the cart simply does not survive a reload.
    }
    window.dispatchEvent(new CustomEvent('kitenzo-mock:change', { detail: state }));
}

declare global {
    interface Window {
        __KITENZO_MOCK__?: MockBackend;
    }
}

export interface InstallOptions extends Omit<BackendOptions, 'state' | 'onChange'> {
    /** 'cart' answers only the theme's cart routes and lets API requests through to the real API. */
    only?: 'cart';
}

export function installMockBackend(options: InstallOptions): MockBackend {
    const backend = createMockBackend({ ...options, state: loadState(), onChange: saveState });
    const realFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null;
        const url = new URL(request ? request.url : String(input), window.location.href);
        const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
        let body: unknown = null;
        const rawBody = init?.body ?? (request ? await request.clone().text() : null);
        if (typeof rawBody === 'string' && rawBody) {
            try {
                body = JSON.parse(rawBody);
            } catch {
                body = rawBody;
            }
        }
        if (options.only === 'cart' && /\/api\/headless\//.test(url.pathname)) return realFetch(input, init);
        const answer = backend.handle({ method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });
        if (!answer) return realFetch(input, init);

        if (answer.delayMs === Infinity) return new Promise<Response>(() => {});
        if (answer.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, answer.delayMs));
        if (answer.networkError) throw new TypeError('Failed to fetch');
        return new Response(JSON.stringify(answer.body), {
            status: answer.status,
            headers: { 'Content-Type': 'application/json' },
        });
    };

    window.__KITENZO_MOCK__ = backend;
    return backend;
}
