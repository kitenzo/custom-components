/*
 * `bun run dev`: the widget on a stand-in theme page, against the mock backend.
 *
 * Everything the widget receives comes through the same doors as on a real store: data
 * attributes on a mount element, the headless API, the theme's AJAX cart. Change the bundle in
 * dev/catalog.ts, the merchant's settings in `CONTENT` below.
 */
import { loadFixtures } from './catalog';
import { setUpPage } from './page';
import { serveReorderLinks } from './reorder';
import { mountToolbar } from './toolbar';

/** The theme-editor settings the Liquid section would write. Blank text means "use the default". */
const CONTENT = {
    heading: '',
    intro: '',
    afterAdd: 'cart',
};

/*
 * What the Liquid section writes from the theme's own font settings (`type_header_font`,
 * `type_body_font`): the faces, and the two custom properties on the mount element. This stand-in
 * theme's fonts are a drinks brand's; the widget only ever reads the variables, never a font name.
 */
const THEME_FONTS = `
    #theme-main [data-cocktail-case-bundle] {
        --ckc-font-heading: 'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif;
        --ckc-font-body: 'DM Sans', 'Helvetica Neue', Arial, sans-serif;
    }`;
const fonts = document.createElement('link');
fonts.rel = 'stylesheet';
fonts.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=DM+Sans:opsz,wght@9..40,400..700&display=swap';
const fontVars = document.createElement('style');
fontVars.textContent = THEME_FONTS;
document.head.append(fonts, fontVars);

const container = document.getElementById('theme-main')!;
setUpPage({ fixtures: loadFixtures(), mountAttr: 'data-cocktail-case-bundle', content: CONTENT, container });
// The shared mock ignores `?subscription=`; this answers the demo reorder link (dev/reorder.ts).
serveReorderLinks(window.__KITENZO_MOCK__!);
mountToolbar(container);

// Imported after the page is set up, exactly as the theme loads the asset after the section's markup.
await import('../src/embed');
