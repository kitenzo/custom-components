/*
 * The Liquid section and the widget, kept in step.
 *
 * Shopify rejects a section on upload for things no local tool catches (an `info` over 500
 * characters, a name over 25), and nothing at all catches a setting nothing reads or a default
 * that disagrees with the widget's. These do.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEFAULT_CONTENT } from '../src/content';

const liquid = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../theme/kitenzo-activewear-set.liquid'), 'utf8');
const schema = JSON.parse(/{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/.exec(liquid)![1]!) as {
    name: string;
    presets: { name: string }[];
    settings: { type: string; id?: string; info?: string; default?: unknown; content?: string }[];
};
const settings = schema.settings.filter((setting) => setting.id);

// "addToCart": {{ section.settings.add_to_cart … → addToCart ↔ add_to_cart
const contentMap = new Map([...liquid.matchAll(/"(\w+)":\s*\{\{\s*section\.settings\.(\w+)/g)].map((match) => [match[1]!, match[2]!]));

describe('theme section', () => {
    it('fits Shopify limits: name and preset at most 25 characters, every info under 500', () => {
        expect(schema.name.length).toBeLessThanOrEqual(25);
        for (const preset of schema.presets) expect(preset.name.length).toBeLessThanOrEqual(25);
        for (const setting of schema.settings) expect(setting.info?.length ?? 0, setting.id).toBeLessThan(500);
    });

    it('opens with the bundle source, the picker and the unpublished bundle id, in that order', () => {
        expect(settings.slice(0, 3).map((setting) => setting.id)).toEqual(['bundle_source', 'bundle_product', 'bundle_id']);
        expect(settings[0]!.default).toBe('current_product');
    });

    it('reads every setting it declares', () => {
        for (const setting of settings) {
            // A word boundary: `section.settings.add` must not be satisfied by `add_to_cart`.
            const uses = [...liquid.matchAll(new RegExp(`section\\.settings\\.${setting.id}(?![\\w])`, 'g'))].length;
            expect(uses, `section.settings.${setting.id} is declared but never read`).toBeGreaterThan(0);
        }
    });

    it('writes every content key the widget reads, and no other', () => {
        expect([...contentMap.keys()].sort()).toEqual(Object.keys(DEFAULT_CONTENT).sort());
    });

    it('defaults every string and every number to the same value as the widget', () => {
        for (const [key, id] of contentMap) {
            const fallback = DEFAULT_CONTENT[key as keyof typeof DEFAULT_CONTENT];
            const setting = settings.find((candidate) => candidate.id === id)!;
            const compared = typeof fallback === 'number' || (typeof fallback === 'string' && fallback !== '' && key !== 'afterAdd');
            if (compared) expect(setting.default, `${id} vs DEFAULT_CONTENT.${key}`).toBe(fallback);
        }
    });

    it('escapes the content blob for the attribute it sits in, and hardcodes no market or route', () => {
        expect(liquid).toMatch(/data-content="\{\{ kitenzo_content \| escape \}\}"/);
        expect(liquid).toMatch(/localization\.country\.iso_code/);
        expect(liquid).toMatch(/routes\.root_url/);
        expect(liquid).not.toMatch(/data-country-code="[A-Z]{2}"/);
        expect(liquid).not.toMatch(/{%-?\s*-?\s*<div/);
    });
});
