# Activewear set

**A "complete the set" outfit builder: three pieces, each with a dense Size by Colour grid, sold for one set price with a surcharge on a premium colour.**

![The Strata Set: three pieces matched in Moss, the leggings in Slate with its surcharge in the set panel](docs/screenshots/desktop.png)

A custom component is a React widget on the published `@kitenzo/react` SDK that renders a Kitenzo bundle in its own design and ships to a Shopify theme as two assets and a Liquid section. Kitenzo's engine owns selection, validation, pricing and the cart; this widget owns how it looks. It is a copy of [the starter](../../starter/) taken further, and keeps every rule the starter keeps.

This one shows the hard part of option UIs. Each piece (a top, a bra, leggings) has twenty variants, and some combinations are sold out. The widget:

- draws Colour as swatches and Size as buttons, and **disables an unreachable value instead of hiding it**, with the reason written beside the row ("Moss is sold out in XS.");
- follows the SDK's rule that **option order is significance order**: changing the colour never moves the size the shopper chose; a size change that rules out the colour moves the colour, and says so;
- shows the **set price from the first paint**, before anything is picked;
- moves the price when **Slate** is chosen, and explains why ("Slate adds £5.00", "Leggings in Slate +£5.00"), in the shopper's currency;
- has **Match colours**: one press puts every piece in one colour where that colour can be had, and names the pieces where it cannot;
- shows **large photographs that follow the chosen colour** (the variant's own image, falling back to the product's).

| | |
|---|---|
| ![Desktop, first paint](docs/screenshots/desktop-empty.png) | ![Match colours reporting the leggings](docs/screenshots/desktop-match.png) |
| ![The details dialog](docs/screenshots/desktop-dialog.png) | ![Mobile](docs/screenshots/mobile.png) |

More: [mobile option grid](docs/screenshots/mobile-options.png), [mobile set panel](docs/screenshots/mobile-complete.png), [mobile dialog](docs/screenshots/mobile-dialog.png).

## Run it

```bash
cd examples/activewear-set
bun install
bun run dev           # http://localhost:5185
bun run verify        # typecheck, unit, build, e2e (desktop Chromium and mobile WebKit)
bun run screenshots   # regenerate docs/screenshots (dev server running)
```

The dev page runs the real SDK against a mock of the Kitenzo API and Shopify's cart, on the STRATA products from the Kitenzo demo store. The toolbar (bottom left) turns on the edge cases below.

## The bundle shape it expects

`dev/catalog.ts` describes the demo bundle (id 2005):

- **Three steps, each "exactly 1"**: Top (`oversized-drop-tee`), Bra (`form-sports-bra`), Leggings (`power-leggings`). Each is Size (XS to XL) by Colour (Onyx, Bone, Moss, Slate).
- **A set price**: `discount.price(120)`. A flat set price is known before any pick (`resolveUpfrontPrice`), so the header and `useBundlePrice` show it on the first paint.
- **Variant surcharges**: `applyVariantSurcharges: true` and £5 on every Slate variant. The SDK adds them after the set price.
- **Sold-out combinations**: tee S in Slate; bra L in Bone and XL in every colour; leggings XS in Moss. Leggings M in Slate has two left.

It also handles an optional piece (a step of "at most 1"), required products (listed in the set panel as included) and products with no option data (a plain variant select).

**It refuses** a step that takes more than one piece. A set needs a size and colour per piece, which this design draws once per step, so the theme editor names the step and the bundle is held off sale rather than sold half-drawn. Use the starter for that bundle. Like the starter, it also refuses required personalisation it cannot collect.

## Edge cases, and where to see them

