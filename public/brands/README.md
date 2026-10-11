# Brand logos

These files fill the brand tiles in the header mega menu and the mobile menu
drawer. A brand with a file here shows its mark; a brand without one shows its
name set in type. Both are legible — the marks just scan faster.

## Adding one

1. Save the artwork as `public/brands/<collection-handle>.png`
   (the handle is the last part of the collection URL, e.g.
   `/collections/supreme` → `supreme.png`).
2. Add that handle to `BRANDS_WITH_LOGOS` in `app/data/menuImages.ts`.

That's it — the path is derived from the handle, so it is never typed twice.

## Format

Match the six already here:

- **Near-black artwork on a transparent ground.** Not white-on-black, and not
  a screenshot with a white box around it — the tile is white, so a white
  background shows as a visible rectangle inside the card.
- **Trimmed to the mark.** No padding baked into the image; the tile supplies
  its own spacing. Padding inside the file makes the logo look small and
  off-centre next to a trimmed one.
- **~400px wide**, PNG with alpha. It renders at 30–38px tall, so this is
  ample for retina.
- **Landscape-ish wordmarks work best.** A tall or square mark is fine, it
  just renders smaller since height is the constraint.

## Have (6)

adidas · asics · jordan · new-balance · nike · ugg-boots-slippers

## Still needed (31)

bape · birkenstock · comme-des-garcons · converse · corteiz · crocs ·
denim-tears · essentials · gallery-dept · godspeed · hellstar · hoka ·
jacquemus · maison-mihara-yasuhiro · on-running · onitsuka-tiger · puma ·
represent · salomon · saucony · sp5der · stussy · supreme · syna-world ·
timberland · travis-scott · under-armour · vale-forever · vans · vlone · yeezy

Highest impact first, by how much of the catalogue sits behind the tile:
**yeezy** (166), **supreme** (170), **essentials** (308), **stussy** (53),
**puma**, **vans**, **converse**, **crocs**, **salomon**, **jacquemus**.
