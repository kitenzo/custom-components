/*
 * `bun run dev`: the widget on a stand-in theme's product page, against the mock backend.
 *
 * Everything the widget receives comes through the same doors as on a real store: data
 * attributes on a mount element, the headless API, the theme's AJAX cart. Change the bundle in
 * dev/catalog.ts, the merchant's settings in `CONTENT` below.
 *
 *   ?layout=grid   the section's Layout setting set to Grid (the default is the ladder, in the
 *                  product page's column beside the photos)
 */
import { loadFixtures } from './catalog';
import { setUpPage } from './page';
import { galleryPhotos, sectionShell, type DevLayout } from './shell';
import { mountToolbar } from './toolbar';

/** The theme-editor settings the Liquid section would write. Blank text means "use the default". */
const CONTENT = {
    heading: '',
    intro: '',
    afterAdd: 'cart',
};

const layout: DevLayout = new URLSearchParams(window.location.search).get('layout') === 'grid' ? 'grid' : 'ladder';
const fixtures = loadFixtures();

const main = document.getElementById('theme-main')!;
main.insertAdjacentHTML('beforeend', sectionShell(layout, galleryPhotos(fixtures[0]!)));
const container = main.querySelector<HTMLElement>('[data-mount-here]')!;
document.body.dataset.layout = layout;

// The layout reaches the widget as the Liquid sends it: a `data-layout` attribute on the mount.
setUpPage({ fixtures, mountAttr: 'data-volume-ladder-bundle', content: CONTENT, attributes: { 'data-layout': layout }, container });
mountToolbar(container, layout);

// Imported after the page is set up, exactly as the theme loads the asset after the section's markup.
await import('../src/embed');
