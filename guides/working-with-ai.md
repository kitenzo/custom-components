# Building with an AI agent

You can build a custom component without writing the code yourself. This repo is set up for coding agents (Claude Code, Codex, Cursor, Copilot and others): [AGENTS.md](../AGENTS.md) tells any agent what a custom component is, what it must never do, and how to prove its work, and every project carries a test suite the agent has to pass before it can call anything done. Claude Code also picks up a skill in `starter/.claude/skills/`.

## If you do not code

You will need a computer with [Bun](https://bun.sh) and a coding agent installed. Ask a developer to set those up once if you have never used a terminal; after that, the agent does the rest.

1. Download this repo (green **Code** button on GitHub, then **Download ZIP**), unzip it, and open the folder in your coding agent.
2. Paste one of the prompts below, filling in the parts in angle brackets.
3. The agent will show you a plan before it writes code. Read it: it lists every rule the widget will enforce and where each one came from. If something is there that you did not ask for, say so.
4. When it says it is done, ask it to start the dev server and give you the link. Click through it yourself, on your phone too.
5. The agent ends with an install kit zip: give it to whoever looks after your Shopify theme, or follow its `INSTALL.md`.

### Prompt: a new custom component from a design

```text
Read AGENTS.md, then everything in guides/, then the starter.

Build a new Kitenzo custom component for <store name> at <store URL>.
The design is <a screenshot / a Figma link / a description>.
The Kitenzo bundle it sells works like this: <steps, how many from each, any
required products, the discount>.

Start by copying starter/ to examples/<store-slug>/ and running the rename
script. Snapshot our real products with `bun run snapshot -- --store <store>.myshopify.com`.
Before writing any code, show me: every element of the design, which ones the
SDK can support, every rule the widget will enforce and where it comes from,
and how any shopper input reaches the order. Wait for my go-ahead.

Then build it, run `bun run verify` until it is green, screenshot it at desktop
and phone sizes next to the design, fix every difference, and finish with the
install kit (`bun run package:embed`).
```

### Prompt: change something

```text
Read AGENTS.md. In <folder>, <the change, in plain words>. Keep every test
passing, add a test for the change that fails without it, show me screenshots
at desktop and phone sizes, and rebuild the install kit.
```

### Prompt: check one before it goes live

```text
Read AGENTS.md and guides/best-practices.md. Audit <folder> against every rule
and every case in guides/edge-cases.md. For each one, tell me: kept, broken
(with the file and line), or not applicable. Do not change anything yet.
```

## If you do code

Agents are fast and confident; the repo is set up so their confidence has to be earned.

- **Point them at the rules first.** AGENTS.md is short and links to the rest. The most common agent mistake on this kind of work is reimplementing something the SDK does (pricing, validation, cart lines), and the rules forbid it in so many words.
- **Make them show the plan.** The prompt above asks for a feature inventory and a provenance list (where every rule comes from) before any code. That one step catches invented rules, unsupported features and the "how does the gift message reach the order" question while they are cheap.
- **The suite is the gate.** `bun run verify` runs the typecheck, unit tests, and the conformance suite on the built asset under a hostile theme at two viewports. Do not accept "done" without it green, and ask the agent to prove a new test fails without the change.
- **Make them look.** Agents report designs done when the flow works and the design does not match. Ask for screenshots at 1440 and 390 in every state, next to the design, and a list of differences.
- **Watch the scope.** An agent working on one component touches only its folder. A change to the shared mock (`dev/mock/`) or to the SDK is a conversation, not a commit.

### Claude Code

`starter/.claude/skills/kitenzo-custom-component/` is a skill Claude Code loads when you ask for anything custom-component shaped in a copy of the starter. It carries the build order, the gate before code, and the definition of done.
