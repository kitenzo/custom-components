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

import { DEFAULT_CONTENT, parseQuestions } from '../src/content';

const liquid = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../theme/kitenzo-skincare-routine.liquid'), 'utf8');
const schema = JSON.parse(/{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/.exec(liquid)![1]!) as {
    name: string;
    presets: { name: string; blocks?: { type: string; settings: Record<string, string> }[] }[];
    settings: { type: string; id?: string; info?: string; default?: unknown; content?: string }[];
    blocks: { type: string; name: string; settings: { type: string; id: string; info?: string; default?: unknown }[] }[];
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
        // `questions` comes from the blocks, not from a setting (see 'quiz blocks' below).
        const written = [...contentMap.keys(), ...(/"questions":\s*\[/.test(liquid) ? ['questions'] : [])];
        expect(written.sort()).toEqual(Object.keys(DEFAULT_CONTENT).sort());
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

/**
 * Write the `questions` list the way the section's Liquid does, for a set of blocks: the template
 * between the block-type check and its end, with each `{{ block.settings.x | default: '' | json }}`
 * filled in and the comma logic applied. Small on purpose: it only knows what that loop uses, and
 * throws on any other Liquid it finds, so a change to the loop cannot pass unnoticed.
 */
function renderQuestions(blocks: { type: string; settings: Record<string, string> }[]): string {
    const loop = /\{%-?\s*if block\.type == 'question'\s*-?%\}([\s\S]*?)\{%-?\s*endif\s*-?%\}\s*\{%-?\s*endfor/.exec(liquid)![1]!;
    const comma = /\{%-?\s*if question_count > 0\s*-?%\},\{%-?\s*endif\s*-?%\}/;
    const body = loop.replace(/\{%-?\s*assign question_count[^%]*%\}/, '');
    const items = blocks
        .filter((block) => block.type === 'question')
        .map((block, index) =>
            body
                .replace(comma, index > 0 ? ',' : '')
                .replace(/\{\{\s*block\.settings\.(\w+)\s*\|\s*default:\s*''\s*\|\s*json\s*\}\}/g, (_, id: string) => JSON.stringify(block.settings[id] ?? '')),
        );
    const text = `[${items.join('')}]`;
    if (/\{[{%]/.test(text)) throw new Error(`Liquid the test does not understand: ${text}`);
    return text;
}

describe('quiz blocks', () => {
    const block = schema.blocks.find((entry) => entry.type === 'question')!;

    it('declares a Question block within Shopify limits, and reads every one of its settings', () => {
        expect(block.name.length).toBeLessThanOrEqual(25);
        expect(block.settings.map((setting) => setting.id)).toEqual(['title', 'hint', ...[1, 2, 3, 4, 5].flatMap((n) => [`a${n}_label`, `a${n}_tags`])]);
        for (const setting of block.settings) {
            expect(setting.info?.length ?? 0, setting.id).toBeLessThan(500);
            const uses = [...liquid.matchAll(new RegExp(`block\\.settings\\.${setting.id}(?![\\w])`, 'g'))].length;
            expect(uses, `block.settings.${setting.id} is declared but never read`).toBeGreaterThan(0);
        }
    });

    it('presets the default quiz: the preset blocks, written by the Liquid, are DEFAULT_CONTENT.questions', () => {
        const preset = schema.presets[0]!.blocks ?? [];
        const written = parseQuestions(JSON.parse(renderQuestions(preset)));
        const withoutBlankAnswers = written.map((question) => ({ ...question, answers: question.answers.filter((answer) => answer.label) }));
        expect(withoutBlankAnswers).toEqual(DEFAULT_CONTENT.questions);
    });

    it('writes valid JSON for awkward text, no blocks, and blocks of another type', () => {
        const awkward = { type: 'question', settings: { title: `Maman's "skin" <b>type</b>? \\ ok`, a1_label: 'Dry', a1_tags: 'dry-skin' } };
        const [question] = parseQuestions(JSON.parse(renderQuestions([awkward, { type: 'other', settings: {} }, awkward])));
        expect(question!.title).toBe(awkward.settings.title);
        expect(question!.answers[0]).toEqual({ label: 'Dry', tags: 'dry-skin' });
        expect(JSON.parse(renderQuestions([]))).toEqual([]);
        expect(parseQuestions(JSON.parse(renderQuestions([awkward, awkward])))).toHaveLength(2);
    });
});
