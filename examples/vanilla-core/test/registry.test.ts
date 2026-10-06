import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('element ids', () => {
    it('are never repeated by a second copy of the script on the same page', async () => {
        // One page, and the script loaded twice: once by the first section, once by a section the
        // theme injected later.
        vi.stubGlobal('window', {});
        const first = await import('../src/registry');
        vi.resetModules();
        const second = await import('../src/registry');
        expect(second.nextId).not.toBe(first.nextId);

        const issued = [first.nextId(), first.nextId(), second.nextId(), first.nextId(), second.nextId()];
        expect(new Set(issued).size).toBe(issued.length);
        // The same holds for what is mounted: the second copy sees the first copy's widgets.
        expect(second.registry.roots).toBe(first.registry.roots);
    });
});
