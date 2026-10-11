/**
 * The single source of truth for how a product is categorised and tagged.
 *
 * Shared by:
 *   scripts/fix-categories.mjs        — corrects the products we already have
 *   scripts/import-from-sneakerask.mjs — sets it on the ones we bring in
 *
 * Keeping both on one taxonomy is the point: our collections are smart rules
 * over product_type and tags, so old and new products only land in the same
 * places if they were classified by the same code.
 */

export const N = (s) => (s ?? '').toLowerCase();

/** Lowercase, hyphenate — matches the slug style already in the catalogue. */
export const slug = (s) =>
  N(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ------------------------------------------------------------- categories --

/**
 * Collectibles, toys, electronics and watches — not footwear or streetwear.
 *
 * Watches are matched on watch brands, never on collab names: "Travis Scott CJ
 * x Audemars Piguet Vintage Tee" is a t-shirt and has to stay.
 */
export const EXCLUDE =
  /pokemon|pokémon|pop ?mart|bearbrick|be@rbrick|sonny angel|nintendo|\bsony\b|playstation|xbox|funko|\blego\b|trading card|booster|\bplush\b|labubu|\bswatch\b|\brolex\b|\bcasio\b|g-?shock|\bseiko\b|tag heuer|patek philippe|\bwristwatch\b/;

/** Ordered, first match wins. */
const APPAREL = [
  ['Tracksuits', /tracksuit|track suit|\btwo piece\b|\bset\b/],
  ['Jackets', /jacket|\bcoat\b|parka|puffer|windbreaker|anorak|\bvest\b|bomber/],
  ['Hoodies', /hoodie|hoody|crewneck|sweatshirt|sweater|zip[- ]?up|full zip|pullover|\bcrew\b|thermal/],
  ['Shorts', /\bshorts?\b|boxers?|korte broek|\bjort|sweatshort/],
  ['Pants', /\bpants?\b|jean|denim|trouser|sweatpant|jogger|cargo|\bslacks?\b|broek|legging|\btights?\b/],
  // Bodywear before the shoe-brand fallback below, or a "Nike ... Bra" has no
  // apparel signal at all and gets read as footwear because Nike makes shoes.
  // `\bshirt\b` matches inside "t-shirt" — the hyphen is a word boundary — so
  // this needs a lookBEHIND. A forward lookahead can't see the "t-" that has
  // already been consumed, which is how every Essentials tee ended up in Tops.
  ['Tops', /flannel|button[- ]?up|overshirt|(?<!t[- ])\bshirt\b|\bbra\b|bralette|\bcrop\b|camisole|\btank\b|bodysuit|\bswim|bikini/],
  ['T-Shirts', /\btee\b|t-?shirt|jersey|\bpolo\b|long ?sleeve|\bl\/s\b|\bs\/s\b|\btop\b/],
  [
    'Accessories',
    /beanie|\bcap\b|\bhat\b|\bbag\b|backpack|\bsock|\bbelt\b|glove|scarf|wallet|keychain|\blace|towel|blanket|sticker|balaclava|\bmask\b|neck ?warmer|headband|wristband|watch|pouch|\bcase\b|bambino|\bpurse|tote|6-?panel/,
  ],
];

const FOOT = [
  // `\bcrocs\b`, never a bare `croc`: that is a leather finish far more often
  // than it is the clog maker. The loose match filed 15 sneakers under
  // Slippers — "Dunk Low LX Black Croc", "Nike Air Max 90 Sail Croc Print",
  // "Nike Dunk Low Crocodile Black" — and from there into Google's Slippers
  // category and a description calling a Nike Dunk "a Crocs slipper".
  ['Slippers', /slipper|slide|sandal|\bclog|\bcrocs\b|\bmule|tasman|scuff|birkenstock|\bfluff|disquette|coquette|venture daze/],
  ['Boots', /\bboots?\b|timberland|dr\.? martens|classic (short|mini|ultra|tall)|chelsea|bailey|neumel|adirondack|\bbutte\b|kinsley|lakesider|romely|harkley/],
];

const SHOE_BRANDS =
  /nike|jordan|adidas|new balance|asics|puma|salomon|saucony|vans|converse|crocs|ugg|hoka|birkenstock|reebok|on running|timberland|yeezy|mihara|dr\.? martens/;

/**
 * Our product_type for a product. `null` means "don't stock this".
 *
 * `sourceType` is the seller's own type when there is one — it settles the
 * footwear/apparel question, and the title only decides the finer split.
 */
export function classify({title, vendor, sourceType}) {
  // "Denim Tears" is a brand, not a fabric: without this its T-shirts and
  // hoodies match the Pants rule on "denim". (Function declared below.)
  const t = stripColourBrands(title);
  if (EXCLUDE.test(t) || EXCLUDE.test(N(vendor))) return null;

  if (/sneaker|shoe|boot|slipper/.test(N(sourceType))) {
    for (const [type, re] of FOOT) if (re.test(t)) return type;
    return 'sneakers';
  }
  for (const [type, re] of APPAREL) if (re.test(t)) return type;
  for (const [type, re] of FOOT) if (re.test(t)) return type;
  if (/\bsneakers?\b|runner|trainer/.test(t)) return 'sneakers';
  if (SHOE_BRANDS.test(N(vendor))) return 'sneakers';
  return null;
}

// ----------------------------------------------------------------- colour --

/** Our existing vocabulary. Compounds before their parts. */
const COLORS = [
  ['multicolor', /multi[- ]?colou?r|rainbow|tie[- ]?dye/],
  ['turquoise', /turquoise|\bteal\b|aqua/],
  ['petrol', /petrol/],
  ['silver', /silver|chrome|metallic|platinum|steel/],
  ['gold', /\bgold|golden/],
  ['olive', /olive|khaki/],
  ['beige', /beige|cream|sail|\btan\b|sand|oatmeal|bone|ivory|chalk|birch|linen|taupe|nude|natural|chestnut/],
  ['brown', /brown|chocolate|coffee|mocha|walnut|cognac|hazel|espresso/],
  ['grey', /\bgrey|\bgray|graphite|charcoal|cement|smoke|slate|\bash\b/],
  ['black', /black|onyx|\bnoir|phantom|obsidian|anthracite/],
  ['white', /white|blanc|summit/],
  ['blue', /blue|navy|cobalt|indigo|denim|sapphire|azure|marine/],
  ['green', /green|mint|lime|forest|sage|emerald/],
  ['red', /\bred\b|crimson|burgundy|maroon|scarlet|cherry|ruby|wine/],
  ['pink', /pink|\brose\b|fuchsia|magenta|blush|coral/],
  ['purple', /purple|violet|lilac|lavender|plum|grape/],
  ['orange', /orange|rust|amber|apricot|tangerine|copper/],
  ['yellow', /yellow|lemon|citron|volt|mustard/],
];

/**
 * Colour families named in a piece of text, in the order the TEXT mentions
 * them — not vocabulary order, which is what colorTags() returns.
 *
 * Reading order matters when the text is a manufacturer colourway or a
 * sentence describing one: "white upper with blue accents" and
 * "Sail/Black/University Red" both lead with the colour that dominates.
 */
/**
 * Brand names that contain a colour word. "Denim Tears The Cotton Wreath
 * Sweatpants Pink" was tagged color:blue on the strength of "Denim" — 38 of
 * the brand's 43 products carried it — which put pink sweatpants in the blue
 * filter, in Google's feed as Blue, and in the description as "in blue".
 */
const stripColourBrands = (text) => N(text).replace(/denim tears/g, ' ');

export function colorFamilies(text) {
  const t = stripColourBrands(text);
  const hits = [];
  for (const [name, re] of COLORS) {
    const match = re.exec(t);
    if (match) hits.push([match.index, name]);
  }
  return hits.sort((a, b) => a[0] - b[0]).map(([, name]) => name);
}

/** Up to two colours, so a "Sail/Black" shoe shows under both filters. */
export function colorTags(text) {
  const t = stripColourBrands(text);
  const hits = [];
  for (const [name, re] of COLORS) {
    if (re.test(t) && !hits.includes(name)) hits.push(name);
    if (hits.length === 2) break;
  }
  return hits.map((c) => `color:${c}`);
}

// ------------------------------------------------------------------ brand --

/** The maker of the shoe or garment. Order matters only within this list. */
const MANUFACTURERS = [
  [/air jordan|jumpman|\bjordan\b/, 'jordan'],
  [/new balance/, 'new-balance'],
  [/maison mihara|mihara yasuhiro/, 'maison-mihara-yasuhiro'],
  [/on running|\bon\b cloud/, 'on-running'],
  [/\badidas\b/, 'adidas'],
  [/\bnike\b/, 'nike'],
  [/\basics\b/, 'asics'],
  [/\bugg\b/, 'ugg'],
  [/\bpuma\b/, 'puma'],
  [/\bsalomon\b/, 'salomon'],
  [/\bvans\b/, 'vans'],
  [/\bconverse\b/, 'converse'],
  // Plural only — see the note on the Slippers rule above.
  [/\bcrocs\b/, 'crocs'],
  [/\bsaucony\b/, 'saucony'],
  [/\bhoka\b/, 'hoka'],
  [/birkenstock/, 'birkenstock'],
  [/timberland/, 'timberland'],
  [/dr\.? martens/, 'dr-martens'],
  [/\breebok\b/, 'reebok'],
  [/under armour/, 'under-armour'],
  [/yeezy|\byzy\b/, 'yeezy'],
];

/** Labels that make the product, rather than co-sign it. */
const LABELS = [
  [/fear of god|essentials/, 'essentials'],
  [/\bsupreme\b/, 'supreme'],
  [/\bstussy\b|st(ü|u)ssy/, 'stussy'],
  [/corteiz|\bcrtz\b/, 'corteiz'],
  [/sp5der|spyder/, 'sp5der'],
  [/denim tears/, 'denim-tears'],
  [/gallery dept/, 'gallery-dept'],
  [/syna world|\bsyna\b/, 'syna-world'],
  [/\brepresent\b/, 'represent'],
  // \bami\b: New Balance "Aminé" and "Miami" never match (24 Sep 2026).
  [/\bami\b|ami de c(oe|œ)ur/, 'ami-paris'],
  [/\bvlone\b/, 'vlone'],
  [/hellstar/, 'hellstar'],
  [/godspeed/, 'godspeed'],
  [/\bbape\b|a bathing ape/, 'bape'],
  [/jacquemus/, 'jacquemus'],
  [/vale forever/, 'vale-forever'],
  [/comme des gar(c|ç)ons|\bcdg\b/, 'comme-des-garcons'],
];

/** Collaborators — a name on the shoe, not the maker of it. */
const COLLABS = [[/travis scott|cactus jack/, 'travis-scott']];

const PLACEHOLDER = /^(easyhairkit|sneakerask|vespera[- ]?collectives?|fast[- ]?sneakers)?$/i;

/**
 * Brand slug for the `brand:` tag. Collaborators win here, because that's how
 * shoppers filter — someone looking for Travis Scott wants the Jordan 1 he
 * designed, not every Jordan.
 */
export function brandOf({title, vendor}) {
  const hay = `${N(vendor)} ${N(title)}`;
  for (const [re, name] of [...COLLABS, ...MANUFACTURERS, ...LABELS]) {
    if (re.test(hay)) return name;
  }
  // Some titles never name the maker — "Dunk Low LX Black Croc", "550 White
  // Nightwatch Green" — but the model does: every model slug starts with its
  // brand (`nike-dunk-low`, `new-balance-550`). Without this the only word
  // left to match in the first of those was "Croc".
  const inferred = brandFromModel(title);
  if (inferred) return inferred;
  // Never fall back to the placeholder vendor — that's how "Easyhairkit"
  // ends up looking like a brand.
  return PLACEHOLDER.test((vendor ?? '').trim()) ? null : slug(vendor) || null;
}

function brandFromModel(title) {
  // Footwear only. Model rules are written for shoes, and a garment can trip
  // one by accident: "KAWS x Uniqlo Tokyo First Tee" matches the adidas
  // Tokyo, and would have been branded adidas.
  const t = N(title);
  if (APPAREL.some(([, re]) => re.test(t))) return null;
  const model = modelTags(title ?? '')[0]?.slice('model:'.length);
  if (!model) return null;
  const known = [...MANUFACTURERS, ...LABELS]
    .map(([, name]) => name)
    .sort((a, b) => b.length - a.length);
  return (
    known.find((name) => model === name || model.startsWith(`${name}-`)) ?? null
  );
}

/**
 * Brand slug for the Shopify `vendor` field, which Meta reads as `brand`.
 * The maker wins here: an Air Jordan 1 Travis Scott is made by Air Jordan, and
 * telling Meta its brand is "Travis Scott" misdescribes it.
 */
export function vendorBrandOf({title, vendor}) {
  const hay = `${N(vendor)} ${N(title)}`;
  for (const [re, name] of [...MANUFACTURERS, ...LABELS, ...COLLABS]) {
    if (re.test(hay)) return name;
  }
  return PLACEHOLDER.test((vendor ?? '').trim()) ? null : slug(vendor) || null;
}

/**
 * Display name for the Shopify `vendor` field, which the Facebook & Instagram
 * channel maps to the catalogue's `brand`. Meta uses that for categorisation
 * and for its IP checks, so an Air Jordan whose brand reads as the shop's old
 * placeholder is both a targeting problem and a review risk.
 *
 * Anything not listed falls back to title-casing the slug, which is right for
 * most single-word labels (Puma, Salomon, Crocs).
 */
const BRAND_LABELS = {
  nike: 'Nike',
  jordan: 'Air Jordan',
  'dr-martens': 'Dr. Martens',
  'under-armour': 'Under Armour',
  'comme-des-garcons': 'Comme des Garçons',
  hoka: 'HOKA',
  bape: 'BAPE',
  sp5der: 'Sp5der',
  adidas: 'adidas',
  'new-balance': 'New Balance',
  asics: 'ASICS',
  ugg: 'UGG',
  essentials: 'Fear of God Essentials',
  'travis-scott': 'Travis Scott',
  'on-running': 'On Running',
  'maison-mihara-yasuhiro': 'Maison Mihara Yasuhiro',
  yeezy: 'Yeezy',
  'denim-tears': 'Denim Tears',
  'gallery-dept': 'Gallery Dept.',
  'syna-world': 'Syna World',
  vespera: 'Fast Sneakers',
};

export function brandLabel(brandSlug) {
  if (!brandSlug) return null;
  if (BRAND_LABELS[brandSlug]) return BRAND_LABELS[brandSlug];
  return brandSlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ------------------------------------------------------------------ model --

/**
 * Model lines, and where a line splits, its sub-model.
 *
 * A product gets the parent tag AND the sub tag, so `model:nike-dunk` keeps
 * every Dunk while `model:nike-dunk-low` drives the sub-collection. Splits
 * only exist where the numbers justify one — Air Force 1 is deliberately not
 * split, since 383 of its 439 are Low and the other two rows would be dead.
 *
 * Order matters: first parent match wins, so put specific lines above general.
 */
const MODELS = [
  ['jumpman-jack', /jumpman jack/],
  [
    'air-jordan-1',
    /jordan 1\b/,
    [
      ['air-jordan-1-high', /\bhigh\b/],
      ['air-jordan-1-mid', /\bmid\b/],
      ['air-jordan-1-low', /\blow\b/],
    ],
  ],
  ['air-jordan-3', /jordan 3\b/],
  ['air-jordan-4', /jordan 4\b/],
  ['air-jordan-5', /jordan 5\b/],
  ['air-jordan-6', /jordan 6\b/],
  ['air-jordan-11', /jordan 11\b/],
  ['air-jordan-12', /jordan 12\b/],
  [
    'nike-dunk',
    /\bdunk\b/,
    [
      ['nike-dunk-sb', /\bsb\b/],
      ['nike-dunk-high', /\bhigh\b/],
      ['nike-dunk-low', /\blow\b/],
    ],
  ],
  ['nike-air-force-1', /air force 1|\baf1\b/],
  [
    'nike-air-max',
    /air max/,
    [
      ['nike-air-max-plus', /air max plus|\btn\b/],
      ['nike-air-max-95', /air max 95/],
      ['nike-air-max-90', /air max 90/],
      ['nike-air-max-97', /air max 97/],
      ['nike-air-max-dn', /air max dn/],
      ['nike-air-max-1', /air max 1(?![0-9])/],
      ['nike-air-max-big-bubble', /big bubble/],
    ],
  ],
  ['nike-zoom-vomero', /vomero/, [['nike-vomero-5', /vomero 5\b/]]],
  ['nike-p-6000', /p-?6000/],
  ['nike-shox', /\bshox\b/, [['nike-shox-tl', /shox tl/]]],
  ['nike-cortez', /cortez/],
  ['nike-blazer', /blazer/],
  ['nike-total-90', /total 90/],
  ['nike-kobe', /\bkobe\b/, [['nike-kobe-protro', /protro/]]],
  ['nike-field-general', /field general/],
  ['nike-vaporwaffle', /vaporwaffle/],
  ['nike-waffle', /\bwaffle\b/],
  ['nike-zoom-cmft', /zoom cmft/],
  ['nike-golf', /\bgolf\b/],
  ['nike-next-nature', /next nature/],
  ['nike-lebron', /lebron/],
  ['nike-pegasus', /pegasus/],
  ['nike-reactx', /reactx|rejuven8/],
  ['nike-air-trainer', /air trainer/],
  // "Samba Red" is also an UGG colourway (Tasman, Neumel) — not a Samba.
  ['adidas-samba', /^(?!.*\bugg\b).*samba/],
  ['adidas-spezial', /spezial/],
  [
    'adidas-gazelle',
    /gazelle/,
    [
      ['adidas-gazelle-indoor', /gazelle indoor/],
      ['adidas-gazelle-bold', /gazelle bold/],
    ],
  ],
  ['adidas-campus', /campus/, [['adidas-campus-00s', /campus 00s/]]],
  ['adidas-superstar', /superstar/],
  ['adidas-xlg', /\bxlg\b/],
  ['adidas-taekwondo', /taekwondo/],
  ['adidas-bw-army', /bw army/],
  ['adidas-sl-72', /\bsl 72\b/],
  ['new-balance-9060', /9060/],
  ['new-balance-550', /\b550\b/],
  ['new-balance-530', /\b530\b/],
  ['new-balance-2002r', /2002r/],
  ['new-balance-1906', /1906/, [['new-balance-1906l', /1906l/]]],
  ['new-balance-740', /\b740/],
  ['new-balance-204l', /204l/],
  ['new-balance-1000', /\b1000\b/],
  ['asics-gel-nyc', /gel[- ]?nyc/],
  ['asics-gel-kayano', /gel[- ]?kayano/],
  ['asics-gel-1130', /gel[- ]?1130/],
  ['asics-gel-nimbus', /gel[- ]?nimbus/],
  ['asics-gel-cumulus', /gel[- ]?cumulus/],
  ['asics-gt-2160', /gt[- ]?2160/],
  // UGG carries more distinct silhouettes than any other house here, so it gets
  // the deepest tree: 625 products across Tasman, Tazz, Lowmel and the Classic
  // family, which shoppers treat as separate products rather than variants.
  [
    'ugg-classic',
    /\bugg\b|tasman|tazz|lowmel|neumel/,
    [
      ['ugg-tasman', /tasman/],
      ['ugg-tazz', /\btazz\b/],
      ['ugg-lowmel', /lowmel/],
      ['ugg-neumel', /neumel/],
      ['ugg-golden', /golden/],
      ['ugg-goldenstar', /goldenstar/],
      ['ugg-jasmine', /jasmine/],
      ['ugg-bailey', /bailey/],
      ['ugg-classic-ultra-mini', /ultra mini/],
      ['ugg-classic-mini', /classic mini/],
      ['ugg-classic-micro', /classic micro/],
      ['ugg-disquette', /disquette/],
      ['ugg-platform', /platform/],
      ['ugg-weather-hybrid', /weather hybrid/],
    ],
  ],
  // Silhouettes outside the six big houses, added once the import gave them
  // enough depth to be worth their own page.
  [
    'yeezy',
    /yeezy|\byzy\b/,
    [
      ['yeezy-350', /\b350\b/],
      ['yeezy-700', /\b700\b/],
      ['yeezy-slide', /slide/],
      ['yeezy-foam-rnnr', /foam (rnnr|runner)/],
    ],
  ],
  ['salomon-xt-6', /xt[- ]6/],
  ['salomon-xt-whisper', /xt[- ]whisper/],
  ['salomon-speedcross', /speedcross/],
  // Brands that previously had no silhouette at all — each turned out to be
  // dominated by a single line, which is exactly what a shopper looks for.
  ['saucony-progrid', /progrid/, [['saucony-progrid-omni', /omni/]]],
  ['hoka-one-one', /one one/],
  ['hoka-mafate', /mafate/],
  ['birkenstock-boston', /boston/],
  ['timberland-6-inch', /6[- ]inch|timberland.*waterproof/],
  ['new-balance-abzorb', /abzorb/],
  ['new-balance-miusa', /miusa|made in usa/],
  ['asics-gel-kinetic', /gel[- ]?kinetic/],
  // Jacquemus is bags, not shoes, and the Bambino line is most of it. Order
  // matters: "Le Grand Bambino" must not also read as a plain "Le Bambino".
  [
    'jacquemus-bambino',
    /bambino|bambimou/,
    [
      ['jacquemus-le-grand-bambino', /le grand bambino/],
      ['jacquemus-le-long-bambino', /le long bambino/],
      ['jacquemus-le-bambino', /le bambino/],
      ['jacquemus-croco', /croco/],
    ],
  ],
  ['jacquemus-le-chiquito', /le chiquito/],
  // Accessories are dominated by laces — 28 of 99 — which people search for by
  // name and would otherwise never surface.
  ['shoelaces', /\blaces?\b|veters/],
  ['caps-hats', /\bcap\b|\bhat\b|beanie|6-?panel/],
  ['bags', /\bbag\b|tote|backpack|pouch|purse|handbag/],
  ['crocs-classic-clog', /classic clog/],
  ['vans-old-skool', /old skool/],
  ['vans-sk8-hi', /sk8[- ]hi/],
  ['converse-chuck-taylor', /chuck taylor|chuck 70|all star/],
  ['puma-speedcat', /speedcat/, [['puma-speedcat-ballet', /ballet/]]],
  ['puma-lamelo-ball', /lamelo/],
  ['puma-palermo', /palermo/],
  ['new-balance-1000', /\b1000\b/],
  ['adidas-tokyo', /\btokyo\b/],
];

/**
 * Collaborations are a second axis, not a model. A "Nike x Off-White Air Force
 * 1" is both an Air Force 1 and an Off-White — forcing it into `model:` would
 * mean losing one of the two. These become `collab:` tags so a product can
 * carry a silhouette and a collab at once.
 */
const COLLAB_TAGS = [
  ['supreme', /supreme/],
  ['travis-scott', /travis scott|cactus jack/],
  ['jacquemus', /jacquemus/],
  ['sacai', /sacai/],
  ['nocta', /nocta/],
  // Hyphen required. The brand is written "Off-White"; "Off White" without one
  // is a colourway, and adidas uses it constantly — "Samba OG Black Off White"
  // is not an Off-White collab.
  ['off-white', /off-white/],
  ['kith', /\bkith\b/],
  ['bape', /\bbape\b|a bathing ape/],
  ['comme-des-garcons', /comme des gar(c|ç)ons|\bcdg\b/],
  // "Shoe Palace" is a US retailer whose exclusives are all over the catalogue;
  // Palace Skateboards is the collab. Only the latter counts.
  ['palace', /(?<!shoe )\bpalace\b/],
  ['fragment', /fragment/],
  ['wales-bonner', /wales bonner/],
  ['patta', /patta/],
  ['union', /\bunion\b/],
  ['clot', /\bclot\b/],
  ['kaws', /\bkaws\b/],
  ['stussy', /st(u|ü)ssy/],
  ['pharrell', /pharrell|human race/],
  ['concepts', /concepts/],
  // Small but real, and exactly the kind of thing a shopper searches by name.
  ['bad-bunny', /bad bunny/],
  ['ambush', /\bambush\b/],
  ['undefeated', /undefeated/],
  ['miu-miu', /miu miu/],
  ['a-ma-maniere', /a ma mani(e|è)re/],
  ['salehe-bembury', /salehe bembury/],
  ['aime-leon-dore', /aim(e|é) leon dore/],
  ['parra', /\bparra\b/],
  ['peaceminusone', /peaceminusone/],
  ['tiffany', /tiffany/],
  ['louis-vuitton', /louis vuitton/],
];

/**
 * Off-White the label has only ever made shoes with the Nike family. On any
 * other house's pair "Off-White" is a colourway, hyphen or not — "Adidas Samba
 * JJJJound Off-White Core Black" sat in the Nike x Off-White collection on the
 * strength of it.
 */
const OFF_WHITE_IS_A_COLOUR =
  /\b(adidas|samba|gazelle|new balance|asics|puma|reebok|salomon|saucony|ugg|vans|crocs|hoka|birkenstock|timberland|on running|yeezy|mihara)\b/;

/** `collab:` tags for a title. A product can legitimately have more than one. */
export function collabTags(title) {
  const t = N(title);
  return COLLAB_TAGS.filter(
    ([name, re]) =>
      re.test(t) && !(name === 'off-white' && OFF_WHITE_IS_A_COLOUR.test(t)),
  ).map(([name]) => `collab:${name}`);
}

/**
 * `model:` tags for a title — the line, plus every sub-model that applies.
 *
 * Sub-models stack rather than stopping at the first hit: an "Air Max 1 '86 Big
 * Bubble" is an Air Max, an Air Max 1 AND a Big Bubble, and a shopper filtering
 * on any of the three should find it.
 */
export function modelTags(title) {
  const t = N(title);
  for (const [parent, re, subs] of MODELS) {
    if (!re.test(t)) continue;
    const tags = [`model:${parent}`];
    if (subs) {
      for (const [name, subRe] of subs) {
        if (subRe.test(t)) tags.push(`model:${name}`);
      }
    }
    return tags;
  }
  return [];
}

/** Every model handle the taxonomy can produce — used to create collections. */
export function allModelHandles() {
  const out = [];
  for (const [parent, , subs] of MODELS) {
    out.push(parent);
    if (subs) out.push(...subs.map(([h]) => h));
  }
  return out;
}

// ------------------------------------------------------------------ price --

export const UNDERCUT = 10;
export const TRAVIS_PRICE = '139.99';
export const GEL_PRICE = '109.99';

/**
 * Same rules as scripts/reprice-sneakers.mjs. `null` means "don't price this",
 * and the caller should skip the product.
 *
 * The undercut only makes sense on sneaker-money items. SneakerAsk also sells
 * shoe-care bits at a few euros, where minus €10 lands at or below zero —
 * Shopify rejects that outright, so those are skipped rather than guessed at.
 */
export function targetPrice(title, sourceLowestPrice) {
  const t = N(title).replace(/[-_]/g, ' ');
  if (!Number.isFinite(sourceLowestPrice) || sourceLowestPrice <= 0) return null;
  // 28 Sep 2026 (owner): Travis Scott / Cactus Jack and GEL-NYC / KAYANO are
  // priced EXACTLY at SneakerAsk — no flat price. The old flat €139.99 /
  // €179.99 put hype pairs at a fraction of market, a counterfeit signal
  // that got the Merchant Center account suspended. TRAVIS_PRICE/GEL_PRICE
  // are kept exported only so old imports keep resolving; do not reuse them.
  if (/travis scott|cactus jack|gel nyc|gel kayano/.test(t)) {
    return (Math.round(sourceLowestPrice * 100) / 100).toFixed(2);
  }

  const undercut = Math.round((sourceLowestPrice - UNDERCUT) * 100) / 100;
  if (undercut <= 0) return null;
  return undercut.toFixed(2);
}

// ------------------------------------------------------------------- tags --

/** Preserve tags we don't manage (bestseller, bs:NNN, FREESHIPPING, wmns...). */
const MANAGED = /^(color|brand|model|size|collab|type):/;

/**
 * `type:` tag for apparel and accessories — the garment rows in the
 * storefront's Brand filter ("Stussy → T-Shirts / Hoodies", same as the menu)
 * filter on it. It has to be a TAG: the Storefront API silently ignores a
 * `productType` filter unless that facet is switched on in Search & Discovery,
 * and this store only exposes tags. Footwear gets none — nothing filters on it.
 * Keep the slugs in step with TYPE_ROWS in app/lib/filters.ts.
 */
const TYPE_TAGS = {
  't-shirts': 't-shirts',
  'tops': 't-shirts',
  'hoodies': 'hoodies',
  'jackets': 'jackets',
  'pants': 'pants',
  'shorts': 'shorts',
  'tracksuits': 'tracksuits',
  'accessories': 'accessories',
};

export function typeTag(productType) {
  const slugged = TYPE_TAGS[(productType ?? '').trim().toLowerCase()];
  return slugged ? `type:${slugged}` : null;
}

/**
 * Merge freshly-derived tags over a product's existing ones, replacing only
 * the prefixes we own. Anything hand-added in admin survives untouched.
 */
export function mergeTags(existing, derived) {
  const kept = (existing ?? []).filter((t) => !MANAGED.test(t));
  return [...new Set([...kept, ...derived])].sort();
}
