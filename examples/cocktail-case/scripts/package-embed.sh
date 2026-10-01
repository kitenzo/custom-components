#!/usr/bin/env bash
# Zips a built storefront embed into one archive to hand to the merchant.
#
# Nothing here is store-specific: it takes whatever the embed build produced in
# dist-embed/ plus whatever lives in theme/, and lays it out so the folders map
# onto the theme's own `assets/` and `sections/`. Copy this file as-is into the
# next widget. Run via `bun run package:embed` (which builds first).
set -euo pipefail

cd "$(dirname "$0")/.."

name="$(node -p "require('./package.json').name")-embed"
zip_path="dist-embed/$name.zip"
stage="dist-embed/.package"

rm -rf "$stage" "$zip_path"
mkdir -p "$stage/$name/assets"

# The built embed: the IIFE bundle, its CSS, and any other emitted asset.
shopt -s nullglob
assets=(dist-embed/*)
for asset in "${assets[@]}"; do
    if [ "${asset##*.}" != "zip" ]; then
        cp -r "$asset" "$stage/$name/assets/"
    fi
done

if [ -z "$(ls -A "$stage/$name/assets")" ]; then
    echo "dist-embed/ is empty. Run 'bun run build:embed' first." >&2
    exit 1
fi

# The theme side: Liquid sections into sections/, the install guide as
# INSTALL.md, and anything else (theme JSON examples, screenshots) at the root.
for file in theme/*; do
    case "$(basename "$file")" in
    *.liquid)
        mkdir -p "$stage/$name/sections"
        cp "$file" "$stage/$name/sections/"
        ;;
    README.md) cp "$file" "$stage/$name/INSTALL.md" ;;
    *) cp -r "$file" "$stage/$name/" ;;
    esac
done

# An empty or missing theme/ silently skips the loop above, so check the staged
# kit rather than trusting it: a zip with no section and no install guide is
# worse than no zip, because it looks like a successful handoff.
if [ ! -d "$stage/$name/sections" ]; then
    echo "theme/ has no Liquid section, so there is nothing for the merchant to install." >&2
    exit 1
fi
if [ ! -f "$stage/$name/INSTALL.md" ]; then
    echo "theme/README.md is missing, so the kit would ship with no install guide." >&2
    exit 1
fi

# The merchant-facing setup guide, wherever this widget keeps it.
for doc in MERCHANT-SETUP.md ../MERCHANT-SETUP.md; do
    if [ -f "$doc" ]; then
        cp "$doc" "$stage/$name/"
        break
    fi
done

(cd "$stage" && zip -q -r "../$name.zip" "$name")
rm -rf "$stage"

echo "Packaged $zip_path"
unzip -l "$zip_path"
