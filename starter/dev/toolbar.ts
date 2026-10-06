/*
 * The dev toolbar: scenarios, the hostile theme, two sections, the theme editor's reload, and the
 * mock cart. Plain DOM, so it shares nothing with the widget it is poking at.
 */
import { SCENARIOS } from './mock/scenarios';
import { pageParams, simulateSectionReload } from './page';

function navigate(change: (params: URLSearchParams) => void) {
    const url = new URL(window.location.href);
    change(url.searchParams);
    url.searchParams.delete('edit');
    url.searchParams.delete('edit_uid');
    window.location.assign(url.toString());
}

export function mountToolbar(container: HTMLElement) {
    const params = pageParams();
    const toolbar = document.createElement('details');
    toolbar.className = 'dev-toolbar';
    toolbar.open = sessionStorage.getItem('kitenzo-dev-toolbar') !== 'closed';
    toolbar.addEventListener('toggle', () => sessionStorage.setItem('kitenzo-dev-toolbar', toolbar.open ? 'open' : 'closed'));

    const groups = [...new Set(SCENARIOS.map((scenario) => scenario.group))];
    const scenarioHtml = groups
        .map(
            (group) => `<fieldset><legend>${group}</legend>${SCENARIOS.filter((scenario) => scenario.group === group && scenario.id !== 'default')
                .map(
                    (scenario) =>
                        `<label title="${scenario.description.replace(/"/g, '&quot;')}"><input type="checkbox" value="${scenario.id}" ${params.scenarioIds.includes(scenario.id) ? 'checked' : ''}/> ${scenario.label}</label>`,
                )
                .join('')}</fieldset>`,
        )
        .join('');

    toolbar.innerHTML = `
        <summary>Dev: scenarios and theme</summary>
        <div class="dev-toolbar__body">
            <p class="dev-toolbar__hint">Hover a scenario for what it tests. Every one is also a URL: <code>?scenario=id</code>.</p>
            ${scenarioHtml}
            <fieldset><legend>Page</legend>
                <label><input type="checkbox" data-toggle="hostile" ${params.hostile ? 'checked' : ''}/> Hostile theme CSS</label>
                <label><input type="checkbox" data-toggle="sections" ${params.sections > 1 ? 'checked' : ''}/> Two sections on the page</label>
            </fieldset>
            <div class="dev-toolbar__row">
                <button type="button" data-action="reload">Theme editor: reload section</button>
                <button type="button" data-action="clear">Empty the cart</button>
                <a href="/cart">Open cart</a>
            </div>
            <p class="dev-toolbar__hint">A/B test: <span data-ab-visitors>0</span> counted as visitors (one impression each). The cart page shows which lines are credited.</p>
        </div>`;

    toolbar.querySelectorAll<HTMLInputElement>('input[value]').forEach((input) =>
        input.addEventListener('change', () => {
            const ids = [...toolbar.querySelectorAll<HTMLInputElement>('input[value]:checked')].map((checked) => checked.value);
            navigate((search) => (ids.length ? search.set('scenario', ids.join(',')) : search.delete('scenario')));
        }),
    );
    toolbar.querySelector<HTMLInputElement>('[data-toggle="hostile"]')!.addEventListener('change', (event) =>
        navigate((search) => ((event.target as HTMLInputElement).checked ? search.set('theme', 'hostile') : search.delete('theme'))),
    );
    toolbar.querySelector<HTMLInputElement>('[data-toggle="sections"]')!.addEventListener('change', (event) =>
        navigate((search) => ((event.target as HTMLInputElement).checked ? search.set('sections', '2') : search.delete('sections'))),
    );
    toolbar.querySelector('[data-action="reload"]')!.addEventListener('click', () => simulateSectionReload(container));
    toolbar.querySelector('[data-action="clear"]')!.addEventListener('click', () => {
        window.__KITENZO_MOCK__?.reset();
    });

    document.body.append(toolbar);

    const count = document.getElementById('dev-cart-count');
    const showCount = () => {
        if (count) count.textContent = String(window.__KITENZO_MOCK__?.state.cart.item_count ?? 0);
    };
    // The mock answers the impression inside the page, so it never shows in the network panel.
    const visitors = toolbar.querySelector<HTMLElement>('[data-ab-visitors]')!;
    const showVisitors = () => {
        visitors.textContent = String(window.__KITENZO_MOCK__?.state.visitors.length ?? 0);
    };
    window.addEventListener('kitenzo-mock:change', showVisitors);
    showVisitors();
    window.addEventListener('kitenzo-mock:change', showCount);
    showCount();
}
