# Fast Sneakers — Shopify setup & launch checklist

The storefront code is complete. This checklist covers everything you do in
**Shopify admin** (and one config file) so every feature lights up. Work top
to bottom — items marked **(required)** block a proper launch.

---

## 1. Collections (already created ✔)

The clothing collections below already exist in Shopify as **automated
(smart) collections** — products flow in automatically based on their
title/type/tags, so new products sort themselves:

| Collection title | Handle | Rule basis |
|---|---|---|
| Sneakers | `sneakers` | product type `sneakers` (laces excluded) |
| T-Shirts | `t-shirts` | tee/T-shirt titles + tops product types |
| Hoodies & Sweatshirts | `hoodies-sweatshirts` | hoodie/crewneck/sweater titles + types |
| Jackets & Outerwear | `jackets-outerwear` | jacket/windbreaker/coat/puffer titles |
| Pants & Shorts | `pants-shorts` | pants/jeans/shorts/joggers/cargo titles + types |
| Accessories | `accessories` | bags type, `accessoires` tag, beanies/socks |
| Kids | `kids` | (GS)/(PS)/(TD)/Enfant/Bébé in the title |
| Sets & Tracksuits | `sets-tracksuits` | tracksuit/outfit/set titles + types |
| Sale | `sale` | compare-at price set (fills automatically) |

"New In" needs no collection — the header links to
`/collections/all?sort_by=newest`.

### Added for the SneakerAsk import

Created alongside `scripts/import-from-sneakerask.mjs`, which brings in
footwear brands the store didn't previously carry. Same smart-collection
pattern, so they fill themselves as products land.

| Collection title | Handle | Rule basis |
|---|---|---|
| Boots | `boots` | product type `Boots` |
| Slippers | `slippers` | product type `Slippers` |
| Puma | `puma` | title contains "Puma" **or** tag `brand:puma` |
| Salomon | `salomon` | title contains "Salomon" **or** tag `brand:salomon` |
| Vans | `vans` | title contains "Vans " **or** tag `brand:vans` |
| Crocs | `crocs` | title contains "Crocs" **or** tag `brand:crocs` |
| Converse | `converse` | title contains "Converse" **or** tag `brand:converse` |
| Saucony | `saucony` | title contains "Saucony" **or** tag `brand:saucony` |
| Maison Mihara Yasuhiro | `maison-mihara-yasuhiro` | title contains "Mihara" **or** tag `brand:maison-mihara-yasuhiro` |
| Vale Forever | `vale-forever` | title contains "Vale Forever" **or** tag `brand:vale-forever` |

Each rule matches on **either** title or `brand:` tag, so it catches the
older products (which only have brand words in the title) and the imported
ones (which carry proper `brand:` tags).

Boots and Slippers are also inside `sneakers` — that collection's rules
already cover those product types — so a boot appears in both, deliberately.

Tips:
- **Sale** is empty until you set compare-at prices on products.
- Set a **collection image** on Jackets/Pants/Accessories/Kids/Sale (the
  homepage tiles show a monogram fallback until you do).
- A stray product in a smart collection? Adjust that product's
  title/type/tags in admin — the rules pick it up automatically.

## 1b. Brand filter — run the vendor fix script (recommended)

Every imported product has vendor "EasyHairKit". The storefront hides that,
but the **Brand filter** in the collection sidebar only lights up once
vendors hold real brand names (Nike, Jordan, Stussy, …).

Run `scripts/fix-brands.mjs` once (instructions in the file header — needs a
private-app Admin API token with `write_products`). It dry-runs by default
and shows exactly what it will change before you `--apply`.

## 2. Add products (your next step)

Add products in **Products → Add product**. For the best storefront result:
- Fill **SEO title & description** (used for Google + social sharing).
- Add **multiple images** — the product page has a gallery with thumbnails.
- Assign each product to one of the collections above.
- Set inventory tracking so sold-out states display correctly.

## 3. Wishlist metafield (required for favorites)

The heart/favorites feature stores product IDs on the customer. Without this
definition, hearts show an error tooltip instead of saving.

