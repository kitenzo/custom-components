import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The deliverable: a self-contained IIFE (React and the Kitenzo SDK bundled in) plus one CSS file,
 * written to dist-embed/. Those two files, and the Liquid section in theme/, are everything a
 * merchant installs.
 *
 * No aliases, and nothing under dev/ is reachable from src/embed.tsx, so the mock backend and the
 * demo catalogue can never reach a merchant's theme.
 */

/**
 * The stem every deliverable carries. A theme's assets/ folder is one flat namespace shared with
 * the theme's own files and every other app's; the `kitenzo-` prefix tells a merchant which files
 * are ours. `bun run rename` rewrites it.
 */
const ASSET = 'kitenzo-cocktail-case';

export default defineConfig({
    plugins: [react()],
    // React reads process.env.NODE_ENV, which does not exist in a theme. Without this the
    // production build ships React's development checks.
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
        outDir: 'dist-embed',
        emptyOutDir: true,
        cssCodeSplit: false,
        // Fonts come from the theme (guides/best-practices.md), so nothing should ever be inlined.
        assetsInlineLimit: 0,
        // Vite names the stylesheet after the package unless told otherwise, and the two halves of
        // one deliverable must share a stem.
        rollupOptions: { output: { assetFileNames: `${ASSET}.[ext]` } },
        lib: {
            entry: 'src/embed.tsx',
            formats: ['iife'],
            name: 'KitenzoCocktailCase',
            fileName: () => `${ASSET}.js`,
        },
    },
});
