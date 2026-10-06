# Installing the Kitenzo Gift Box section

This kit adds a Kitenzo gift box builder to your Shopify theme: shoppers choose a box, fill it, and personalise what is in it (an engraving, a card message), and each answer arrives on its own product's line in the order. It is three files and takes about ten minutes. You need Kitenzo installed, a published bundle, and a Kitenzo headless API key (see MERCHANT-SETUP.md).

## 1. Upload the files

Work on a copy of your theme first: in Shopify admin, **Online Store > Themes**, then **Duplicate** on your live theme, and use the copy.

On the copy, choose **... > Edit code**, then:

1. In **assets**, choose **Add a new asset** and upload `assets/kitenzo-gift-box.js` and `assets/kitenzo-gift-box.css` from this kit.
2. In **sections**, choose **Add a new section**, name it `kitenzo-gift-box`, and replace its contents with `sections/kitenzo-gift-box.liquid` from this kit.

## 2. Make one template for your bundles

1. Choose **Customize** on the theme copy.
2. From the top bar, open **Products**, then **Create template**. Name it `kitenzo-bundle`, based on your default product template.
3. On the new template, remove the theme's own product information section, then **Add section** and choose **Kitenzo Gift Box**.
4. In the section's settings, leave **Bundle source** on **This product (automatic)** and paste your API key into **Kitenzo headless API key**.
5. Save.

## 3. Assign your bundle to it

In Shopify admin, open the bundle's product (Kitenzo created it when you made the bundle), set **Theme template** to `kitenzo-bundle`, and save. Visit the product page: the builder appears.

## Adding another bundle later

Assign the new bundle's product to the same `kitenzo-bundle` template. Nothing else: no new template, no code. "This product (automatic)" reads which bundle to show from the product the page is for.

## Previewing a bundle you have not published yet

A draft bundle's product does not appear anywhere you can pick it. In the theme editor, set **Bundle source** to **Selected bundle** and paste the bundle's ID into **Unpublished bundle ID**. The theme editor previews the draft; shoppers cannot see or buy it until you publish it.

## Personalisation

The fields shoppers fill in (their labels, help text, character limits, and whether they are required) come from the bundle's personalisation in Kitenzo, not from the theme. Change them there and the section follows. The section's **Personalisation** settings are only the words around the fields: the heading, "Required", the character counter, how a fee is announced, and the buy button's "Add the engraving" message.

Text, dropdown and checkbox fields are supported, with or without a fee. A field that asks for an image upload is not: an optional one is left out, and a required one keeps the bundle off sale. The theme editor names the field when that happens.

## If something looks wrong

Open the page in the **theme editor**: whenever the section cannot show a bundle, it explains why there (shoppers only ever see a short neutral line). The usual causes are an API key whose allowed origins do not include your store's domain, a product that is not a bundle, an unpublished bundle, and a required personalisation field this section cannot collect.
