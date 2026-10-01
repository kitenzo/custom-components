/*
 * Refresh dev/mock/demo-store.json from a store's public catalogue.
 *
 *   bun run snapshot                                   # the Kitenzo demo store
 *   bun run snapshot -- --store your-store.myshopify.com
 *
 * Reads `/products.json` (public on every Shopify store, no key needed) and keeps only the
 * products dev/catalog.ts names, trimmed to the fields the fixture builder reads. The snapshot is
 * committed, so dev, tests and CI never touch the network.
 *
 * Use your merchant's own store when you start a real build: their real titles, prices, options
 * and photographs, in their real order, are worth more than any placeholder.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATALOG_DEFS } from '../dev/catalog';
import { handlesOf, type StoreProduct } from '../dev/mock/catalog';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../dev/mock/demo-store.json');

const storeArg = process.argv.indexOf('--store');
const store = storeArg >= 0 ? process.argv[storeArg + 1] : 'bundle-builder-demo-store-1.myshopify.com';

async function fetchAll(): Promise<StoreProduct[]> {
    const all: StoreProduct[] = [];
    // 250 is the page size Shopify allows. Sweep until a short page: a partial sweep would
    // confidently report a real product as missing.
    for (let page = 1; ; page += 1) {
        const response = await fetch(`https://${store}/products.json?limit=250&page=${page}`);
        if (!response.ok) throw new Error(`${store} answered ${response.status} on page ${page}`);
        const { products } = (await response.json()) as { products: StoreProduct[] };
        all.push(...products);
        if (products.length < 250) return all;
    }
}

const wanted = new Set(handlesOf(CATALOG_DEFS));
const products = (await fetchAll()).filter((product) => wanted.has(product.handle));
const missing = [...wanted].filter((handle) => !products.some((product) => product.handle === handle));
if (missing.length > 0) {
    console.error(`Not on ${store}: ${missing.join(', ')}`);
    process.exit(1);
}

const trimmed: StoreProduct[] = products.map((product) => ({
    id: product.id,
    title: product.title,
    handle: product.handle,
    body_html: product.body_html,
    vendor: product.vendor,
    product_type: product.product_type,
    tags: product.tags,
    options: product.options.map(({ name, position, values }) => ({ name, position, values })),
    variants: product.variants.map((variant) => ({
        id: variant.id,
        title: variant.title,
        option1: variant.option1,
        option2: variant.option2,
        option3: variant.option3,
        sku: variant.sku,
        available: variant.available,
        price: variant.price,
        compare_at_price: variant.compare_at_price,
        grams: variant.grams,
        featured_image: variant.featured_image ? { src: variant.featured_image.src } : null,
    })),
    images: product.images.map(({ id, src, alt, variant_ids }) => ({ id, src, alt: alt ?? null, variant_ids })),
}));

writeFileSync(OUT, `${JSON.stringify(trimmed, null, 1)}\n`);
console.log(`Wrote ${trimmed.length} products from ${store} to ${OUT}`);
