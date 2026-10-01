/*
 * Icons are inline SVG, never emoji (a theme's font can render an emoji as an empty box) and never
 * an icon font (one more request, one more thing a theme can override). `aria-hidden`, because
 * every control that shows one also has a text label.
 *
 * Built with createElementNS from our own constant paths: no markup string is ever parsed.
 */
const SVG = 'http://www.w3.org/2000/svg';

function svg(viewBox: string, size: [number, number], className: string, shapes: [string, Record<string, string>][]): SVGSVGElement {
    const root = document.createElementNS(SVG, 'svg');
    root.setAttribute('viewBox', viewBox);
    root.setAttribute('width', String(size[0]));
    root.setAttribute('height', String(size[1]));
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('focusable', 'false');
    if (className) root.setAttribute('class', className);
    for (const [tag, attrs] of shapes) {
        const shape = document.createElementNS(SVG, tag);
        for (const [name, value] of Object.entries(attrs)) shape.setAttribute(name, value);
        root.append(shape);
    }
    return root;
}

const stroke = { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
const icon = (d: string) => svg('0 0 16 16', [16, 16], '', [['path', { ...stroke, d }]]);

export const plusIcon = () => icon('M8 3v10M3 8h10');
export const minusIcon = () => icon('M3 8h10');
export const closeIcon = () => icon('M4 4l8 8M12 4l-8 8');
export const infoIcon = () =>
    svg('0 0 16 16', [16, 16], '', [
        ['circle', { ...stroke, cx: '8', cy: '8', r: '6.25' }],
        ['path', { ...stroke, d: 'M8 7.25V11M8 5v.01' }],
    ]);

/**
 * One bottle, standing in a slot of the case. The glass, the foil capsule and the label are
 * separate shapes so CSS can fill them: an empty slot is an outline, a filled one takes the
 * wine's capsule colour from `--vnc-capsule` on the slot.
 */
export const bottle = () =>
    svg('0 0 28 72', [28, 72], 'vnc-bottle', [
        ['path', { class: 'vnc-bottle__glass', d: 'M10.5 2h7v15c0 4.5 7.5 6.5 7.5 13.5V67a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V30.5C3 23.5 10.5 21.5 10.5 17z' }],
        ['rect', { class: 'vnc-bottle__capsule', x: '10.5', y: '2', width: '7', height: '12', rx: '1' }],
        ['rect', { class: 'vnc-bottle__label', x: '6', y: '40', width: '16', height: '17', rx: '1' }],
    ]);
