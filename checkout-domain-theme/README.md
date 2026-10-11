# checkout-domain-theme

Reference copy of the changes made to the Online Store theme that serves
`checkout.vesperacollectives.com`. The theme lives in Shopify admin, not in this
repo — this folder exists so the change is reviewable and re-appliable.

## Why

`checkout.vesperacollectives.com` is the Online Store channel. It exists only to
host Shopify checkout and the ParcelPanel order-tracking app proxy. Until now it
also served a full, stale copy of the Horizon theme, so anyone who escaped
checkout — returning from the sign-in flow, clicking the checkout header, or
following an old backlink — landed on an outdated storefront with outdated
prices instead of the Hydrogen site at `vesperacollectives.com`.

## What changed

Theme: **"Checkout domain — redirects to Hydrogen storefront"**
(`gid://shopify/OnlineStoreTheme/199427817859`)

- `snippets/headless-redirect.liquid` — new. Redirects theme-rendered pages to
  the Hydrogen storefront, preserving the path for routes Hydrogen mirrors.
- `layout/theme.liquid` — renders the snippet as the first thing in `<head>`.
- `snippets/storefront-links.liquid` — unchanged. Still rewrites `href="/"` on
  the pages that deliberately stay on this domain (the app proxy).

## What is never redirected

| Path / context | Reason |
| --- | --- |
| `/apps/*` | ParcelPanel order tracking has to render on this domain |
| Theme editor (`request.design_mode`) | Keeps the theme editable in admin |
| `password`, `challenge`, `gift_card`, `captcha` templates | No Hydrogen equivalent |
| `/checkouts/*`, `/customer_authentication/*` | Not theme-rendered — untouched |

## Verified

Live on the published theme, 2026-09-16:

- `checkout.vesperacollectives.com/collections/all?verify=1`
  -> `vesperacollectives.com/collections/all?verify=1` (path and query string
  both preserved)
- `checkout.vesperacollectives.com/` -> `vesperacollectives.com/`
- `checkout.vesperacollectives.com/apps/parcelpanel` stays put and renders the
  order-tracking form
- Favicon on the app-proxy page resolves to
  `/cdn/shop/files/icon-512.png?...width=32` — the setting survived the theme
  swap

Path preservation checked by reading `KEEP_PATH` out of the served HTML:
`true` for `/`, `/collections`, `/collections/all`, `/products/*`, `/cart`,
`/search`, `/blogs/*`, `/pages/*`. `/sitemap.xml` is not theme-rendered and
carries no redirect script.

## Fixed: /policies/* was losing its path

Symptom (live for roughly an hour after publishing): `/policies/refund-policy`
rendered fine but served `KEEP_PATH = false`, so it redirected to the Hydrogen
**home page** instead of the policy. Shopify checkout's footer links to these
URLs, so a customer in checkout could not read the refund or privacy policy at
all.

Cause: the `mirrored` list matches on `template.name`, and a shop policy page
does not report `template.name == 'policy'` — that entry never matched. The
`policy` entry is left in the list as harmless documentation of intent.

Fix, applied 2026-09-16 — path-based rather than template-based:

    if request.path contains '/policies/'
      assign keep_path = true
    endif

Had to be pasted into the admin code editor by hand: the Admin API refuses
`themeFilesUpsert` against the live theme (`category: live_theme`). The
alternative it suggests is duplicating the theme, patching the draft and
publishing that.

Verified after the fix: `KEEP_PATH = true` on refund, privacy, terms-of-service
and shipping policy pages, with `/collections/all`, `/cart`, `/pages/contact`
and `/` unchanged. End to end,
`checkout.vesperacollectives.com/policies/refund-policy` now lands on
`vesperacollectives.com/policies/refund-policy` rendering "Refund & Return
Policy".

**Lesson for future edits to this snippet:** don't trust `template.name` for
Shopify-generated pages. Match on `request.path` for anything whose template
you have not confirmed by reading `KEEP_PATH` out of the served HTML.

## Favicon

`layout/theme.liquid` renders the favicon from `settings.favicon`, and
`config/settings_data.json` in this theme now carries:

    "favicon": "shopify://shop_images/icon-512.png"

That image is the Vespera mark on the brand navy, uploaded to Shopify Files on
2026-09-16. It is set on **both** this theme and Horizon, so whichever one is
published, checkout and the app-proxy pages show the Vespera icon instead of
Shopify's default bag. Keep it set on this theme — publishing a theme swaps in
that theme's own `settings_data.json`, so a theme without the key silently
reverts the favicon.

## Status

**Published 2026-09-16.** This theme is now the Active theme for the Online
Store channel; Horizon has moved to Draft. The live theme is frozen at Horizon
4.1.1 (4.1.5 available) — harmless while every page redirects, but note it
before ever reverting to a browsable Liquid storefront.

To undo: publish Horizon again from Online Store -> Themes. That restores the
old storefront on `checkout.vesperacollectives.com`, stale prices included.

Notes for whoever maintains this next:

- The Admin API blocks `themePublish` and blocks theme file writes to the live
  theme, so publishing and any future edit to the *live* copy must be done by
  hand in the admin. Edit the draft and publish, or use the theme editor.
- The admin's Online Store page renders in a cross-origin frame that browser
  automation can screenshot but cannot click into, and its confirmation modal
  renders with zero height. Settings pages are fine; only the Online Store
  section is unreachable that way.


## 2026-09-28: crawler-proof redirect (Merchant Center)

Google Shopping links go to this domain. A non-JavaScript fetch of
`/products/sb-dunk-low-travis-scott` returned the full stale theme page with a
self-referencing canonical: the JS redirect only helps browsers, the
`<noscript>` meta refresh went to the home page, and the snippet's canonical
pointed every page at the home page.

Changed in `snippets/headless-redirect.liquid`: one `target` URL (path kept on
mirrored pages) used by an unconditional 0-second meta refresh, the canonical
and the JS redirect. (No `noindex`: Merchant Center must still be able to follow
the link through to the Hydrogen page.)

**Also required, by hand in the theme code editor** (the Admin API refuses
writes to the live theme): in `layout/theme.liquid`,

1. Move `{% render 'headless-redirect' %}` to be the first line inside `<head>`
   (it already is) and change it to capture a flag:

       {%- capture headless_redirect_html -%}{% render 'headless-redirect' %}{%- endcapture -%}
       {%- if headless_redirect_html contains 'http-equiv="refresh"' -%}
         {%- assign headless_redirect_active = true -%}
       {%- endif -%}
       {{ headless_redirect_html }}

2. Wrap the theme's own canonical tag so it is skipped when redirecting:

       {%- unless headless_redirect_active -%}
         <link rel="canonical" href="{{ canonical_url }}">
       {%- endunless -%}

Verify with a non-JS fetch (e.g. `curl -s <url> | grep -E 'refresh|canonical'`):
exactly one canonical, pointing at `https://vesperacollectives.com/products/...`.
