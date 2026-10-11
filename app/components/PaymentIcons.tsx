/**
 * Inline SVG payment-method badges (no external images, CSP-safe).
 * Simplified marks — recognizable at badge size without shipping brand
 * asset files.
 *
 * This list mirrors the Payment step of the live checkout, checked
 * 24 Sep 2026. Only methods a shopper can actually pay with appear here:
 * advertising one that fails at checkout costs the sale and the trust.
 *
 * What the checkout offers:
 *   Express: Shop Pay, Apple Pay, Google Pay (Storefront API
 *   paymentSettings.supportedDigitalWallets)
 *   Klarna · Credit card (Visa, Maestro, Mastercard, Amex, UnionPay) · PayPal
 *   Local methods enabled in Shopify Payments (owner's admin screenshot,
 *   24 Sep 2026): Bancontact, BLIK, MB WAY, MobilePay, TWINT (Switzerland;
 *   enabled 24 Sep 2026, still "Pending" approval at the time). They only appear at
 *   checkout in their own country/currency (e.g. BLIK in PLN).
 *
 * iDEAL | Wero: added back 1 Oct 2026 — owner enabled it in Shopify
 * payments (only shown at checkout to Dutch shoppers paying in EUR).
 *
 * Removed on 24 Sep 2026: Mollie did not approve the store, so its methods
 * (Belfius, KBC/CBC, in3, Riverty, SEPA Bank Transfer) are
 * gone from the checkout. Their badges are in git history (commit d8bd59a).
 * Bancontact, MobilePay, BLIK and UnionPay were removed 21 Sep 2026 and
 * restored 24 Sep 2026 once confirmed enabled in Shopify Payments.
 */

interface BadgeProps {
  label: string;
  bg?: string;
  bordered?: boolean;
  children: React.ReactNode;
}

function Badge({label, bg = '#fff', bordered = true, children}: BadgeProps) {
  return (
    <svg
      role="img"
      aria-label={label}
      width="38"
      height="24"
      viewBox="0 0 38 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        width="37"
        height="23"
        x="0.5"
        y="0.5"
        rx="4"
        fill={bg}
        stroke={bordered ? '#dbe3e5' : 'none'}
      />
      {children}
    </svg>
  );
}

const badgeText = {
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  textAnchor: 'middle',
} as const;

function ShopPay() {
  return (
    <Badge label="Shop Pay" bg="#5A31F4" bordered={false}>
      <text
        {...badgeText}
        x="19"
        y="15"
        fontSize="7"
        fontWeight="800"
        fill="#fff"
      >
        shop
        <tspan fontWeight="400">pay</tspan>
      </text>
    </Badge>
  );
}

function ApplePay() {
  return (
    <Badge label="Apple Pay" bg="#000" bordered={false}>
      <path
        d="M13.6 8.9c.4-.5.7-1.2.6-1.9-.6 0-1.3.4-1.7.9-.4.4-.7 1.1-.6 1.8.7 0 1.3-.3 1.7-.8zm.6.9c-1 0-1.8.6-2.3.6-.5 0-1.2-.6-2-.6-1 0-2 .6-2.5 1.6-1.1 1.9-.3 4.7.8 6.2.5.7 1.1 1.6 1.9 1.5.8 0 1.1-.5 2-.5s1.2.5 2 .5c.8 0 1.4-.7 1.9-1.5.6-.9.8-1.7.8-1.8 0 0-1.6-.6-1.6-2.4 0-1.5 1.2-2.2 1.3-2.3-.7-1-1.8-1.2-2.3-1.3z"
        fill="#fff"
        transform="translate(3 1) scale(0.62)"
      />
      <text
        {...badgeText}
        x="23.5"
        y="15.5"
        fontSize="8"
        fontWeight="600"
        fill="#fff"
      >
        Pay
      </text>
    </Badge>
  );
}

function GooglePay() {
  return (
    <Badge label="Google Pay">
      <text
        {...badgeText}
        x="19"
        y="15"
        fontSize="7.5"
        fontWeight="700"
        fill="#5F6368"
      >
        <tspan fill="#4285F4">G</tspan>
        <tspan> Pay</tspan>
      </text>
    </Badge>
  );
}

function Visa() {
  return (
    <Badge label="Visa">
      <text
        {...badgeText}
        x="19"
        y="15.5"
        fontSize="8.5"
        fontWeight="800"
        fontStyle="italic"
        fill="#1434CB"
      >
        VISA
      </text>
    </Badge>
  );
}

function Mastercard() {
  return (
    <Badge label="Mastercard">
      <circle cx="15.5" cy="12" r="6.5" fill="#EB001B" />
      <circle cx="22.5" cy="12" r="6.5" fill="#F79E1B" fillOpacity="0.9" />
    </Badge>
  );
}

