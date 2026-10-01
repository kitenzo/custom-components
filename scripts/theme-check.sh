#!/usr/bin/env bash
# Run Shopify's Theme Check over every project's Liquid section, inside a minimal throwaway theme
# (Theme Check needs a theme's folder layout to run at all).
#
#   bash scripts/theme-check.sh      # needs the Shopify CLI: npm install -g @shopify/cli
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
THEME="$(mktemp -d)"
trap 'rm -rf "$THEME"' EXIT

mkdir -p "$THEME"/{sections,assets,layout,templates,config,locales,snippets}
printf '<html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>' > "$THEME/layout/theme.liquid"
echo '[]' > "$THEME/config/settings_schema.json"
echo '{}' > "$THEME/locales/en.default.json"

for project in "$ROOT"/starter "$ROOT"/examples/*/; do
    for section in "${project%/}"/theme/*.liquid; do
        [ -f "$section" ] || continue
        cp "$section" "$THEME/sections/"
        stem="$(basename "$section" .liquid)"
        # The section references its own assets; empty stand-ins satisfy the missing-asset check.
        touch "$THEME/assets/$stem.js" "$THEME/assets/$stem.css"
    done
done

shopify theme check --path "$THEME" --fail-level error
