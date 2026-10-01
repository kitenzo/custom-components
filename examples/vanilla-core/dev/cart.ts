/*
 * The mock cart page: lines, properties, `_bundles`, and an "Edit" link per bundle, built the way
 * Kitenzo's cart builds it (`?edit=<configured bundle id>&edit_uid=<instance>`), so the full basket
 * Edit round trip runs locally.
 */
import type { BackendState } from './mock/backend';

const raw = sessionStorage.getItem('kitenzo-mock-backend');
const state: BackendState | null = raw ? (JSON.parse(raw) as BackendState) : null;
const root = document.getElementById('cart')!;

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const money = (cents: number) => (cents / 100).toFixed(2);

function render() {
    if (!state || state.cart.items.length === 0) {
        root.innerHTML = '<p>The cart is empty. <a href="/">Build a bundle</a>.</p>';
        return;
    }
    // Lines of one native bundle share `_bundle_data` = "<configured id>#<parent variant>#<instance>".
    const bundles = new Map<string, { configured: string; uid: string }>();
    for (const item of state.cart.items) {
        const data = item.properties._bundle_data;
        if (data) {
            const [configured, , uid] = data.split('#');
            bundles.set(data, { configured: configured!, uid: uid ?? '' });
        }
    }
    const rows = state.cart.items
        .map(
            (item) => `<tr>
                <td>${item.image ? `<img src="${escape(item.image)}" alt="">` : ''}</td>
                <td>${escape(item.title)}<div class="props">${Object.entries(item.properties)
                    .map(([key, value]) => `<code>${escape(key)}</code>: ${escape(value)}`)
                    .join('<br>')}</div></td>
                <td>${item.quantity}</td>
                <td>${money(item.line_price)}</td>
            </tr>`,
        )
        .join('');
    const editLinks = [...bundles.values()]
        .map(({ configured, uid }) => `<li><a href="/?edit=${encodeURIComponent(configured)}&edit_uid=${encodeURIComponent(uid)}">Edit bundle ${escape(configured)}</a></li>`)
        .join('');
    const bundlesAttribute = state.cart.attributes._bundles;
    root.innerHTML = `
        <table><thead><tr><th></th><th>Line</th><th>Qty</th><th>Price (before the bundle discount)</th></tr></thead><tbody>${rows}</tbody></table>
        <h2>Bundles in this cart</h2><ul>${editLinks || '<li>None</li>'}</ul>
        <h2><code>_bundles</code> cart attribute</h2>
        <pre>${bundlesAttribute ? escape(JSON.stringify(JSON.parse(bundlesAttribute), null, 2)) : 'Not set. Without it the Cart Transform cannot discount the bundle.'}</pre>`;
}

document.getElementById('clear')!.addEventListener('click', () => {
    sessionStorage.removeItem('kitenzo-mock-backend');
    window.location.reload();
});

render();
