#!/usr/bin/env node
/*
 * The mock backend (dev/mock/*.ts) is shared verbatim by the starter and every example. Each
 * project carries its own copy so it can be copied out of this repo and still run, which means a
 * fix made in one copy can silently miss the rest. This fails when any copy differs from the
 * starter's.
 *
 *   node scripts/check-shared.mjs          # check
 *   node scripts/check-shared.mjs --write  # copy the starter's files into every example
 */
import { copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED = ['dev/mock/backend.ts', 'dev/mock/browser.ts', 'dev/mock/catalog.ts', 'dev/mock/scenarios.ts', 'dev/mock/wire.ts'];
const write = process.argv.includes('--write');

const examples = readdirSync(join(ROOT, 'examples'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, 'examples', entry.name, 'package.json')))
    .map((entry) => join('examples', entry.name));

const drifted = [];
for (const file of SHARED) {
    const source = readFileSync(join(ROOT, 'starter', file), 'utf8');
    for (const project of examples) {
        const target = join(ROOT, project, file);
        if (existsSync(target) && readFileSync(target, 'utf8') === source) continue;
        if (write) copyFileSync(join(ROOT, 'starter', file), target);
        else drifted.push(`${project}/${file}`);
    }
}

if (drifted.length) {
    console.error(`These differ from starter/ (run \`node scripts/check-shared.mjs --write\` after fixing the starter's copy):\n  ${drifted.join('\n  ')}`);
    process.exit(1);
}
console.log(write ? `Synced ${SHARED.length} shared files into ${examples.length} examples.` : `Shared files identical across starter and ${examples.length} examples.`);
