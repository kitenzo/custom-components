#!/usr/bin/env node
/*
 * How much this widget costs a shopper's phone: `bun run size`.
 *
 * Prints the built asset's size (raw, gzip, brotli: what a CDN actually sends), then where the
 * minified bytes come from, by package, so a dependency that creeps in is visible before it ships.
 * The breakdown comes from an esbuild bundle of the same entry with a metafile; it agrees with
 * Vite's build to within a few hundred bytes, which is all a breakdown needs.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';

import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// kB of 1000 bytes, the unit Vite prints after a build, so the two can be compared.
const kb = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;

console.log('dist-embed/ (what the theme serves)');
for (const file of readdirSync(resolve(ROOT, 'dist-embed')).filter((name) => /\.(js|css)$/.test(name))) {
    const bytes = readFileSync(resolve(ROOT, 'dist-embed', file));
    console.log(`  ${file.padEnd(28)} ${kb(bytes.length).padStart(9)} raw  ${kb(gzipSync(bytes, { level: 9 }).length).padStart(8)} gzip  ${kb(brotliCompressSync(bytes).length).padStart(8)} brotli`);
}

const result = await build({
    entryPoints: [resolve(ROOT, 'src/embed.ts')],
    bundle: true,
    minify: true,
    format: 'iife',
    write: false,
    metafile: true,
    loader: { '.css': 'empty' },
    logLevel: 'silent',
});
const groups = new Map();
for (const [path, { bytesInOutput }] of Object.entries(Object.values(result.metafile.outputs)[0].inputs)) {
    const group = path.includes('node_modules/') ? path.split('node_modules/')[1].split('/').slice(0, 2).join('/') : 'this widget (src/)';
    groups.set(group, (groups.get(group) ?? 0) + bytesInOutput);
}
console.log('\nminified JS by source');
for (const [group, bytes] of [...groups].sort((a, b) => b[1] - a[1])) console.log(`  ${group.padEnd(28)} ${kb(bytes).padStart(9)}`);