function Maestro() {
  return (
    <Badge label="Maestro">
      <circle cx="15.5" cy="12" r="6.5" fill="#0099DF" />
      <circle cx="22.5" cy="12" r="6.5" fill="#ED0006" fillOpacity="0.9" />
    </Badge>
  );
}

function Amex() {
  return (
    <Badge label="American Express" bg="#2E77BC" bordered={false}>
      <text
        {...badgeText}
        x="19"
        y="15"
        fontSize="7.5"
        fontWeight="800"
        fill="#fff"
      >
        AMEX
      </text>
    </Badge>
  );
}

function Paypal() {
  return (
    <Badge label="PayPal">
      <text
        {...badgeText}
        x="19"
        y="15"
        fontSize="7"
        fontWeight="800"
        fontStyle="italic"
        fill="#003087"
      >
        Pay
        <tspan fill="#009CDE">Pal</tspan>
      </text>
    </Badge>
  );
}

function Klarna() {
  return (
    <Badge label="Klarna" bg="#FFB3C7" bordered={false}>
      <text
        {...badgeText}
        x="19"
        y="15"
        fontSize="7"
        fontWeight="800"
        fill="#17120F"
      >
        Klarna.
      </text>
    </Badge>
  );
}

/** iDEAL now ships co-branded with Wero, on Wero's yellow. Two lines because
    "iDEAL | wero" on one line is unreadable at 38px wide. */
function IdealWero() {
  return (
    <Badge label="iDEAL | Wero" bg="#FFF48D" bordered={false}>
      <text
        {...badgeText}
        x="19"
        y="10.8"
        fontSize="6.4"
        fontWeight="800"
        fill="#0A0A0A"
      >
        <tspan fill="#CC0066">i</tspan>DEAL
      </text>
      <text
        {...badgeText}
        x="19"
        y="18.6"
        fontSize="6.2"
        fontWeight="800"
        fill="#1D1C1C"
      >
        wero
      </text>
    </Badge>
  );
}

function UnionPay() {
  return (
    <Badge label="UnionPay">
      <text
        {...badgeText}
        x="19"
        y="14.8"
        fontSize="5.4"
        fontWeight="800"
        fill="#005B9F"
      >
        Union
        <tspan fill="#E21836">Pay</tspan>
      </text>
    </Badge>
  );
}

function Bancontact() {
  return (
    <Badge label="Bancontact">
      <path d="M8 15.5 L14 8.5 H21 L15 15.5 Z" fill="#005498" />
      <path d="M17 15.5 L23 8.5 H30 L24 15.5 Z" fill="#FFD800" />
    </Badge>
  );
}

function Blik() {
  return (
    <Badge label="BLIK" bg="#000" bordered={false}>
      <text
        {...badgeText}
        x="19"
        y="15.5"
        fontSize="8"
        fontWeight="800"
        fill="#fff"
      >
        blik
      </text>
    </Badge>
  );
}

function MbWay() {
  return (
    <Badge label="MB WAY">
      <text
        {...badgeText}
        x="19"
        y="15"
        fontSize="7.5"
        fontWeight="900"
        fill="#000"
      >
        MB
        <tspan dx="1" fontSize="5.2" fontWeight="700" fill="#D6001C">
          WAY
        </tspan>
      </text>
    </Badge>
  );
}

function MobilePay() {
  return (
    <Badge label="MobilePay" bg="#5A78FF" bordered={false}>
      <text
        {...badgeText}
        x="19"
        y="14.8"
        fontSize="5.6"
        fontWeight="800"
        fill="#fff"
      >
        MobilePay
      </text>
    </Badge>
  );
}

function Twint() {
  return (
    <Badge label="TWINT" bg="#000" bordered={false}>
      <path d="M5 9 7.8 7.6l2.8 1.4v3.6L7.8 14 5 12.6z" fill="#fff" />
      <path d="M7.8 10.6 9 10v1.5l-1.2.6z" fill="#000" />
      <text
        {...badgeText}
        x="23.5"
        y="14.2"
        fontSize="5.8"
        fontWeight="800"
        fill="#fff"
      >
        TWINT
      </text>
    </Badge>
  );
}

/**
 * Order: express wallets, card schemes, then PayPal, Klarna and the local
 * methods. Sixteen marks: the product page wraps them 8 + 8 (see
 * .product-payments in app.css), so the ninth badge starts row two.
 */
export function PaymentIcons() {
  return (
    <div className="payment-icons" role="group" aria-label="Accepted payment methods">
      <ShopPay />
      <ApplePay />
      <GooglePay />
      <Visa />
      <Mastercard />
      <Maestro />
      <Amex />
      <UnionPay />
      <Paypal />
      <Klarna />
      <IdealWero />
      <Bancontact />
      <Blik />
      <MbWay />
      <MobilePay />
      <Twint />
    </div>
  );
}
