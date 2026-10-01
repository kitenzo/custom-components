# Testing a custom component

Three layers, each catching what the others cannot.

## 1. The mock backend

`dev/mock/` stands in for the Kitenzo headless API and Shopify's AJAX cart, so the widget runs the **published SDK, unmodified**, with no store, no key and no network. It is a pure request handler (`backend.ts`), plugged in front of `fetch` in the browser (`browser.ts`) and behind `page.route` in Playwright (`e2e/harness.ts`).

- **Data is real.** Products come from a snapshot of a real store's public catalogue (`bun run snapshot`; the Kitenzo demo store by default). You describe only what a catalogue cannot say: the bundle's steps, rules, discount, and any stock overrides, in `dev/catalog.ts`.
- **The wire format is real.** `defineCatalog` emits exactly what Kitenzo's serializer sends, and `test/wire-shape.test.ts` checks every key path against real serializer output. Never hand-write a payload: a hand-written stub once served a shape the API had never sent, and every test passed against it.
- **It is strict where the real servers are.** A sold-out variant is refused by `/configure` and by `/cart/add.js`. A draft bundle 404s unless the request previews. Every request is recorded, so a test can assert what was and was not sent.
- **Scenarios** (`dev/mock/scenarios.ts`) put it into the states real stores reach: see [edge-cases.md](edge-cases.md).

The cart lives in `sessionStorage` in the dev server, so add to cart, open `/cart`, follow the Edit link, and the full round trip runs locally. The cart page shows the lines, their properties and the `_bundles` attribute: exactly what reaches the merchant's order.

### Your own store's data

```bash
bun run snapshot -- --store your-store.myshopify.com
```

pulls the handles `dev/catalog.ts` names from that store. Use it from the first day of a real build: the merchant's real option names, prices and photos are worth more than any placeholder.

### Against a real bundle

Copy `.env.example` to `.env`, set `VITE_KITENZO_API_KEY` to a key whose allowed origins include `http://localhost:5173`, and open `http://localhost:5173/?live=1&bundle=<id>`. The bundle, its products and prices come from the real API; the cart stays mocked, because the theme's cart only exists on the store. To test the real cart, run the widget on the store's theme with `shopify theme dev`.

## 2. Unit tests (`bun run test`)

Pure logic, fast. In the starter:

- `model.test.ts`: what is offered (archived, drafts, sold out both ways, required products, contradictory rules).
- `selection.test.ts`: why one more cannot go in, what is missing, how a seed is clamped.
- `content-and-config.test.ts`: reading merchant settings and mount attributes defensively.
- `theme.test.ts`: the Liquid schema against Shopify's limits and against the widget's defaults.
- `wire-shape.test.ts`: the mock against the real serializer.
- `sdkFixes.test.ts`: each SDK workaround, including a test that fails when the SDK no longer needs it.

Tests load bundles through the real SDK client against the mock backend (`test/support.ts`), never by building a `BundleDetail` by hand.

## 3. The conformance suite (`bun run test:e2e`)

`e2e/conformance.spec.ts`, in Playwright, on the **built** asset (`dist-embed/`), mounted the way the Liquid section mounts it, under the hostile theme (`dev/hostile.css`), at desktop (Chromium, 1440) and on a phone (WebKit, iPhone 14). It checks loading, errors, selection, sold out, stock caps, full steps, the dialog, the full cart sequence, `_bundles` merging, cart errors, locale prefixes, basket Edit, two sections, the theme editor's reload, hostile strings, the button reset, markets and hidden prices.

The harness page sets a body font, as every theme does. Without one, Linux WebKit (the mobile browser in CI) painted one design at a frame every two seconds, which starves Playwright's "is it stable?" check: tests passed on a Mac and timed out in CI. If a suite is mysteriously slow only on Linux, count animation frames before blaming the widget.

Every check drives the widget through the public test contract ([the-contract.md](the-contract.md)), so the same suite runs on every component. Fitting it to a new bundle means changing the helpers in `e2e/harness.ts` (`completeSelection`, the handles), not the checks.

Add your component's own behaviour in `e2e/<name>.spec.ts`.

## Make every test able to fail

Break the code, watch the test go red, restore it. When we did this to the starter's suite, the "two sections mount once each" test still passed with the bug in: the DOM looked right while every request went out twice. It now counts requests. Patterns that look like tests and are not:

- A forced click on a disabled button: it dispatches nothing. Assert it is disabled, and that state did not change.
- "Nothing was sent" with no positive control: it passes when nothing could have been sent. Complete the bundle and add it in the same test, then assert what the requests carried.
- Asserting only the last of several random draws: assert every draw, and unit-test the plan with a seeded generator.
- Rendering only in one market at `/`: those are exactly the values a broken section hardcodes.

## Look at it

Passing suites do not mean the design is right. Screenshot at 1440 and 390 wide, in every state, next to the approved design, and close every difference. Keep the dev toolbar closed when you measure: it narrows the page.