| Case | What the widget does | See it |
|---|---|---|
| A colour sold out in the chosen size | Swatch struck through, `aria-disabled`, reason beside the row and on press | Leggings, choose XS (Moss) |
| A size sold out in every colour | Size button struck through, "XL is sold out." | Bra, XL |
| A size change that rules out the colour | The colour moves (`selectOptionValue`) and the piece says "Moss is sold out in XS, so Colour is now Onyx." | Leggings: Moss, then XS |
| Match colours where a piece cannot follow | Matches the rest, keeps that piece's size, lists it with the reason | Leggings XS, then Match Moss |
| A colour or size change on a piece already in the set | Swaps the piece in the set (the SDK builder's `swapItem`, which works in a step that is full of the piece being replaced), never doubles it. The card of a piece in the set shows the variant the set holds, read from the selection, so a refused swap leaves the card on the old colour and gives the builder's reason (`swapBlockedReason`) | Add a piece, change its colour |
| Add before a size is chosen | Adds nothing; "Choose your size first." and the size row nudges | Any piece |
| Surcharge in another currency | `money.surcharge(variant)`, converted at the rate the total converts at, so the note and the total agree | `?scenario=market-eur` (Slate adds €5.85) |
| Zero-decimal currency | `?scenario=market-jpy` | |
| The last two of a combination | "Only 2 left", from the merchant's **Low stock from** setting down (5 by default, 0 never says it) | Leggings, M in Slate |
| A step or piece the conditions engine hides | Leaves the page, the set panel and Match colours (`getBundleOffer` with the builder's `conditions`) | a bundle with conditions |
| A piece sold out in everything | Shown, greyed, "Sold out", not pickable | `?scenario=all-sold-out` |
| Hidden sold-out products | Kept when hiding would leave a step unfillable (`getBundleOffer`) | `?scenario=hide-sold-out` |
| Archived and draft products | `?scenario=archived-and-draft` | |
| The theme editor | Problems explained to the merchant | `?scenario=theme-editor` |
| Slow, failing or missing API, cart refusals, hostile strings, two sections, a hostile theme | As the starter | the toolbar |
| Basket Edit | Restores each piece in its saved size and colour, at creation | add to cart, then **Edit** on the cart page |

## How it works

```
src/
  options.ts        the option grid: swatches and their colours, why a value is out of reach,
                    the photograph for a choice, which value a surcharge belongs to, and the
                    Match colours plan (pure, unit tested)
  pieces.ts         a piece's choice: what its card shows (the picked variant while it is in the
                    set) and what changing it does to the set (pure, unit tested)
  model.ts          the SDK's offer (`getBundleOffer`, with what the conditions engine hides) with
                    photographs; refuses steps that take more than one piece
  selection.ts      what the selection means for the page: pickOf (the piece a step holds),
                    missingPicks (what is still owed), isStepDone, isStepFinished
  content.ts        the merchant's settings (copy, swatches, and when stock reads as low)
  ui/Builder.tsx    owns the SDK's builder and the model, and shares them through two contexts;
                    the steps, Match colours, status
  ui/context.ts     what stays the same while the shopper picks, and the selection that does not
  ui/copy.ts        the sentence for every "no", from the SDK's reasons and the merchant's words
  ui/usePieces.ts   every piece's choice, held once: derived from the set for a piece in it,
                    remembered for one that is not; swaps a piece in the set
  ui/usePiece.ts    one piece: resolve, add, remove, and what to say after each
  ui/PickControls.tsx  swatches, size buttons, the add control
  ui/PieceCard.tsx  a piece: photograph that follows the colour, options, surcharge note
  ui/Summary.tsx    "Your set": pieces, set price, surcharge lines, total, buy button
```

The option rules are the SDK's: `reachableOptionValues` decides what is offered (only the options before it constrain a value) and `selectOptionValue` applies a change (only the options after it are repaired). `options.ts` adds what a UI needs on top: the reason for each withheld value, and the list of repairs so the widget can announce them. Every amount is the SDK's: the total is `useBundlePrice`, the set price is `resolveUpfrontPrice`, and unit prices and surcharges are `useMoney` (`money.unitPrice`, `money.surcharge`), all in the shopper's currency. The set panel's lines (set price, each surcharge) explain the total and never compute a different one. A struck-through price and "You save" show only when the set costs less than its pieces (`hasDiscount`), never for a surcharge that lifts it above them.

**Low stock** is a setting: "Low stock from" (5 by default) is the stock at or below which a piece, in the size and colour chosen, says how many are left; 0 never says it.

**Swatch colours** come from the section setting "Swatch colours" (`Onyx: #1d1d1f`, one per line), then Shopify's native swatch for the value (`ProductOption.swatches`) when the API sends one, then the value itself if it is a colour word, then a photograph of the product in that value. Which options are swatches is a setting too ("Colour, Color" by default); an option with Shopify swatches always is.

Tests: `test/options.test.ts` (the grid, swatches, surcharges, Match colours), `test/pieces.test.ts` (a piece in the set shows what the set holds, also after a refused swap), `test/selection.test.ts`, `test/model.test.ts`, `test/copy.test.ts`, `test/sdk-contract.test.ts` (the SDK behaviour the widget takes on trust: swaps and the opening selection), and `e2e/activewear-set.spec.ts` beside the conformance suite, including the check that changing the colour never moves a chosen size.