**Settings → Custom data → Customers → Add definition:**
- Name: `Wishlist`
- Namespace and key: `custom.wishlist`
- Type: **List of references → Product**
- Under "Storefronts & customer accounts" access: enable
  **Customer Account API — Read and write**

## 4. Navigation menus + dropdown submenus

The header uses the menu with handle **`main-menu`** when it exists;
otherwise it falls back to a built-in menu: New In, Sneakers (with
subcategories), T-Shirts, Hoodies, Jackets, Pants, Accessories, Kids, Sale.

> Your store's untouched starter menu (Home / Catalog / Contact) is ignored —
> the storefront shows the built-in category nav until you build a real menu.
> As soon as you add or rename any item, your menu takes over.

**Online Store → Navigation → Main menu**, then add items pointing at:
- Collections: `/collections/sneakers`, `/collections/t-shirts`, …
- Info pages (these live in the app, not Shopify pages):
  `/pages/size-guide`, `/pages/about`, `/pages/faq`, `/pages/contact`

**Hover dropdowns:** drag a menu item to the right (indent it under a parent)
in the Navigation editor — nested items automatically become a dropdown that
opens on hover/focus on desktop and a slide-in subpanel in the mobile menu.
Example structure:

```
New In                    → /collections/all?sort_by=newest
Sneakers                  → /collections/sneakers
  ├ All sneakers          → /collections/sneakers
  ├ Kids sizes            → /collections/kids
  └ Under €100            → /collections/sneakers?price_max=100
T-Shirts                  → /collections/t-shirts
Hoodies                   → /collections/hoodies-sweatshirts
Jackets                   → /collections/jackets-outerwear
Pants                     → /collections/pants-shorts
Accessories               → /collections/accessories
Kids                      → /collections/kids
Sale                      → /collections/sale
```

Nested items automatically become a hover dropdown on desktop and a slide-in
subpanel (with an "All in …" link) in the mobile menu. Info pages
(`/pages/about`, `/pages/how-it-works`, `/pages/faq`, `/pages/contact`) are
linked from the footer and the mobile menu's Customer service section, so
they don't need to be in the main menu.

The footer is code-managed (edit `app/components/Footer.tsx`).

## 5. Environment variables (required for analytics + checkout CSP)

Pull the real values Shopify knows about:

```sh
npx shopify hydrogen env pull
```

Make sure **`PUBLIC_CHECKOUT_DOMAIN`** is set (currently defaulted to
`fqppy1-4a.myshopify.com` in `.env`; switch to your custom checkout domain
when you add one). Without it, Shopify analytics and consent never
initialize and checkout buttons can be blocked by the Content-Security-Policy.

For production (Oxygen), also **rotate `SESSION_SECRET`** to a fresh random
string — never reuse the development value:

```sh
openssl rand -hex 32
```

## 6. Customer privacy / cookie banner (required for EU sales)

The storefront enables Shopify's privacy banner (`withPrivacyBanner: true`).
Configure it in **Settings → Customer privacy**: choose the regions (EU/EEA/
UK at minimum), enable the cookie banner and preferences. Analytics only
fire after consent in those regions — that's correct GDPR behavior.

## 7. Markets & currencies

Shoppers pick **language and currency independently** (two dropdowns in the
header/footer). `app/lib/i18n.ts` defines:
- **Languages**: English (default), Nederlands, Deutsch, Français, Italiano
- **Currencies** (one per country in your shipping zones): EUR (default),
  USD, GBP, CHF, DKK, SEK, NOK, PLN, CZK, HUF, RON, BGN, ISK, RSD, BAM,
  MKD, ALL, MDL, BYN, CAD, AUD, NZD

Shopify prices by **country**, so each currency is served through a
representative country. Two important admin notes:

