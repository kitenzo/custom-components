/*
 * `bun run dev`: the widget on a stand-in theme page, against the mock backend.
 *
 * Everything the widget receives comes through the same doors as on a real store: data
 * attributes on a mount element, the headless API, the theme's AJAX cart. Change the bundle in
 * dev/catalog.ts, the merchant's settings in `CONTENT` below.
 */
import { loadFixtures } from './catalog';
import { setUpPage } from './page';
import { mountToolbar } from './toolbar';

/** The theme-editor settings the Liquid section would write. Blank text means "use the default". */
const CONTENT = {
    heading: '',
    intro: '',
    afterAdd: 'cart',
};

const container = document.getElementById('theme-main')!;
setUpPage({ fixtures: loadFixtures(), mountAttr: 'data-starter-bundle', content: CONTENT, container });
mountToolbar(container);

// Imported after the page is set up, exactly as the theme loads the asset after the section's markup.
await import('../src/embed');
