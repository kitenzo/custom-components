/*
 * How a product's name is set on the page.
 *
 * LUMERA's titles carry the formula and the format in one string: "Ceramide + Oat - Cream
 * Cleanser". Split at the first " - ", the formula reads as the name and the format as the line
 * under it, the way the bottle's own label sets it. A title with no " - " is the name, whole.
 * Presentation only: the title itself is never changed.
 */
export function splitTitle(title: string): { name: string; kind: string } {
    const at = title.indexOf(' - ');
    if (at <= 0) return { name: title, kind: '' };
    return { name: title.slice(0, at).trim(), kind: title.slice(at + 3).trim() };
}
