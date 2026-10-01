# Installing the Kitenzo Volume Ladder section

This kit adds a "buy more, save more" bundle to your Shopify theme: the bundle's discount tiers as a ladder, a short list of products to mix, and an add to cart button. It is three files and takes about ten minutes. You need Kitenzo installed, a published bundle with tiered discounts, and a Kitenzo headless API key (see MERCHANT-SETUP.md).

## 1. Upload the files

Work on a copy of your theme first: in Shopify admin, **Online Store > Themes**, then **Duplicate** on your live theme, and use the copy.

On the copy, choose **... > Edit code**, then:

1. In **assets**, choose **Add a new asset** and upload `assets/kitenzo-volume-ladder.js` and `assets/kitenzo-volume-ladder.css` from this kit.
2. In **sections**, choose **Add a new section**, name it `kitenzo-volume-ladder`, and replace its contents with `sections/kitenzo-volume-ladder.liquid` from this kit.

## 2. Make one template for your bundles

1. Choose **Customize** on the theme copy.
2. From the top bar, open **Products**, then **Create template**. Name it `kitenzo-bundle`, based on your default product template.
3. On the new template, remove the theme's own product information section, then **Add section** and choose **Kitenzo Volume Ladder**.
4. In the section's settings, leave **Bundle source** on **This product (automatic)** and paste your API key into **Kitenzo headless API key**.
5. Leave **Layout** on **Ladder (product page column)** and **Show product photos beside the ladder** on. The section then shows the product's own photos on the left and the ladder on the right, like a product page.
6. Save.

Shopify does not let one section sit inside another section's column, which is why the section shows the product's photos itself: it takes the place of your theme's product section on this template.

## 3. Assign your bundle to it

In Shopify admin, open the bundle's product (Kitenzo created it when you made the bundle), set **Theme template** to `kitenzo-bundle`, and save. Add photos to that product as you would to any product: they appear beside the ladder. Visit the product page: the ladder appears.

## The two layouts

- **Ladder (product page column)** is compact: the tiers as rows, the products as a short list, the total and the button. It is designed for a column 320 to 480px wide, and it fits whatever width it is given, on a desktop or a phone.
- **Grid (full width)** shows the same bundle across the page: the tiers side by side, the products as a grid of photos. Use it on a landing page, or as a second section below the product.

To use the ladder on its own, without photos (for example on a page that already shows them), turn off **Show product photos beside the ladder**. It then sits in a narrow column in the middle of the page.

## Your words, not ours

Every word is a setting. Under **Ladder**, change "pouches" to whatever you sell: tubs, bars, bottles. `{count}`, `{discount}` and `{amount}` are filled in for you; `{discount}` is the tier's saving and `{amount}` a price, both in the shopper's currency. Never type a price or a currency symbol into a setting: it would be wrong in every other currency.

## Adding another bundle later

Assign the new bundle's product to the same `kitenzo-bundle` template. Nothing else: no new template, no code. "This product (automatic)" reads which bundle to show from the product the page is for.

## Previewing a bundle you have not published yet

A draft bundle's product does not appear anywhere you can pick it. In the theme editor, set **Bundle source** to **Selected bundle** and paste the bundle's ID into **Unpublished bundle ID**. The theme editor previews the draft; shoppers cannot see or buy it until you publish it.

## If something looks wrong

Open the page in the **theme editor**: whenever the section cannot show a bundle, or cannot draw its ladder, it explains why there (shoppers only ever see a short neutral line). The usual causes are an API key whose allowed origins do not include your store's domain, a product that is not a bundle, an unpublished bundle, and a bundle whose discount is not tiered by the number of products.
