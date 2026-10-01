# Installing the Kitenzo Macaron Box section

This kit adds a build-your-own box to your Shopify theme: the shopper chooses a box size, then fills a tray of slots with your products, one by one. It is three files and takes about ten minutes. You need Kitenzo installed, a published bundle, and a Kitenzo headless API key (see MERCHANT-SETUP.md).

## 1. Upload the files

Work on a copy of your theme first: in Shopify admin, **Online Store > Themes**, then **Duplicate** on your live theme, and use the copy.

On the copy, choose **... > Edit code**, then:

1. In **assets**, choose **Add a new asset** and upload `assets/kitenzo-macaron-box.js` and `assets/kitenzo-macaron-box.css` from this kit.
2. In **sections**, choose **Add a new section**, name it `kitenzo-macaron-box`, and replace its contents with `sections/kitenzo-macaron-box.liquid` from this kit.

## 2. Make one template for your bundles

1. Choose **Customize** on the theme copy.
2. From the top bar, open **Products**, then **Create template**. Name it `kitenzo-bundle`, based on your default product template.
3. On the new template, remove the theme's own product information section, then **Add section** and choose **Kitenzo Macaron Box**.
4. In the section's settings, leave **Bundle source** on **This product (automatic)** and paste your API key into **Kitenzo headless API key**.
5. Save.

## 3. Assign your bundle to it

In Shopify admin, open the bundle's product (Kitenzo created it when you made the bundle), set **Theme template** to `kitenzo-bundle`, and save. Visit the product page: the builder appears.

## Adding another bundle later

Assign the new bundle's product to the same `kitenzo-bundle` template. Nothing else: no new template, no code. "This product (automatic)" reads which bundle to show from the product the page is for.

## Previewing a bundle you have not published yet

A draft bundle's product does not appear anywhere you can pick it. In the theme editor, set **Bundle source** to **Selected bundle** and paste the bundle's ID into **Unpublished bundle ID**. The theme editor previews the draft; shoppers cannot see or buy it until you publish it.

## What the bundle needs

The box sizes come from the bundle's limits in Kitenzo. On the step, add one limit per size: **Total number of products**, **equal to**, 6; another equal to 12; another equal to 24. Each becomes a box the shopper can choose, in order of size. To price each size, give the bundle a **tiered** discount of type **Set price**, one tier per size ("at least 6 products: 6.50", "at least 12: 12.00", "at least 24: 22.00"), with tiers set to apply the best match only, not to add up (the discount's operator `max`, not `cumulative`). The section shows each box's price and its price per piece from those tiers, so change them in Kitenzo, never in the theme.

A bundle with no "equal to" limits still works: the section leaves out the box choice and draws as many slots as the step's maximum.

## If something looks wrong

Open the page in the **theme editor**: whenever the section cannot show a bundle, it explains why there (shoppers only ever see a short neutral line). The usual causes are an API key whose allowed origins do not include your store's domain, a product that is not a bundle, and an unpublished bundle. If a box size you expect is missing, check its limit is "equal to" and that no other limit on the step rules it out (an "at most 12" hides a box of 24).
