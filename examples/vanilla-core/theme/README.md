# Installing the Kitenzo Vanilla Core section

This kit adds a Kitenzo bundle builder to your Shopify theme, drawn as a case the shopper fills (a mixed case of 6 wines, for example). It is three files and takes about ten minutes. You need Kitenzo installed, a published bundle, and a Kitenzo headless API key (see MERCHANT-SETUP.md).

It is built without a framework, so it adds about 26 kB of JavaScript to the page, roughly a third of a React-based section. Nothing else about it differs: the same Kitenzo engine decides what can be chosen and what it costs, and the same Cart Transform applies the discount at checkout.

## 1. Upload the files

Work on a copy of your theme first: in Shopify admin, **Online Store > Themes**, then **Duplicate** on your live theme, and use the copy.

On the copy, choose **... > Edit code**, then:

1. In **assets**, choose **Add a new asset** and upload `assets/kitenzo-vanilla-core.js` and `assets/kitenzo-vanilla-core.css` from this kit.
2. In **sections**, choose **Add a new section**, name it `kitenzo-vanilla-core`, and replace its contents with `sections/kitenzo-vanilla-core.liquid` from this kit.

## 2. Make one template for your bundles

1. Choose **Customize** on the theme copy.
2. From the top bar, open **Products**, then **Create template**. Name it `kitenzo-bundle`, based on your default product template.
3. On the new template, remove the theme's own product information section, then **Add section** and choose **Kitenzo Vanilla Core**.
4. In the section's settings, leave **Bundle source** on **This product (automatic)** and paste your API key into **Kitenzo headless API key**.
5. Save.

## 3. Assign your bundle to it

In Shopify admin, open the bundle's product (Kitenzo created it when you made the bundle), set **Theme template** to `kitenzo-bundle`, and save. Visit the product page: the builder appears.

## Words and colours

Every word the section shows is a setting, under **Content**, **Buttons**, **Steps**, **Products**, **Summary** and **Messages**. The defaults are written for a case of bottles ("Add the case to cart", "4 of 6 bottles"); change them if you sell something else. **Case count** is the line under the case picture: `{count}` is how many are in, `{size}` how many it holds. **Colours** sets the buttons' colour and the text on them. Fonts are your theme's own.

## Adding another bundle later

Assign the new bundle's product to the same `kitenzo-bundle` template. Nothing else: no new template, no code. "This product (automatic)" reads which bundle to show from the product the page is for.

## Previewing a bundle you have not published yet

A draft bundle's product does not appear anywhere you can pick it. In the theme editor, set **Bundle source** to **Selected bundle** and paste the bundle's ID into **Unpublished bundle ID**. The theme editor previews the draft; shoppers cannot see or buy it until you publish it.

## If something looks wrong

Open the page in the **theme editor**: whenever the section cannot show a bundle, it explains why there (shoppers only ever see a short neutral line). The usual causes are an API key whose allowed origins do not include your store's domain, a product that is not a bundle, and an unpublished bundle.