1. **Shipping zones ≠ Markets.** Your shipping profile covering 41 countries
   controls where you deliver — currency conversion is separate. For prices
   to actually convert, the country must be enabled in
   **Settings → Markets** with its local currency: Netherlands / Germany /
   France / Italy (EUR), United States (USD), United Kingdom (GBP),
   Switzerland (CHF), Denmark (DKK), Sweden (SEK), Norway (NOK),
   Poland (PLN), Czechia (CZK), Hungary (HUF), Romania (RON),
   Bulgaria (BGN), Iceland (ISK), Serbia (RSD), Bosnia (BAM),
   North Macedonia (MKD), Albania (ALL), Moldova (MDL), Belarus (BYN),
   Canada (CAD), Australia (AUD), New Zealand (NZD).
2. Shopify Payments doesn't support every presentment currency (e.g. some
   Balkan currencies may not be available) — countries you can't enable
   simply fall back to your store's default currency; the selector entry
   still works and checkout still functions.

Add or remove entries in the `LANGUAGES` / `CURRENCIES` arrays in
`i18n.ts` to change what the dropdowns offer.

## 8. Payments

**Settings → Payments**: activate Shopify Payments (cards, Apple Pay,
Shop Pay) + PayPal, and enable iDEAL/Klarna if you sell in markets that use
them. The footer shows badges for: Visa, Mastercard, Amex, PayPal, Apple Pay,
Shop Pay, iDEAL, Klarna — edit `app/components/PaymentIcons.tsx` to match
what you actually enable.

## 9. Discount codes (coupons)

Create codes in **Discounts → Create discount**. They work in two ways:
- Customers type them in the cart's "Discount code" field (invalid codes now
  show a clear message instead of disappearing).
- Share deep links: `https://yourdomain.com/discount/CODE` applies the code
  and redirects to the homepage (add `?redirect=/collections/sale` to land
  elsewhere).

## 10. Blog (optional)

Blog routes exist but no blog links are shown until you create one. To
publish articles: **Online Store → Blog posts**, create a blog with handle
`journal`, then add links to `/blogs/journal` in your menus (or ask to have
the Journal link re-added to the header/footer).

## 11. Rename the store in Shopify admin (required)

The storefront brand is **Fast Sneakers**, but your Shopify store is
still named "EasyHairKit" in admin — that name appears on the **checkout page, order
confirmation emails and invoices**. Change it under
**Settings → Store details → Store name** (and update the sender email there
too).

## 12. Fill in your business details (required before launch)

Everything brand/legal lives in **one file**: `app/data/shop.ts`. Fields
marked `PLACEHOLDER` render **nothing** until filled — the site never shows
fake data. Fill in:

- [ ] `email` — the support inbox on your real domain (currently
      `support@fastsneaker.com` as a placeholder)
- [ ] `legalName` — your registered company name
- [ ] `phone` — `{display, href}` to show phone support everywhere
- [ ] `whatsapp` — `{display, href}` to show WhatsApp support everywhere
- [ ] `address` — registered address (shown in Terms + contact page)
- [ ] `vatId` — VAT number (EU distance selling requires it)
- [ ] `registrationId` — KvK / company registration number
- [ ] `socials` — Instagram/TikTok links for the footer

Also review the commerce claims in the same file (free-shipping threshold,
processing time, delivery estimate, return window) — every page quotes these
constants, and the policies are written to match.

## 13. Nice-to-haves (next steps, not blockers)

- **Reviews**: integrate a real review app (Judge.me, Trustpilot, Loox). The
  site deliberately ships **without** fabricated review counts.
- **og:image**: export a 1200×630 PNG brand card and wire it in
  `app/lib/seo.ts` for richer social shares (product pages already share
  their product image).
- **Newsletter**: connect Shopify Email or Klaviyo, then add a signup form to
  the footer.
- **Real bundles**: create bundle products in Shopify and point the homepage
  "Routines" cards at them.
- **Custom domain**: connect it in Shopify, then update
  `PUBLIC_CHECKOUT_DOMAIN` and re-run `npx shopify hydrogen env pull`.

---

## Local development

```sh
npm install
npm run dev        # dev server with codegen
npm run typecheck  # TS + route typegen
npm run lint
npm run build
```
