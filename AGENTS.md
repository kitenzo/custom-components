# Instructions for coding agents

You are working in Kitenzo's public custom components repo. Read this file before doing anything; it is short on purpose. The full rules, with the reason for each, are in [guides/best-practices.md](guides/best-practices.md).

## What this code is

A **custom component** is a widget that sells one Kitenzo bundle on a Shopify theme, in a custom design. It is built on the published SDK, [`@kitenzo/react`](https://www.npmjs.com/package/@kitenzo/react) (hooks) and [`@kitenzo/core`](https://www.npmjs.com/package/@kitenzo/core) (framework-free engine and API client), and ships as:

1. `dist-embed/kitenzo-<slug>.js`, a self-contained IIFE (React and the SDK bundled in),
2. `dist-embed/kitenzo-<slug>.css`,
3. `theme/kitenzo-<slug>.liquid`, the theme section that mounts it and holds the merchant's settings.

Those three files, zipped by `bun run package:embed`, are the whole deliverable.

**The split of responsibilities is the most important thing to understand.** Kitenzo's engine owns selection rules, validation, pricing, discounts, cart lines and the `_bundles` cart attribute its Cart Transform reads at checkout. The widget owns presentation, and nothing else. When you are about to compute a price, decide whether a selection is valid, or build cart lines yourself, stop: the SDK does it, and a hand-rolled version will disagree with checkout.

## Layout

```
starter/            the reference implementation; every new component starts as a copy of it
examples/<name>/    complete components, each a copy of the starter taken further
guides/             how it works, the contract, best practices, edge cases, testing, shipping
```

Every project (`starter/`, each `examples/<name>/`) is its own Bun project with its own `bun.lock`. There is no root workspace; never add one. Inside a project:

```
src/           the widget: embed.tsx (mount), App.tsx (load), model.ts (what to offer),
               selection.ts (the builder), money.ts, content.ts (merchant copy), ui/
dev/           never shipped: the mock backend, scenarios, the demo catalogue, the dev page
theme/         the Liquid section and the merchant's install guide
test/          unit tests (vitest)
e2e/           the conformance suite (Playwright) on the BUILT asset, on a hostile theme
scripts/       rename, snapshot, package-embed
```

## Commands (run inside a project folder)

```bash
bun install
bun run dev            # the dev page (port in vite.config.ts), mock backend, scenario toolbar
bun run typecheck
bun run test           # unit
bun run test:e2e       # builds the asset, then the conformance suite at desktop and mobile
bun run verify         # all of the above; must be green before you say you are done
bun run package:embed  # the install kit zip
bun run rename -- --slug acme-tea --prefix act --brand "Acme Tea"   # make a copy yours
bun run snapshot       # refresh dev/mock/demo-store.json from a store's public catalogue
```

Use `bun run test`, never `bun test` (that is Bun's own runner, not vitest). Use `bun x`, never `npx`. No npm, yarn or pnpm lockfiles.

## Rules you must not break

1. **SDK only.** Selection, validation, pricing and the cart come from the SDK. Gate the buy button on `isSatisfied`, never `isComplete`. Read counts with `getSectionLimits` / `getBundleLimits`. Add to the cart with `useBundleAjaxCart`. If the SDK cannot do something the design needs, do not build a parallel path: leave the feature out and write up the gap.
2. **Invent nothing.** Every rule the widget enforces comes from the bundle, the approved design, or a merchant's explicit request. Nothing is preselected. No count, price, currency symbol, market or route is hardcoded.
3. **Every word is the merchant's.** Every visible string is a section setting, with the same default in `theme/*.liquid` and `src/content.ts` (a test enforces it).
4. **Explain every "no".** A disabled control says why. Cart errors are sentences (`shopperMessage`), never a status code or URL. An unpublished bundle reads as unavailable, not as an error. The theme editor (`Shopify.designMode`) tells the merchant what to fix.
5. **Assume a hostile theme.** Prefix every class. Keep the root-scoped reset. Overlays are native `<dialog>` with `showModal()`. No `position: fixed`. Fonts come from the theme. Two sections on one page, the theme editor's section reload, and the back-forward cache all work (see `src/embed.tsx`).
6. **Keep the test contract** (`cc-*` test ids, `data-cc-product`, `data-cc-unavailable`, `data-cc-quantity`; [guides/the-contract.md](guides/the-contract.md)) and keep `e2e/conformance.spec.ts` passing.
7. **Never hand-write API data.** Fixtures come from `defineCatalog` over the demo store snapshot, served by the mock backend in the API's exact wire format. Do not edit `dev/mock/*`: it is shared verbatim by every project and CI checks it.
8. **Prove it.** A new test must fail without your change: break the code, watch it go red, restore it. Then look at the result in a browser at 1440 and 390 wide. Passing tests do not mean the design is right.

## When you are stuck

- Something behaves oddly on a "real" theme: check [guides/edge-cases.md](guides/edge-cases.md) first. Most problems are on that list, with the fix.
- The SDK seems wrong: check [guides/known-issues.md](guides/known-issues.md). If it is new, write up what you saw, the smallest reproduction, and what the widget does meanwhile, and tell the human. Patch only data, in `src/sdkFixes.ts`, never engine logic.
- Types are the truth for the SDK: `node_modules/@kitenzo/core/dist/index.d.ts` and `node_modules/@kitenzo/react/dist/index.d.ts` are thoroughly documented. Read them before guessing.

## House style

Comments explain why, not what. Plain English; no em dashes. Name things for what they are in the merchant's world (a "step", a "bundle", a "box") rather than in ours.
