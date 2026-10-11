import {SHOP} from '~/data/shop';

/*
 * The shop's questions and answers, in one place: the FAQ page renders all of
 * them (and publishes them as FAQPage JSON-LD), the homepage shows a handful.
 * Moved out of the route file so the homepage can use them without importing
 * a whole page.
 */

export interface FaqEntry {
  question: string;
  /** English source, with `{token}` placeholders for the SHOP fields —
   * resolved with real English values for the JSON-LD in `meta`, and with
   * translated values via `t()` for the on-page rendering below. */
  answer: string;
}

export const FAQ_ENTRIES: FaqEntry[] = [
  {
    question: 'Are your products 100% authentic?',
    answer:
      "Yes — 100% authentic, guaranteed. {disclaimer} Every pair is inspected by hand — we go through the material, the box, the labels and tags, and the details and finishing. If an item doesn't pass that check, it simply doesn't ship. If anything about an item you received isn't right, contact us and we'll resolve it.",
  },
  {
    question: 'How does sizing work?',
    answer:
      'Apparel runs true to size with a relaxed streetwear cut — size down if you prefer a slimmer fit. Sneakers are listed in EU sizing. Our size guide has garment measurements, an EU–US–UK sneaker conversion table and tips for measuring at home.',
  },
  {
    question: 'What do GS, PS and TD mean on sneakers?',
    answer:
      'They are kids’ size ranges: GS is Grade School (roughly EU 35.5–40 — also popular with adults with smaller feet), PS is Pre-School (roughly EU 27.5–35, sometimes marked "Enfant") and TD is Toddler (roughly EU 17–27, sometimes marked "Bébé"). The silhouettes are the same as the adult pairs.',
  },
  {
    question: 'Can I buy without opening the product page?',
    answer:
      'Yes. On any product card, tap "Choose size", pick your size and the item goes straight into your basket — on mobile the picker slides up from the bottom of the screen. Single-size items add with one tap.',
  },
  {
    question: 'How fast do you ship?',
    answer:
      'Orders are processed and shipped within {shipsWithin}, always with tracking. Typical delivery is {deliveryEstimate}. Shipping is free on every order.',
  },
  {
    question: 'Will I pay customs or import duties?',
    answer:
      'No. Within the EU all prices include VAT. For orders outside the EU — for example the United Kingdom, Switzerland, the United States and Canada — we pay any import duties and taxes ourselves, so there is nothing extra to pay at checkout or on delivery. See our Shipping Policy for details.',
  },
  {
    question: 'What is your return policy?',
    answer:
      'You can return any item within {days} days of delivery, without giving a reason — unworn, with tags attached and in the original box. Email {email} first with your order number so we can match your parcel. For a change-of-mind return you pay only the return shipping; we charge no fees and deduct nothing. Faulty or incorrect items: we cover everything. Full details are in our refund policy.',
  },
  {
    question: 'An item sold out in my size — will it restock?',
    answer:
      'Sometimes. Limited collabs usually don’t come back, but staples and popular silhouettes restock regularly — stock rotates weekly. Save the piece to your favorites (the heart on every product) and check back, or ask us about a specific item.',
  },
  {
    question: 'Which payment methods do you accept?',
    answer:
      'We accept major cards (Visa, Mastercard, Maestro, American Express, UnionPay), PayPal, Klarna, Apple Pay, Google Pay and Shop Pay, plus local methods like iDEAL | Wero, Bancontact, BLIK, MB WAY, MobilePay and TWINT where available. All payments run through Shopify’s secure, SSL-encrypted checkout.',
  },
  {
    question: 'How do I use a discount code?',
    answer:
      'Enter your code in the "Discount code" field in the cart or at checkout. If a code doesn’t apply, the cart will tell you — codes can be limited to specific products or minimum amounts.',
  },
  {
    question: 'How do I track my order?',
    answer:
      'As soon as your order ships you receive an email with a tracking link. You can also find your orders under "My account → Orders" when you’re signed in.',
  },
  {
    question: 'How should I care for my pieces?',
    answer:
      'For printed tees and hoodies: wash inside out, cold, and skip the dryer to protect prints and fit. For sneakers: store them in their box away from direct sunlight and clean with a soft brush — avoid machine-washing. Item-specific care notes are on the product page where relevant.',
  },
];

/** Fills the `{token}` placeholders in a FAQ answer with plain English SHOP
 * values — used for the JSON-LD in `meta`, which has no access to `t()`. */
export function resolveEnglishAnswer(answer: string): string {
  return answer
    .replace('{disclaimer}', SHOP.disclaimer)
    .replace('{shipsWithin}', SHOP.shipsWithin)
    .replace('{deliveryEstimate}', SHOP.deliveryEstimate)
    .replace('{days}', String(SHOP.returnDays))
    .replace('{email}', SHOP.email);
}

/** Same as above, but translated — for the on-page rendering. */
export function resolveTranslatedAnswer(
  answer: string,
  t: (text: string) => string,
): string {
  return t(answer)
    .replace('{disclaimer}', t(SHOP.disclaimer))
    .replace('{shipsWithin}', t(SHOP.shipsWithin))
    .replace('{deliveryEstimate}', t(SHOP.deliveryEstimate))
    .replace('{days}', String(SHOP.returnDays))
    .replace('{email}', SHOP.email);
}

/** The questions the homepage shows, in this order. */
export const HOME_FAQ_QUESTIONS = [
  'How fast do you ship?',
  'What is your return policy?',
  'How does sizing work?',
  'Will I pay customs or import duties?',
  'Which payment methods do you accept?',
];
