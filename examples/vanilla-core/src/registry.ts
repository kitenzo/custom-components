/*
 * What every copy of this script on one page shares.
 *
 * Every section includes the script, so two sections load two copies of it, and a section a theme
 * injects later (its own AJAX navigation) is mounted by a copy of its own. Anything a module
 * keeps starts again in each copy, so the two things that must not start again live on `window`:
 *
 *   - which elements are mounted: a module-level set would be empty in the second copy, which
 *     would mount the first section a second time;
 *   - the number the last element id was made from: a module-level counter would hand the second
 *     copy's widget the ids of the first, and a label or an `aria-labelledby` would resolve into
 *     the other widget.
 */
import type { Mounted } from './widget';

const GLOBAL = '__KITENZO_VANILLA_CORE__';

interface Registry {
    roots: Map<HTMLElement, Mounted>;
    listening: boolean;
    /** Absent in a registry made by a copy of the script that counted for itself. */
    ids?: number;
}

const host = window as unknown as Record<string, Registry | undefined>;
export const registry: Registry = (host[GLOBAL] ??= { roots: new Map(), listening: false });

/** A number no element id on this page has been made from, whichever copy of the script asks. */
export function nextId(): number {
    registry.ids = (registry.ids ?? 0) + 1;
    return registry.ids;
}
