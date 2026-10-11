# Vespera Collectives — Hydrogen storefront

Custom Shopify Hydrogen (React Router 7) storefront for Vespera Collectives:
curated streetwear, sneakers and accessories — limited drops and everyday staples.

- **Setup & launch checklist:** see [SHOPIFY_SETUP.md](./SHOPIFY_SETUP.md)
- **Brand/legal/commerce config:** every brand string, contact detail and
  claim (shipping threshold, return window, …) lives in `app/data/shop.ts`
- **Policies content:** first-party legal pages in `app/data/policies.ts`
- **Markets:** 41 locale-prefixed markets in `app/lib/i18n.ts`

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
