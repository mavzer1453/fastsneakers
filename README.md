# Fast Sneakers — Hydrogen storefront

Custom Shopify Hydrogen (React Router 7) storefront for Fast Sneakers:
curated streetwear, sneakers and accessories — limited drops and everyday staples.

- **Setup & launch checklist:** see [SHOPIFY_SETUP.md](./SHOPIFY_SETUP.md)
- **Brand/legal/commerce config:** every brand string, contact detail and
  claim (shipping threshold, return window, …) lives in `app/data/shop.ts`
- **Policies content:** first-party legal pages in `app/data/policies.ts`
- **Markets:** 41 locale-prefixed markets in `app/lib/i18n.ts`

## Launching Fast Sneakers

This storefront started as a copy of the Vespera Collectives code, rebranded
for Fast Sneakers (same company, Bozkurt Enterprise). Before going live:

1. **Connect the store.** In the Fast Sneakers Shopify admin, install the
   **Hydrogen** sales channel, create a storefront, and connect this GitHub
   repo (`mavzer1453/fastsneakers`). Every push to `main` then deploys to Oxygen.
2. **Domain.** Buy the domain, connect it in Shopify (Settings → Domains), and
   if it is not `fastsneaker.com`, search-and-replace `fastsneaker.com` in
   the code (shop.ts, policies, emails, checkout theme).
3. **Support email.** Set `email` in `app/data/shop.ts` to a real inbox.
4. **Products & collections.** The menus, brand links and homepage tiles use
   collection handles (`nike`, `sale`, `air-jordan-1`, …) — create collections
   with the same handles in this store, or edit `app/lib/brand.ts` and
   `app/data/*`.
5. **Images.** Menu and homepage images still load from the original store's
   Shopify Files CDN (`const CDN` in `app/data/menuImages.ts`,
   `app/routes/($locale)._index.tsx`, `pages.authenticity.tsx`). Upload them to
   this store's Files and swap the CDN path.
6. **Tracking.** Use this store's own GA4 / Google Ads / Meta / TikTok IDs via
   environment variables (see `.env.example`). Nothing is hard-coded.
7. **Off until real:** reviews (`SHOP.reviews.show`, `showTestimonials`) and the
   Instagram strip (`INSTAGRAM_ENABLED` in `SocialProof.tsx`). Only turn them
   on with this store's own reviews and Instagram posts.

## Getting started

```sh
npm install
npm run dev        # local dev server (with GraphQL codegen)
```

Requires Node `^22 || ^24` and a `.env` (see `.env.example`, or run
`npx shopify hydrogen env pull`).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server + codegen |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | Route typegen + TypeScript |
| `npm run lint` | ESLint |
| `npm run codegen` | Regenerate GraphQL types |

## Structure highlights

- `app/routes/` — file-based routes, all nested under the optional
  `($locale)` market prefix
- `app/routes/($locale).pages.{about,faq,how-it-works,contact}.tsx` —
  local content pages (shadow Shopify pages)
- `app/lib/seo.ts` — `buildMeta()` used by every route (titles, canonical,
  OG/Twitter, JSON-LD)
- `app/components/` — Header, Footer, cart, product gallery, payment icons,
  predictive search
- `app/styles/app.css` — hand-written design system (no Tailwind classes)
