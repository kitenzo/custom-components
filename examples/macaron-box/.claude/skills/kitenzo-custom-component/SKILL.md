---
name: kitenzo-custom-component
description: Build, change or audit a Kitenzo custom component (a custom bundle builder on the @kitenzo/react SDK that ships to a Shopify theme as two assets and a Liquid section). Use for any work in this project: a new design, a new bundle shape, a fix, an audit before going live.
---

# Kitenzo custom component

You are working in a Kitenzo custom component: a widget on the published `@kitenzo/react` / `@kitenzo/core` SDK that sells one Kitenzo bundle on a Shopify theme. Kitenzo's engine owns selection, validation, pricing and the cart; this project owns presentation. Read `AGENTS.md` (in this project or at the repo root) before anything else.

## Order of work

1. **Read.** `AGENTS.md`, then `src/` top to bottom (embed, config, content, model, selection, money, App, ui), then `dev/catalog.ts`, then `theme/*.liquid`. The comments are the rules.
2. **Recon.** The merchant's real catalogue: `bun run snapshot -- --store <store>.myshopify.com` with their handles in `dev/catalog.ts`. Real option names, prices and photos; never invent one.
3. **Gate: present before you code, then wait for approval.** In one message:
   - the design extracted: every element and state, desktop and mobile;
   - a feature inventory, each item marked buildable or blocked (check the SDK's types in `node_modules/@kitenzo/*/dist/index.d.ts`), with the SDK gap named for each blocked one;
   - a provenance list: every rule the widget will enforce, tagged with its source (the bundle, the design, or a quoted merchant request). Anything with no source is not built;
   - how every piece of shopper input reaches the order, and how two bundles in one order stay apart;
   - any bundle shape the design cannot draw, and how the widget will say so (a settings paragraph and a theme-editor explanation);
   - every place the build will differ from the design, with the reason.
4. **Build** against the mock backend (`bun run dev`). Keep every rule in `AGENTS.md`. Use the scenarios (`?scenario=…`, the dev toolbar) as you go, not at the end.
5. **Prove.** `bun run verify` green. Every new test fails without your change (break it, watch it fail, restore it). Screenshot at 1440 and 390 in empty, part-filled, complete, dialog-open and error states; compare with the design and close every difference.
6. **Ship.** Update `theme/README.md` (the install guide) and `MERCHANT-SETUP.md`, then `bun run package:embed`.

## Definition of done

- [ ] The gate was approved.
- [ ] `bun run verify` is green at both viewports.
- [ ] Screenshots match the design, or every difference is named.
- [ ] Every visible string is a section setting with a matching default.
- [ ] The buy button gates on `isSatisfied`; every disabled control says why.
- [ ] Markets, hidden prices, sold out both ways, stock caps, required products, basket Edit and the theme editor all work (each has a scenario).
- [ ] The install kit builds and its `INSTALL.md` and `MERCHANT-SETUP.md` are right for this component.
- [ ] Your final message gives the local URLs to try (with `?scenario=` links for each state worth seeing) and a short description for whoever tests it next.

## Never

- Compute a price, validate a selection, or build cart lines yourself.
- Add a rule, a default selection, or a count that nothing in the provenance list asks for.
- Edit `dev/mock/` (shared with every project) or hand-write API data.
- Use `position: fixed`, an unprefixed class, an emoji icon, or a hardcoded currency, market or route.
- Report done without `bun run verify` green and without looking at the screenshots.
