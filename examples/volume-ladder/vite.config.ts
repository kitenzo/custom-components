import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * `bun run dev`: the widget on a stand-in theme page (index.html) against the mock backend.
 *
 * The widget redirects to `<root>/cart` after an add, as it does on a store. This serves the mock
 * cart page there, with or without a locale prefix, so the add, the cart and the cart's "Edit"
 * all run end to end locally.
 */
function mockCartPage(): Plugin {
    return {
        name: 'kitenzo-mock-cart-page',
        configureServer(server) {
            server.middlewares.use((req, _res, next) => {
                if (req.url && /^(?:\/[a-z]{2}(?:-[a-z]{2,4})?)?\/cart\/?(?:\?.*)?$/i.test(req.url)) req.url = '/dev/cart.html';
                next();
            });
        },
    };
}

export default defineConfig({
    plugins: [react(), mockCartPage()],
    server: { port: 5186 },
});
