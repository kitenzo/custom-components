#!/usr/bin/env node
/*
 * Make the starter yours: one command renames every identifier a merchant's theme will see.
 *
 *   bun run rename -- --slug acme-tea --prefix act --brand "Acme Tea"
 *
 *   --slug    the merchant's brand, lowercase with hyphens. Names the files (kitenzo-acme-tea.js,
 *             .css, .liquid), the package, and the mount attribute (data-acme-tea-bundle).
 *   --prefix  2 to 4 lowercase letters for every CSS class and custom property (.act-root,
 *             --act-accent). Themes have their own .card and .drawer; the prefix keeps ours apart.
 *   --brand   the brand as the merchant writes it, for the theme editor: "Kitenzo Acme Tea".
 *             Shopify caps a section name at 25 characters, so shorten it if it does not fit.
 *
 * Choose these once. A shipped section's file name and setting ids are what the merchant's
 * templates point at: rename them later and the section drops off their pages.
 */
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'dist', 'dist-embed', '.git', 'test-results', 'playwright-report']);
const SKIP_FILES = new Set(['demo-store.json', 'serializer-key-paths.json']);
const TEXT = /\.(ts|tsx|mjs|js|json|lock|css|html|liquid|md|sh|yml|yaml)$/;

function arg(name) {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

const slug = arg('slug');
const prefix = arg('prefix');
const brand = arg('brand');
const from = { slug: arg('from-slug') ?? 'starter', prefix: arg('from-prefix') ?? 'kst', brand: arg('from-brand') ?? 'Starter' };

const problems = [];
if (!slug || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(slug)) problems.push('--slug must be lowercase words joined by hyphens, e.g. acme-tea');
if (!prefix || !/^[a-z]{2,4}$/.test(prefix)) problems.push('--prefix must be 2 to 4 lowercase letters, e.g. act');
if (!brand) problems.push('--brand is required, e.g. "Acme Tea"');
if (brand && `Kitenzo ${brand}`.length > 25) problems.push(`"Kitenzo ${brand}" is ${`Kitenzo ${brand}`.length} characters; Shopify allows 25. Shorten --brand.`);
if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
}

const pascal = (value) => value.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
const camel = (value) => value.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
const upperSnake = (value) => value.replace(/-/g, '_').toUpperCase();

// Most specific first, so a longer token is never half-replaced by a shorter one.
const replacements = [
    [`kitenzo-${from.slug}`, `kitenzo-${slug}`],
    [`data-${from.slug}-bundle`, `data-${slug}-bundle`],
    [`${camel(from.slug)}Bundle`, `${camel(slug)}Bundle`],
    [`__KITENZO_${upperSnake(from.slug)}__`, `__KITENZO_${upperSnake(slug)}__`],
    [`Kitenzo${pascal(from.slug)}`, `Kitenzo${pascal(slug)}`],
    [`Kitenzo ${from.brand}`, `Kitenzo ${brand}`],
    [`--${from.prefix}-`, `--${prefix}-`],
    [`.${from.prefix}-`, `.${prefix}-`],
    [`"${from.prefix}-`, `"${prefix}-`],
    [`'${from.prefix}-`, `'${prefix}-`],
    [`\`${from.prefix}-`, `\`${prefix}-`],
    [` ${from.prefix}-`, ` ${prefix}-`],
    [`${from.prefix}-dialog-title`, `${prefix}-dialog-title`],
];

function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        if (SKIP.has(entry)) continue;
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path, out);
        else out.push(path);
    }
    return out;
}

let changed = 0;
for (const file of walk(ROOT)) {
    if (file === fileURLToPath(import.meta.url)) continue;
    const name = file.split('/').pop();
    if (SKIP_FILES.has(name) || !TEXT.test(name)) continue;
    const before = readFileSync(file, 'utf8');
    let after = before;
    for (const [search, replace] of replacements) after = after.split(search).join(replace);
    if (after !== before) {
        writeFileSync(file, after);
        changed += 1;
    }
}

for (const file of walk(ROOT)) {
    const name = file.split('/').pop();
    if (name.includes(`kitenzo-${from.slug}`)) {
        const target = join(dirname(file), name.replace(`kitenzo-${from.slug}`, `kitenzo-${slug}`));
        renameSync(file, target);
        console.log(`renamed ${relative(ROOT, file)} -> ${relative(ROOT, target)}`);
    }
}

console.log(`Rewrote ${changed} files: kitenzo-${slug}, data-${slug}-bundle, .${prefix}-*, "Kitenzo ${brand}".`);
console.log('Now run: bun run typecheck && bun run test && bun run test:e2e');
