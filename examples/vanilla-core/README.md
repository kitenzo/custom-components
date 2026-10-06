# Vanilla Core: a custom component with no framework

**The capability:** a Kitenzo bundle builder on `@kitenzo/core` alone, in plain TypeScript and DOM, with no React. The same engine, the same rules, the same cart: 36.8 kB of JavaScript over the wire instead of 82.5 kB.

![A mixed case of six wines, three bottles in](docs/screenshots/desktop.png)

It sells a mixed case of six Californian whites. The shopper fills a wooden case bottle by bottle; each wine wears a coloured foil so its bottles can be matched from the shelf to the case.

| | |
|---|---|
| ![Phone, three bottles in](docs/screenshots/mobile.png) | ![Phone, the full case](docs/screenshots/mobile-case.png) |

## Who it is for

A merchant whose theme already ships a lot of JavaScript, or an agency that wants the smallest asset it can put on a product page. Every other example in this repo bundles React, which is more than half of its 82.5 kB. This one does not, and shows what that costs you in code and what it does not cost you in behaviour.

## The size difference

Both built with `bun run build:embed` (Vite, minified IIFE); sizes in kB of 1000 bytes, gzip at level 9. `bun run size` prints this project's row and the breakdown.

| JavaScript | Raw | Gzip | Brotli |
|---|---:|---:|---:|
| `kitenzo-starter.js` (React, `@kitenzo/react`, core) | 255.8 kB | 82.5 kB | 72.7 kB |
| `kitenzo-vanilla-core.js` (core only) | 109.7 kB | **36.8 kB** | 32.7 kB |

55% less to download, parse and run, on every product page the section is on. Where the minified bytes come from:

| Source | Starter | Vanilla Core |
|---|---:|---:|
| `react-dom`, `react`, `scheduler` | 142.0 kB | none |
| `@kitenzo/react` | 5.3 kB | none |
| `@kitenzo/core` | 77.8 kB | 77.8 kB |
| The widget's own code | 26.3 kB | 27.5 kB |

The engine is the same 78 kB either way: that is what you are buying from Kitenzo, and it does not shrink. It holds the selection rules, the offer, the cart flow and the basket Edit, so neither widget carries its own. The widget's own code is 1.2 kB larger here, which is a 60-line DOM helper, the case graphic and telling each card when to update, less the JSX. The CSS is 4.1 kB gzipped here and 3.1 kB in the starter; the difference is the case.

The e2e suite holds the asset under a 40 KiB gzip budget and checks it carries no React (`e2e/vanilla-core.spec.ts`), so a stray dependency is caught before it ships.

## What core gives you

Everything that decides what is sold and for how much, and the state around it. None of it is reimplemented here.

| Job | `@kitenzo/core` | Used in |
|---|---|---|
| Load the bundle and the shop's settings | `new KitenzoClient()`, `getBundle`, `getSettings` | `src/load.ts` |
| Take part in the merchant's A/B tests | `followABTestRedirect`, `client.recordImpression` (the visitor id and the cart lines' attribution need no call) | `src/load.ts`, `src/widget.ts` |
| Basket Edit: read the link, restore the case, name the line to replace | `loadBundleEdit` | `src/load.ts` |
| What each step shows, what is sold out, what the conditions engine hides as the shopper picks, what the merchant must fix | `getBundleOffer` (with the builder's `conditions`) | `src/model.ts` |
| Hold the selection, take only what fits, validate it, notify on change | `createBundleBuilder` (`initialSelections`, `subscribe`, `isSatisfied`, `problems`, `conditions`) | `src/ui/builder.ts` |
| Why one more will not go in | `builder.blockedReason`, `isVariantBuyable` | `src/ui/pick.ts` |
| How many are still missing ("choose 2 more"), and when a step is done | `progress` on the builder's snapshot | `src/selection.ts` |
| Every amount in one currency and format | `createMoneyFormatter` | `src/ui/builder.ts` |
| Price the case, in the shopper's market, raw and formatted | `getBundlePrice` | `src/ui/summary.ts` |
| Product options | `defaultOptionValues`, `resolveVariant`, `reachableOptionValues`, `selectOptionValue` | `src/ui/pick.ts` |
| Configure, add to the theme's cart, merge `_bundles`, with the state around it: phases, one add at a time, finishing an add whose answer was lost, replacing an edited case, a sentence for every failure | `createBundleCartFlow` | `src/ui/builder.ts` |
| Descriptions as text | `htmlToPlainText` | `src/model.ts` |

## What you do yourself

What React and the hooks do around those calls, and where it lives here.

- **Re-rendering.** `builder.subscribe(render)` and `cart.subscribe(render)` stand in for `useSyncExternalStore`. One `render()` patches every region in place (`src/ui/builder.ts`). Regions are built once, so the button under the shopper's finger is never replaced, and when "Add" turns into the stepper, focus moves to its + (`replaceKeepingFocus` in `src/dom.ts`). React keeps the node for you; here you keep it.
- **Not re-rendering.** What `React.memo` and a second context do for the starter is done by hand: a change that is one wine's alone (an option, a variant, a refusal and its timer) goes from its `Pick` to its own card and to the dialog while it is open on it (`subscribe` in `src/ui/pick.ts`), and the rest of the shelf is not touched. The variant and the option rows are worked out when the shopper changes an option, not on every update.
- **What is offered, as the shopper picks.** The starter rebuilds its model in a `useMemo` on the builder's `conditions`. Here `render()` does it when that object changes, and shows the cards and steps the SDK's offer still holds (`src/ui/builder.ts`). The widget hides nothing by a rule of its own.
- **Ids.** React's `useId` (with a prefix per root) keeps two widgets' labels apart. Here every id is made from one counter on `window` (`src/registry.ts`), because a section a theme injects later is mounted by a copy of the script of its own, and a counter in a module would start again from 1.
- **Safe text.** `h()` and `setText()` in `src/dom.ts` put every outside string into a text node or an attribute. Nothing assigns `innerHTML`. JSX escapes for you; this file is what escapes here.
- **The client and its preview.** `<KitenzoProvider>` builds the client and switches `preview` on in the theme editor, so a merchant can design against a draft. `createClient` in `src/load.ts` does both, after `keyProblem` has checked the key (the constructor throws on a bad one).
- **Loading, in order.** `useBundle`, `useSettingsState` and `useBundleEdit` are `loadBundle` (`src/load.ts`), awaited once per mount: the bundle, the A/B redirect, the settings (asked for a second time if the first answer fails, then a sentence), the cart's Edit. What an effect's cleanup does in React, `isCancelled` does here: a section unloaded or dropped from the page while the bundle was loading redirects nobody and counts nobody.
- **The two A/B calls.** `useBundle` makes them for a React widget; here they are `followABTestRedirect(bundle)` straight after `getBundle` (the widget keeps its loading state while the page goes to the shopper's variant) and `client.recordImpression(bundle.id, bundle.abTestVisitorId)` once the case is on screen, for a bundle that came back `abTestRouted`. Everything else about a test is inside core: `getBundle` sends the visitor id and the tests the browser remembers, and the cart flow stamps the lines so the order is credited to the variant the shopper saw. Checked in `test/load.test.ts`, `test/cart.test.ts` and `e2e/vanilla-core.spec.ts`, against the mock backend's own A/B test (the `ab-stays` and `ab-other-variant` scenarios).
- **The total, on every change.** `useBundlePrice` is core's `getBundlePrice`, memoised, with the settings from the provider. Here the price region calls it in its `update()` with the settings `loadBundle` returned and the page's language (`src/ui/summary.ts`).
- **Lifecycle.** `mountWidget` returns `destroy()`, which the registry in `src/embed.ts` calls on section unload and bfcache restore. It unsubscribes from the builder and the cart flow, clears timers and closes the dialog. React's unmount does this for you.

## What you give up without @kitenzo/react

In behaviour, nothing: the hooks are thin wrappers over the same core functions this widget calls, so the selection rules, the offer, the prices, the cart flow and the basket Edit are the same code either way.

**The cart flow's signals for a headless cart.** `cart-busy`, `cart-not-ready`, `timeout` and `hasMissingItems` belong to the Storefront API cart (`useStorefrontBundleCart` in `@kitenzo/react/hydrogen`), whose cart can be mid-update when an add starts and can drop a line without an error. The theme's `/cart/add.js` adds every line or answers 422, so `createBundleCartFlow` never reports them. If you take this widget headless, onto Hydrogen, you need them, and the React hook is the easier road.

**What React itself gives you.** StrictMode's double-render checks and React DevTools. Diffing: here, a region that forgets to update one attribute shows stale state, so every region updates everything it drew, and the e2e suite checks the contract attributes after every action. `useRecurringPlan` (recurring bundles), which this widget does not use either way; core has `validateRecurringChoice` and `recurringCartAttributes` if you need them.

## The bundle it expects

One step, exactly 6 (`dev/catalog.ts`): eight wines, repeats allowed, £10 off the case (a fixed discount), one wine sold out and one with only three left. The 6 is a rule on the step; a bundle-wide `eq 6` draws the same case.

Underneath, the widget is the starter's generic builder, so it renders any bundle: several steps, per-step and bundle-wide counts, required products, product options, sold-out and capped stock, conditions. The case picture sizes itself from the limits (`caseSize` in `src/model.ts`): a case of 6, 12 or 24 draws that many slots, and it steps aside for the plain list when nothing caps the count, when the count is over 24, or when the rules contradict each other. Like the starter, it refuses (with a message to the merchant in the theme editor) a bundle that needs personalisation, because it renders no inputs for it.

## Edge cases, and the scenario that shows each

Load the dev page with `?scenario=<id>` (several, comma separated), or use the toolbar.

| What happens | Scenario |
|---|---|
| The API is slow: a loading state the size of the widget | `slow-api`, `loading-forever` |
| The bundle was unpublished: "not available", never "refresh" | `bundle-404` |
| The API fails: a sentence, no status code | `api-500`, `api-offline` |
| The cart refuses a line: Shopify's own reason, as a sentence | `cart-422`, `cart-429`, `cart-500` |
| The answer to an add is lost: the selection holds, and the next press finishes that add, reading the cart back before adding again | `cart-offline`, `cart-lost-response` |
| `/settings` fails: asked once more, then a sentence | `settings-error` |
| A shopper in another currency: every figure in it | `market-eur`, `market-jpy` |
| Sold-out wines shown and unpickable, or hidden by the shop's setting | default, `hide-sold-out`, `all-sold-out` |
| A wine low on stock says how many are left, from the merchant's "Low stock from" down (5 by default, 0 to never say it) | default (Californian Verdelho has 3 left) |
| Archived and draft products | `archived-and-draft` |
| Titles with quotes, markup and right-to-left script render as text | `hostile-strings` |
| Rules that cannot be met: the merchant is told which | `contradictory-rules` with `theme-editor` |
| A draft bundle previews in the theme editor and cannot be bought | `draft-bundle` |
| A shopper in an A/B test: counted once (the toolbar shows the count), cart lines credited | `ab-stays` |
| A shopper assigned the other variant: sent to its page, counted there | `ab-other-variant` |
| A section unloaded or dropped from the page while it loads: nobody is redirected or counted | no scenario; `e2e/vanilla-core.spec.ts` removes the section mid-load |
| A theme that styles bare elements and traps `position: fixed` | `?theme=hostile` (the e2e suite always runs on it) |
| Two sections on one page; the theme editor reloading the section | `?sections=2`; the toolbar's "reload section" |

Add a case to the cart, open the mock cart page, and follow its **Edit** link for the basket Edit round trip: the case comes back as it was, and adding it again replaces the original lines and their `_bundles` entry.

## Run it

```bash
bun install
bun run dev          # http://localhost:5187
bun run verify       # typecheck, unit, build, conformance + this example's e2e, desktop and mobile
bun run size         # the asset's weight, and where it comes from
bun run screenshots  # regenerate docs/screenshots (dev server running)
bun run package:embed
```

## How it works

```
src/
  embed.ts          mounts on every [data-vanilla-core-bundle]; section load/unload, bfcache
  registry.ts       what every copy of the script on a page shares, on window: the mounted widgets and the id counter
  widget.ts         one mount: checks the config, loads, renders a state or the builder, and can be destroyed
  load.ts           the client (preview in the theme editor), bundle + settings, the A/B redirect and impression, the cart's Edit
  model.ts          the SDK's offer as rendered: each step's wines, what is included, what the merchant must fix, how big the case is
  selection.ts      what the selection means for the page: which counts are still owed, and when a step is done
  dom.ts            h(), setAttr(), setText(): the whole rendering layer, text-only by construction
  ui/builder.ts     the SDK's builder, cart flow and money formatter, the regions, and the one render() that keeps them in step
  ui/pick.ts        one wine's option state and its add / stepper controls (card and dialog share it)
  ui/copy.ts        sentences built from the SDK's answers and the merchant's words
  ui/card.ts, ui/summary.ts, ui/dialog.ts, ui/notice.ts, ui/icons.ts (inline SVG, the bottle included)
  content.ts        the merchant's settings (copy, and when stock reads as low), read defensively, with defaults
  config.ts, themeEditor.ts   as in the starter
  styles.css        tokens on the mount element, the theme-proof reset, the case
theme/kitenzo-vanilla-core.liquid   the section: bundle source first, every string a setting, theme fonts
e2e/conformance.spec.ts             the suite every component passes, adapted to a case of six
e2e/vanilla-core.spec.ts            the case, the total, a cap on one wine, an A/B test, a load nobody waits for, one card's own updates, the provider's jobs done by hand, the asset's size
test/                               the widget's own logic (model, selection, copy, content, load, registry), the Liquid section against it, the cart flow as wired, and sdk-contract.test.ts: what is taken from the SDK on trust
```

The colour tokens sit on the mount element at zero specificity (`:where([data-vanilla-core-bundle])`), so the section's accent and font settings, written on that same element, win and every element inherits them. The conformance suite checks they arrive.
