// Local, first-party policy content rendered by the policies routes. Editing
// these strings updates the live pages at /policies/<handle>. Content is stored
// as trusted HTML so it can be rendered into the styled `.policy-content`
// container (same pattern the route already uses for Shopify-hosted policies).

import {SHOP} from '~/data/shop';
import {translate} from '~/lib/translations';
import type {Language} from '~/lib/translations';

const SUPPORT_EMAIL = SHOP.email;
const mail = (label = SUPPORT_EMAIL) =>
  `<a href="mailto:${SUPPORT_EMAIL}">${label}</a>`;

/** Every language except the source one. */
type TranslatedLanguage = Exclude<Language, 'EN'>;

// Company identity lines for the Terms — only real values are rendered.
// Fill the PLACEHOLDER fields in app/data/shop.ts before launch.
// Parameterized by label set so every translation of the Terms of Service
// can render the same SHOP fields with its own labels (see
// `companyIdentity*` below and `POLICY_TRANSLATIONS['terms-of-service']`).
interface CompanyIdentityLabels {
  companyName: string;
  registeredAddress: string;
  addressOnRequest: (email: string) => string;
  companyRegistration: string;
  vatNumber: string;
  customerService: string;
  /** Connector word before an optional phone number, e.g. "or". */
  or: string;
}

function buildCompanyIdentity(labels: CompanyIdentityLabels): string {
  return [
    `<li><strong>${labels.companyName}:</strong> ${SHOP.legalName}</li>`,
    SHOP.address
      ? `<li><strong>${labels.registeredAddress}:</strong> ${SHOP.address.join(', ')}</li>`
      : `<li><strong>${labels.registeredAddress}:</strong> ${labels.addressOnRequest(SUPPORT_EMAIL)}</li>`,
    SHOP.registrationId
      ? `<li><strong>${labels.companyRegistration}:</strong> ${SHOP.registrationId}</li>`
      : '',
    SHOP.vatId ? `<li><strong>${labels.vatNumber}:</strong> ${SHOP.vatId}</li>` : '',
    `<li><strong>${labels.customerService}:</strong> ${mail()}${
      SHOP.phone ? ` ${labels.or} ${SHOP.phone.display}` : ''
    }</li>`,
  ]
    .filter(Boolean)
    .join('\n        ');
}

const companyIdentity = buildCompanyIdentity({
  companyName: 'Company name',
  registeredAddress: 'Registered address',
  addressOnRequest: (email) => `available on request via ${email}`,
  companyRegistration: 'Company registration',
  vatNumber: 'VAT number',
  customerService: 'Customer service',
  or: 'or',
});

const companyIdentityDE = buildCompanyIdentity({
  companyName: 'Firmenname',
  registeredAddress: 'Eingetragene Geschäftsadresse',
  addressOnRequest: (email) => `auf Anfrage erhältlich über ${email}`,
  companyRegistration: 'Handelsregisternummer',
  vatNumber: 'USt-IdNr.',
  customerService: 'Kundenservice',
  or: 'oder',
});

const companyIdentityFR = buildCompanyIdentity({
  companyName: 'Raison sociale',
  registeredAddress: 'Adresse du siège social',
  addressOnRequest: (email) => `disponible sur demande à ${email}`,
  companyRegistration: "Immatriculation de l'entreprise",
  vatNumber: 'Numéro de TVA',
  customerService: 'Service client',
  or: 'ou',
});

const companyIdentityES = buildCompanyIdentity({
  companyName: 'Nombre de la empresa',
  registeredAddress: 'Domicilio social',
  addressOnRequest: (email) =>
    `disponible previa solicitud a través de ${email}`,
  companyRegistration: 'Número de registro mercantil',
  vatNumber: 'Número de IVA',
  customerService: 'Atención al cliente',
  or: 'o',
});

const companyIdentityIT = buildCompanyIdentity({
  companyName: 'Ragione sociale',
  registeredAddress: 'Sede legale',
  addressOnRequest: (email) => `disponibile su richiesta scrivendo a ${email}`,
  companyRegistration: 'Registrazione aziendale',
  vatNumber: 'Partita IVA',
  customerService: 'Assistenza clienti',
  or: 'o',
});

const companyIdentitySV = buildCompanyIdentity({
  companyName: 'Företagsnamn',
  registeredAddress: 'Registrerad adress',
  addressOnRequest: (email) => `tillgänglig på begäran via ${email}`,
  companyRegistration: 'Registreringsnummer',
  vatNumber: 'Momsregistreringsnummer',
  customerService: 'Kundtjänst',
  or: 'eller',
});

const companyIdentityTR = buildCompanyIdentity({
  companyName: 'Şirket adı',
  registeredAddress: 'Kayıtlı adres',
  addressOnRequest: (email) =>
    `Talep üzerine ${email} adresinden temin edilebilir`,
  companyRegistration: 'Şirket sicil numarası',
  vatNumber: 'KDV numarası',
  customerService: 'Müşteri hizmetleri',
  or: 'veya',
});

export interface PolicyEntry {
  handle: string;
  title: string;
  updated: string;
  intro: string;
  /** Trusted HTML. */
  body: string;
}

export const POLICIES: PolicyEntry[] = [
  {
    handle: 'privacy-policy',
    title: 'Privacy Policy',
    updated: 'Last updated: July 2026',
    intro: 'How we collect, use, and protect your personal information.',
    body: `
      <p><strong>Services overview.</strong> ${SHOP.name} operates the store and website, including all related tools, products, and services, to provide a curated shopping experience (“Services”). Shopify powers the website and Services. This Privacy Policy explains how ${SHOP.name} collects, uses, and discloses your personal information. In case of conflict with the Terms of Service, this Privacy Policy takes precedence for personal data handling.</p>

      <h2>Personal information we collect</h2>
      <p>“Personal information” refers to data that can identify you directly or indirectly. Examples include:</p>
      <ul>
        <li><strong>Contact details:</strong> name, address, phone, email.</li>
        <li><strong>Financial information:</strong> payment card numbers, account info, transactions.</li>
        <li><strong>Account information:</strong> username, password, preferences.</li>
        <li><strong>Transaction information:</strong> orders, returns, wishlist, browsing history.</li>
        <li><strong>Communications:</strong> emails or messages to customer support.</li>
        <li><strong>Device &amp; usage information:</strong> IP address, browser info, interaction with the site.</li>
      </ul>

      <h3>Sources of data</h3>
      <ul>
        <li><strong>Directly from you</strong> — account creation, purchase, messages.</li>
        <li><strong>Automatically through the website</strong> — cookies, tracking tools.</li>
        <li><strong>From service providers</strong> — payment processors, IT services.</li>
        <li><strong>From partners or third parties.</strong></li>
      </ul>

      <h2>How your data is used</h2>
      <p>${SHOP.name} uses your data to:</p>
      <ul>
        <li><strong>Provide &amp; improve Services:</strong> process payments, fulfill orders, manage accounts, personalize your shopping experience.</li>
        <li><strong>Marketing &amp; advertising:</strong> send promotions, emails, and online ads based on your activity.</li>
        <li><strong>Security &amp; fraud prevention:</strong> secure accounts, detect fraud, protect users.</li>
        <li><strong>Communication:</strong> customer support and account updates.</li>
        <li><strong>Legal compliance:</strong> respond to legal requests, enforce policies, or protect rights.</li>
      </ul>

      <h2>Data sharing</h2>
      <p>Your information may be shared with:</p>
      <ul>
        <li><strong>Shopify and other vendors</strong> providing IT, payment, fulfillment, or analytics services.</li>
        <li><strong>Marketing partners</strong> for personalized ads.</li>
        <li><strong>Affiliates</strong> within the corporate group.</li>
        <li>During <strong>business transactions, legal processes</strong>, or for enforcement of policies.</li>
      </ul>
      <p><strong>Shopify’s role.</strong> Shopify hosts the website, collects some data, and provides enhanced features. Learn more in the <a href="https://www.shopify.com/legal/privacy" target="_blank" rel="noopener noreferrer">Shopify Privacy Policy</a>.</p>

      <h2>Third-party links</h2>
      <p>${SHOP.name} may link to other websites. We are not responsible for their privacy practices. Always review third-party policies.</p>

      <h2>Children’s data</h2>
      <p>The site is not for children, and ${SHOP.name} does not knowingly collect data from children under the age of majority. Parents can request deletion of any such data.</p>

      <h2>Security &amp; data retention</h2>
      <p>While security measures are in place, perfect security cannot be guaranteed. Data retention depends on purpose, legal obligations, or account maintenance needs.</p>

      <h2>Your rights</h2>
      <p>Depending on your location, you may have rights to:</p>
      <ul>
        <li><strong>Access, delete, or correct</strong> your data.</li>
        <li><strong>Receive or transfer</strong> your data (portability).</li>
        <li><strong>Restrict or object to</strong> processing.</li>
        <li><strong>Withdraw consent</strong> where applicable.</li>
        <li><strong>Manage marketing communications.</strong></li>
      </ul>
      <p>UK/EEA residents may have additional rights. Requests can be made through the contact options on the website.</p>

      <h2>International transfers</h2>
      <p>Your data may be processed outside your country. Transfers from the EEA/UK rely on legal safeguards like Standard Contractual Clauses.</p>

      <h2>Policy updates</h2>
      <p>${SHOP.name} may update this Privacy Policy to reflect changes in practices, legal requirements, or operational needs. Updates will be posted with a revised “Last updated” date.</p>

      <h2>Contact</h2>
      <p>Questions about your privacy? Email us at ${mail()}.</p>
    `,
  },
  {
    handle: 'refund-policy',
    title: 'Refund & Return Policy',
    updated: 'Last updated: September 2026',
    intro: 'How returns and refunds work, and how to start one.',
    body: `
      <h2>1. Eligibility for returns</h2>
      <p>To be eligible for a return, items must be unworn, unused, and in the same condition as received, including the original packaging.</p>
      <p>Returns must be requested within ${SHOP.returnDays} days of receiving your order.</p>
      <p>Items marked as final sale or explicitly stated as non-refundable are not eligible for returns or refunds.</p>

      <h2>2. How to request a return or refund</h2>
      <p>To request a return or refund, please email us at ${mail()} within ${SHOP.returnDays} days of receiving your order and include:</p>
      <ul>
        <li>Your order number</li>
        <li>The reason for the return</li>
      </ul>
      <p>Our team will reply with the correct return address and full instructions. Please do not send an item back before you have received a confirmed return address from us, as we are unable to process unannounced returns. Please make sure items are securely packaged to avoid damage in transit.</p>

      <h2>3. Return shipping costs</h2>
      <p>Customers are responsible for return shipping costs. We strongly recommend using a trackable shipping service, as we cannot guarantee receipt of returned items.</p>

      <h2>4. Refund process</h2>
      <p>Once we receive and inspect your return, we will notify you of the approval status.</p>
      <p>If approved:</p>
      <ul>
        <li>Refunds are processed within 5 business days</li>
        <li>Funds are returned to your original payment method</li>
      </ul>
      <p>Please note that it may take additional time for your bank or card provider to process the refund. If more than 15 business days have passed since approval, please contact us.</p>

      <h2>5. Non-returnable items</h2>
      <p>The following items are not eligible for return:</p>
      <ul>
        <li>Personalised or customised products, unless defective or damaged</li>
        <li>Clearance or final sale items</li>
      </ul>

      <h2>6. Delivery &amp; return conditions</h2>
      <ul>
        <li>Returns cannot be initiated before the item has been delivered.</li>
        <li>If you wish to cancel your order, you must first receive the package and then return it.</li>
        <li>We do not issue refunds if a customer refuses delivery or fails to collect their package.</li>
        <li>If a package is sent to a pickup point and is not collected, a ${SHOP.uncollectedFee} administrative fee will be deducted from any refund.</li>
      </ul>

      <h2>7. Return address</h2>
      <p>To request a refund or return, please email us at ${mail()} and we will send you the correct return address. Return addresses are issued per order, so please always request one from us before sending anything back.</p>

      <h2>8. Contact us</h2>
      <p>For any questions regarding this policy, please contact us at ${mail()}. We aim to respond within 1 to 2 business days.</p>
      <p>By placing an order with us, you agree to this Refund &amp; Return Policy.</p>

      <h2>Returns &amp; refunds — United States and Canada</h2>
      <p>This section applies to orders delivered to the United States and Canada. Orders within the European Union follow the standard policy above, including the statutory ${SHOP.returnDays}-day right of withdrawal.</p>

      <h3>Changed your mind?</h3>
      <p>You have ${SHOP.returnDays} days from delivery to return unworn items in their original condition, with tags and packaging intact.</p>
      <p>We want to be upfront about what a change-of-mind return costs, so there are no surprises when your refund arrives.</p>
      <p>Shipping to North America is free — you are never charged a delivery fee at checkout. Import duties and customs charges are collected at checkout as their own <strong>Duties &amp; handling</strong> line, so your parcel clears customs with nothing left to pay on delivery.</p>
      <p>When an order comes back to us, two of those costs are already spent and cannot be recovered. They are therefore not returned to you:</p>
      <ul>
        <li><strong>The delivery cost we paid to ship your order</strong> — this amount varies depending on the size and weight of your order, and is confirmed to you when your return is approved. It is deducted from your refund.</li>
        <li><strong>The Duties &amp; handling you paid at checkout</strong> — customs does not return these to us once the parcel has been imported, so this line is not refundable.</li>
        <li><strong>Return administration fee: ${SHOP.returnAdminFee}</strong> — deducted from your refund.</li>
      </ul>
      <p>Return shipping is arranged and paid for by you. We do not provide prepaid return labels for change-of-mind returns. We recommend using a tracked service — until the parcel reaches us, it remains your responsibility.</p>

      <h3>Damaged, faulty or incorrect items</h3>
      <p>No deductions apply. You receive a full refund, including the Duties &amp; handling you paid, and we cover return shipping. Email ${mail()} within ${SHOP.returnDays} days with your order number and photos.</p>
      <p>By placing an order for delivery to the United States or Canada, you confirm that you have read and accepted the terms above.</p>
    `,
  },
  {
    handle: 'terms-of-service',
    title: 'Terms of Service',
    updated: 'Last updated: July 2026',
    intro: 'The terms and conditions that apply to every order.',
    body: `
      <p>These Terms and Conditions apply to every offer and order between ${SHOP.name} and the consumer.</p>

      <h2>Article 1 – Definitions</h2>
      <ul>
        <li><strong>Right of Withdrawal:</strong> the period during which the consumer can exercise their right to cancel the agreement.</li>
        <li><strong>Consumer:</strong> a natural person who is not acting for commercial purposes and enters into a distance sales agreement with the company.</li>
        <li><strong>Ongoing Agreement:</strong> a distance sales agreement regarding a series of products or services, where obligations are spread over time.</li>
        <li><strong>Right to Withdraw:</strong> the consumer’s right to cancel the agreement within the withdrawal period.</li>
        <li><strong>Company (Entrepreneur):</strong> the natural or legal person offering products or services remotely to consumers.</li>
        <li><strong>Distance Sales Agreement:</strong> an agreement concluded between the company and the consumer using remote communication.</li>
        <li><strong>CESOP:</strong> the EU Central Electronic System of Payment Information for monitoring payment service providers.</li>
      </ul>

      <h2>Article 2 – Company identity</h2>
      <ul>
        ${companyIdentity}
      </ul>

      <h2>Article 3 – Applicability</h2>
      <p>These terms apply to any offer, distance sales agreement, and order between the company and the consumer. The consumer has access to the terms before concluding the agreement. If this is not possible, the consumer will be informed where they can view or receive the terms free of charge.</p>
      <p>For electronic agreements, the terms are provided in a way that allows them to be stored on a durable medium. If this is not possible, the location of the terms will be indicated. In case of conflict between these terms and specific product or service terms, the provisions most favorable to the consumer will apply. Invalid provisions do not affect the remaining terms; they are replaced by provisions that best match the original intent.</p>

      <h2>Article 4 – The offer</h2>
      <p>Offers are non-binding; the company may change them. Any limitations or conditions of offers are clearly stated. Product descriptions are as accurate as possible; colors and images may vary. The following information is clearly stated:</p>
      <ul>
        <li>Prices (excluding customs duties and VAT on imports – the consumer’s responsibility).</li>
        <li>Any shipping costs.</li>
        <li>How the agreement is concluded and what steps are required.</li>
      </ul>

      <h2>Article 5 – The agreement</h2>
      <p>The agreement is concluded when the consumer accepts the offer and meets the conditions. For electronic acceptance, the company immediately confirms receipt. Until then, the consumer may cancel the agreement. The company uses appropriate technical and organizational security measures for electronic transactions.</p>
      <p>The company may request information about the consumer’s ability to pay. Based on this, orders may be refused or special conditions applied. Upon conclusion of the agreement, the consumer receives information about:</p>
      <ul>
        <li>Right of withdrawal.</li>
        <li>Warranty and after-sales service.</li>
        <li>Other relevant information (see Article 4).</li>
        <li>Termination conditions for long-term agreements.</li>
      </ul>
      <p>All agreements are subject to product availability.</p>

      <h2>Article 6 – Right of withdrawal</h2>
      <p>The consumer has a 14-day right of withdrawal from receipt of the goods. Returns are at the consumer’s own expense. Defective goods will be refunded or replaced. During the withdrawal period, the product must be treated with care. Withdrawal must be notified in writing within 14 days, after which the product must be returned within a further 14 days. Proof of timely return must be provided. Failure to notify or return is considered a final purchase.</p>
      <p>The right of withdrawal does not apply to:</p>
      <ul>
        <li>Custom-made or personalized products.</li>
        <li>Items that have been worn, washed or altered, or whose tags or labels have been removed.</li>
        <li>Newspapers, software, audio, and video recordings with broken packaging.</li>
        <li>Services with a specific date (accommodation, transport, leisure).</li>
      </ul>
      <p>The customer holds ${SHOP.name} harmless against third-party claims. The company is not responsible for errors in product descriptions unless due to gross negligence.</p>

      <h2>Article 7 – Costs of withdrawal</h2>
      <p>Only the return shipping costs are paid by the consumer. Paid amounts will be refunded within 14 days of receipt of the returned goods.</p>

      <h2>Article 8 – Customs and VAT</h2>
      <ol>
        <li>The customer is solely responsible for fulfilling all legal obligations regarding the importation of goods into the country of delivery, including the payment of import duties, taxes, and customs clearance costs.</li>
        <li>The entrepreneur does not act as the importer of record for any products shipped to the customer.</li>
        <li>The customer is responsible for ensuring compliance with local laws and regulations concerning the importation and use of the purchased goods.</li>
        <li>All additional costs incurred during customs clearance, including administrative fees imposed by the postal or courier service, are borne exclusively by the customer.</li>
        <li>The entrepreneur provides the necessary documentation for the shipment but does not guarantee that the goods will meet local import regulations. Customers are advised to verify import requirements prior to placing an order.</li>
      </ol>

      <h2>Article 9 – CESOP</h2>
      <p>From 2024, payment service providers register transactions in the EU CESOP system. ${SHOP.name} complies with these rules.</p>

      <h2>Article 10 – Compliance and warranty</h2>
      <p>Products are delivered in accordance with the agreement. Defects must be reported in writing within 14 days. Returns must be in original condition and packaging.</p>

      <h2>Article 11 – Delivery</h2>
      <p>In case of delay, notice will be given within 30 days. The customer is responsible for import-related processes. ${SHOP.name} follows international shipping rules but is not responsible for customs clearance, delays, or refusals. Failure to pay customs does not entitle the customer to a refund.</p>

      <h2>Article 12 – Complaint procedure</h2>
      <p>Complaints must be submitted in writing within 7 days of discovery. A response will be provided within 14 days. If more time is needed, a new deadline will be communicated.</p>

      <h2>Article 13 – Disputes</h2>
      <p>Disputes are governed by Belgian law. Parties will first attempt to settle amicably. Otherwise, the case will be submitted to the competent court.</p>

      <h2>Article 14 – Price</h2>
      <p>Prices remain fixed during the offer period unless legislation changes. Price changes within 3 months may only occur due to legal changes. After 3 months, only if the consumer is informed and can terminate the agreement. For deliveries outside the EU, import VAT and customs duties are paid by the customer upon import. Typographical and clerical errors are reserved; products are not delivered at incorrect prices.</p>

      <h2>Article 15 – Legal notice</h2>
      <p>${SHOP.name} is an independent reseller and is not affiliated with any brands. Brand names and logos belong to their respective owners. Any style references are descriptive only.</p>

      <h2>Article 16 – Payment</h2>
      <p>Unless otherwise agreed, payment must be made within 7 working days after the start of the withdrawal period. Errors in payment details must be immediately reported to the company. In case of non-payment, the company may charge pre-notified costs in accordance with the law.</p>

      <h2>Article 17 – Complaints</h2>
      <p>Complaints about the execution of the agreement must be reported in writing and in detail within 7 days of discovery. A response will be provided within 14 days. If processing takes longer, a status update and new deadline will be given. Unresolved complaints are treated as a dispute. Complaints do not suspend obligations unless confirmed in writing by the company. If the complaint is justified, the company will, at its discretion, replace or repair the product free of charge.</p>

      <h2>Article 18 – Changes to terms</h2>
      <p>The latest terms are always available on our website. We reserve the right to change them at any time. Continued use of the website after changes constitutes acceptance.</p>
    `,
  },
  {
    handle: 'shipping-policy',
    title: 'Shipping Policy',
    updated: 'Last updated: July 2026',
    intro: 'Processing times, delivery estimates, and tracking.',
    body: `
      <p>Here’s everything you need to know about how and when your ${SHOP.name} order ships.</p>

      <h2>Processing time</h2>
      <p>Orders are processed and shipped within 1–3 business days after payment is received. Processing times may be longer during busy periods.</p>

      <h2>Shipping method &amp; costs</h2>
      <p>We currently offer standard tracked shipping for all orders. <strong>Shipping is free on every order, to every destination we deliver to.</strong> No minimum order value applies.</p>
      <p>All orders are shipped in sturdy, protective packaging — sneakers travel in an outer carton so the shoe box arrives in collector's condition.</p>

      <h2>Delivery time</h2>
      <p>Estimated delivery times vary depending on the delivery address (calculated from the time the package is shipped from us).</p>

      <h2>International shipping</h2>
      <p>We offer international shipping. Estimated delivery for international orders is 5–15 business days. Actual delivery times may vary and are subject to customs regulations.</p>

      <h2>Order tracking</h2>
      <p>Once your order has shipped, you will receive an email with a shipping confirmation and tracking number so you can follow your order. This may not apply to certain countries, but we will provide proof of shipment.</p>

      <h2>Delayed or lost orders</h2>
      <p>If your order is delayed or not received, please contact us at ${mail()} so we can help track and resolve the issue.</p>

      <h2>Taxes and customs duties</h2>
      <p>It is the buyer’s responsibility to comply with all applicable import duties, taxes, and customs fees for international shipments. Prices exclude VAT. See our Terms of Service for complete details.</p>

      <h2>Address information</h2>
      <p>Please ensure you enter the correct delivery address at checkout. We are not responsible for delays or returned packages due to incorrect address information.</p>

      <h2>Customer service</h2>
      <p>For any questions or additional assistance, contact us at ${mail()}. See our Terms of Service for more information.</p>
      <p>By clicking “Proceed to Payment,” you accept our Shipping Policy.</p>
    `,
  },
  {
    handle: 'contact-information',
    title: 'Contact Information',
    updated: 'Last updated: September 2026',
    intro: 'How to reach us and when to expect a reply.',
    body: `
      <p>Have a question about your order, a product, or anything else? We’re happy to help.</p>

      <h2>Get in touch</h2>
      <ul>
        <li><strong>Business name:</strong> ${SHOP.legalName}, trading as ${SHOP.name}</li>
        ${SHOP.address ? `<li><strong>Address:</strong> ${SHOP.address.join(', ')}</li>` : ''}
        <li><strong>Email:</strong> ${mail()}</li>
        ${SHOP.phone ? `<li><strong>Phone:</strong> <a href="${SHOP.phone.href}">${SHOP.phone.display}</a></li>` : ''}
        ${SHOP.vatId ? `<li><strong>VAT number:</strong> ${SHOP.vatId}</li>` : ''}
      </ul>

      <h2>Response times</h2>
      <p>We reply to all messages within 1–2 business days.</p>

      <h2>Order support</h2>
      <p>For the fastest help, include your order number in your email. You can track your order at any time on our <a href="/pages/track-order">Track your order</a> page — no account or password needed.</p>

      <h2>Legal notice</h2>
      <p>Full company details are in our <a href="/policies/legal-notice">Legal notice</a>.</p>
    `,
  },
  {
    handle: 'legal-notice',
    title: 'Legal Notice',
    updated: 'Last updated: September 2026',
    intro: 'The company behind Fast Sneakers.',
    body: `
      <p>${SHOP.name} is an online store operated by ${SHOP.legalName}.</p>
      <ul>
        <li><strong>Business name:</strong> ${SHOP.legalName}</li>
        <li><strong>Trade name:</strong> ${SHOP.name}</li>
        ${SHOP.owner ? `<li><strong>Owner:</strong> ${SHOP.owner}</li>` : ''}
        ${SHOP.address ? `<li><strong>Registered address:</strong> ${SHOP.address.join(', ')}</li>` : ''}
        <li><strong>Email:</strong> ${mail()}</li>
        ${SHOP.phone ? `<li><strong>Phone:</strong> <a href="${SHOP.phone.href}">${SHOP.phone.display}</a></li>` : ''}
        ${SHOP.registrationId ? `<li><strong>Company registration:</strong> ${SHOP.registrationId}</li>` : ''}
        ${SHOP.vatId ? `<li><strong>VAT number:</strong> ${SHOP.vatId}</li>` : ''}
        <li><strong>Website:</strong> fastsneaker.com</li>
      </ul>
      <p>${SHOP.name} is an independent retailer and is not affiliated with or endorsed by the brands it sells. Brand names and trademarks belong to their respective owners.</p>
      <p>Complaints can be sent to ${mail()}. Consumers in Belgium can also contact the Consumer Mediation Service (<a href="https://mediationconsommateur.be" rel="noopener">mediationconsommateur.be</a>).</p>
    `,
  },
];

export function getPolicy(handle: string): PolicyEntry | undefined {
  return POLICIES.find((policy) => policy.handle === handle);
}

interface PolicyTranslation {
  title?: string;
  intro: string;
  /** Trusted HTML, same shape as `PolicyEntry.body`. */
  body: string;
}

/** Non-English content for each policy, keyed by handle then language. */
export const POLICY_TRANSLATIONS: Record<
  string,
  Partial<Record<TranslatedLanguage, PolicyTranslation>>
> = {
  'contact-information': {
    DE: {
      title: 'Kontaktinformationen',
      intro: 'So erreichst du uns und wann du mit einer Antwort rechnen kannst.',
      body: `
        <p>Hast du eine Frage zu deiner Bestellung, einem Produkt oder etwas anderem? Wir helfen dir gerne weiter.</p>

        <h2>Kontakt aufnehmen</h2>
        <ul>
          <li><strong>E-Mail:</strong> ${mail()}</li>
          <li><strong>Shop:</strong> ${SHOP.name}</li>
        </ul>

        <h2>Impressum</h2>
        <ul>
          ${companyIdentityDE}
        </ul>

        <h2>Antwortzeiten</h2>
        <p>Wir beantworten alle Anfragen in der Regel innerhalb von 1–2 Werktagen. In stark frequentierten Zeiten und an Feiertagen kann es etwas länger dauern.</p>

        <h2>Support zu deiner Bestellung</h2>
        <p>Für die schnellste Hilfe bei einer bestehenden Bestellung gib bitte deine Bestellnummer in deiner Nachricht an. Du kannst deine Bestellung außerdem jederzeit unter <a href="/pages/track-order">Bestellung verfolgen</a> nachverfolgen — ganz ohne Konto oder Passwort.</p>
      `,
    },
    FR: {
      title: 'Coordonnées',
      intro: 'Comment nous joindre et sous quel délai vous recevrez une réponse.',
      body: `
        <p>Une question sur votre commande, un produit ou autre chose ? Nous sommes là pour vous aider.</p>

        <h2>Nous contacter</h2>
        <ul>
          <li><strong>E-mail :</strong> ${mail()}</li>
          <li><strong>Boutique :</strong> ${SHOP.name}</li>
        </ul>

        <h2>Mentions légales</h2>
        <ul>
          ${companyIdentityFR}
        </ul>

        <h2>Délais de réponse</h2>
        <p>Nous répondons à toutes les demandes sous 1 à 2 jours ouvrés. Ce délai peut être légèrement plus long en période de forte activité ou pendant les jours fériés.</p>

        <h2>Assistance pour une commande</h2>
        <p>Pour une aide plus rapide concernant une commande existante, merci d'indiquer votre numéro de commande dans votre message. Vous pouvez aussi suivre votre commande à tout moment sur <a href="/pages/track-order">Suivre ma commande</a> — sans compte ni mot de passe.</p>
      `,
    },
    ES: {
      title: 'Información de contacto',
      intro: 'Cómo ponerte en contacto con nosotros y cuándo esperar respuesta.',
      body: `
        <p>¿Tienes alguna pregunta sobre tu pedido, un producto o cualquier otra cosa? Estaremos encantados de ayudarte.</p>

        <h2>Ponte en contacto</h2>
        <ul>
          <li><strong>Correo electrónico:</strong> ${mail()}</li>
          <li><strong>Tienda:</strong> ${SHOP.name}</li>
        </ul>

        <h2>Aviso legal</h2>
        <ul>
          ${companyIdentityES}
        </ul>

        <h2>Tiempos de respuesta</h2>
        <p>Intentamos responder a todas las consultas en un plazo de 1 a 2 días laborables. La respuesta puede tardar un poco más durante periodos de mucha actividad o festivos.</p>

        <h2>Ayuda con tu pedido</h2>
        <p>Para recibir ayuda más rápido sobre un pedido existente, incluye tu número de pedido en el mensaje. También puedes seguir tu pedido en cualquier momento en <a href="/pages/track-order">Seguir mi pedido</a>, sin necesidad de cuenta ni contraseña.</p>
      `,
    },
    IT: {
      title: 'Informazioni di contatto',
      intro: 'Come contattarci e quando aspettarti una risposta.',
      body: `
        <p>Hai una domanda sul tuo ordine, su un prodotto o su qualsiasi altra cosa? Siamo felici di aiutarti.</p>

        <h2>Contattaci</h2>
        <ul>
          <li><strong>Email:</strong> ${mail()}</li>
          <li><strong>Negozio:</strong> ${SHOP.name}</li>
        </ul>

        <h2>Note legali</h2>
        <ul>
          ${companyIdentityIT}
        </ul>

        <h2>Tempi di risposta</h2>
        <p>Cerchiamo di rispondere a tutte le richieste entro 1-2 giorni lavorativi. Nei periodi di maggiore affluenza o durante le festività la risposta potrebbe richiedere un po' più di tempo.</p>

        <h2>Assistenza per un ordine</h2>
        <p>Per un aiuto più rapido su un ordine esistente, includi il numero d'ordine nel messaggio. Puoi anche tracciare il tuo ordine in qualsiasi momento su <a href="/pages/track-order">Traccia il mio ordine</a>, senza bisogno di account o password.</p>
      `,
    },
    SV: {
      title: 'Kontaktinformation',
      intro: 'Så når du oss och när du kan förvänta dig svar.',
      body: `
        <p>Har du en fråga om din beställning, en produkt eller något annat? Vi hjälper dig gärna.</p>

        <h2>Kontakta oss</h2>
        <ul>
          <li><strong>E-post:</strong> ${mail()}</li>
          <li><strong>Butik:</strong> ${SHOP.name}</li>
        </ul>

        <h2>Juridisk information</h2>
        <ul>
          ${companyIdentitySV}
        </ul>

        <h2>Svarstider</h2>
        <p>Vi strävar efter att svara på alla förfrågningar inom 1–2 arbetsdagar. Under perioder med hög belastning eller helgdagar kan det ta något längre tid.</p>

        <h2>Hjälp med en beställning</h2>
        <p>För snabbast hjälp med en befintlig beställning, ange ditt ordernummer i meddelandet. Du kan även spåra din beställning när som helst via <a href="/pages/track-order">Spåra min order</a> — utan konto eller lösenord.</p>
      `,
    },
    TR: {
      title: 'İletişim Bilgileri',
      intro: 'Bize nasıl ulaşacağınız ve yanıt süresi.',
      body: `
        <p>Siparişiniz, bir ürün veya başka bir konuda sorunuz mu var? Size yardımcı olmaktan memnuniyet duyarız.</p>

        <h2>Bize ulaşın</h2>
        <ul>
          <li><strong>E-posta:</strong> ${mail()}</li>
          <li><strong>Mağaza:</strong> ${SHOP.name}</li>
        </ul>

        <h2>Yasal bildirim</h2>
        <ul>
          ${companyIdentityTR}
        </ul>

        <h2>Yanıt süreleri</h2>
        <p>Tüm taleplere 1-2 iş günü içinde yanıt vermeyi hedefliyoruz. Yoğun dönemlerde ve tatillerde yanıt süresi biraz daha uzayabilir.</p>

        <h2>Sipariş desteği</h2>
        <p>Mevcut bir siparişle ilgili en hızlı yardım için lütfen mesajınıza sipariş numaranızı ekleyin. Ayrıca siparişinizi hesap veya şifre gerekmeden istediğiniz zaman <a href="/pages/track-order">Siparişimi takip et</a> üzerinden takip edebilirsiniz.</p>
      `,
    },
  },
  'shipping-policy': {
    DE: {
      title: 'Versandrichtlinie',
      intro: 'Bearbeitungszeiten, Lieferschätzungen und Sendungsverfolgung.',
      body: `
        <p>Hier findest du alles, was du über den Versand deiner ${SHOP.name}-Bestellung wissen musst.</p>

        <h2>Bearbeitungszeit</h2>
        <p>Bestellungen werden innerhalb von 1–3 Werktagen nach Zahlungseingang bearbeitet und versendet. In stark frequentierten Zeiten kann die Bearbeitung länger dauern.</p>

        <h2>Versandart &amp; Kosten</h2>
        <p>Wir bieten derzeit für alle Bestellungen einen nachverfolgbaren Standardversand an. <strong>Der Versand ist für jede Bestellung an jedes von uns belieferte Ziel kostenlos.</strong> Es gibt keinen Mindestbestellwert.</p>
        <p>Alle Bestellungen werden in stabiler Schutzverpackung versendet — Sneaker reisen in einem äußeren Karton, sodass der Schuhkarton in Sammlerzustand ankommt.</p>

        <h2>Lieferzeit</h2>
        <p>Die geschätzte Lieferzeit hängt von der Lieferadresse ab (berechnet ab dem Zeitpunkt, an dem das Paket von uns versendet wird).</p>

        <h2>Internationaler Versand</h2>
        <p>Wir bieten internationalen Versand an. Die geschätzte Lieferzeit für internationale Bestellungen beträgt 5–15 Werktage. Die tatsächliche Lieferzeit kann abweichen und unterliegt den Zollbestimmungen.</p>

        <h2>Sendungsverfolgung</h2>
        <p>Sobald deine Bestellung versendet wurde, erhältst du eine E-Mail mit Versandbestätigung und Sendungsnummer, mit der du deine Bestellung verfolgen kannst. In manchen Ländern ist dies eventuell nicht möglich — in diesem Fall stellen wir dir einen Versandnachweis zur Verfügung.</p>

        <h2>Verspätete oder verlorene Bestellungen</h2>
        <p>Wenn sich deine Bestellung verzögert oder nicht angekommen ist, kontaktiere uns bitte unter ${mail()}, damit wir das Problem verfolgen und lösen können.</p>

        <h2>Steuern und Zollgebühren</h2>
        <p>Es liegt in der Verantwortung des Käufers, alle geltenden Einfuhrabgaben, Steuern und Zollgebühren für internationale Sendungen zu begleichen. Die Preise verstehen sich ohne MwSt. Weitere Details findest du in unseren Nutzungsbedingungen.</p>

        <h2>Adressangaben</h2>
        <p>Bitte gib beim Checkout die korrekte Lieferadresse an. Wir übernehmen keine Verantwortung für Verzögerungen oder zurückgesendete Pakete aufgrund fehlerhafter Adressangaben.</p>

        <h2>Kundenservice</h2>
        <p>Bei Fragen oder wenn du weitere Unterstützung benötigst, kontaktiere uns unter ${mail()}. Weitere Informationen findest du in unseren Nutzungsbedingungen.</p>
        <p>Mit einem Klick auf „Zur Zahlung“ akzeptierst du unsere Versandrichtlinie.</p>
      `,
    },
    FR: {
      title: 'Politique de livraison',
      intro: 'Délais de traitement, estimations de livraison et suivi.',
      body: `
        <p>Voici tout ce que vous devez savoir sur l'expédition de votre commande ${SHOP.name}.</p>

        <h2>Délai de traitement</h2>
        <p>Les commandes sont traitées et expédiées sous 1 à 3 jours ouvrés après réception du paiement. Ce délai peut être plus long en période de forte affluence.</p>

        <h2>Méthode et frais de livraison</h2>
        <p>Nous proposons actuellement une livraison standard suivie pour toutes les commandes. <strong>La livraison est offerte sur chaque commande, vers chaque destination que nous desservons.</strong> Aucun montant minimum de commande n'est requis.</p>
        <p>Toutes les commandes sont expédiées dans un emballage solide et protecteur — les sneakers voyagent dans un carton extérieur afin que la boîte à chaussures arrive en parfait état.</p>

        <h2>Délai de livraison</h2>
        <p>Les délais de livraison estimés varient selon l'adresse de livraison (calculés à partir du moment où le colis est expédié depuis chez nous).</p>

        <h2>Livraison internationale</h2>
        <p>Nous proposons la livraison internationale. Le délai estimé pour les commandes internationales est de 5 à 15 jours ouvrés. Les délais réels peuvent varier et dépendent des réglementations douanières.</p>

        <h2>Suivi de commande</h2>
        <p>Une fois votre commande expédiée, vous recevrez un e-mail de confirmation d'expédition avec un numéro de suivi. Cela peut ne pas s'appliquer à certains pays, mais nous vous fournirons une preuve d'expédition.</p>

        <h2>Commandes retardées ou perdues</h2>
        <p>Si votre commande est retardée ou non reçue, veuillez nous contacter à ${mail()} afin que nous puissions vous aider à la suivre et résoudre le problème.</p>

        <h2>Taxes et droits de douane</h2>
        <p>Il est de la responsabilité de l'acheteur de se conformer à tous les droits d'importation, taxes et frais de douane applicables aux envois internationaux. Les prix s'entendent hors TVA. Consultez nos Conditions Générales pour plus de détails.</p>

        <h2>Informations d'adresse</h2>
        <p>Veuillez vous assurer de saisir la bonne adresse de livraison lors du paiement. Nous ne sommes pas responsables des retards ou des colis retournés en raison d'une adresse incorrecte.</p>

        <h2>Service client</h2>
        <p>Pour toute question ou assistance supplémentaire, contactez-nous à ${mail()}. Consultez nos Conditions Générales pour plus d'informations.</p>
        <p>En cliquant sur « Procéder au paiement », vous acceptez notre politique de livraison.</p>
      `,
    },
    ES: {
      title: 'Política de envío',
      intro: 'Plazos de preparación, estimaciones de entrega y seguimiento.',
      body: `
        <p>Aquí tienes todo lo que necesitas saber sobre cómo y cuándo se envía tu pedido de ${SHOP.name}.</p>

        <h2>Tiempo de preparación</h2>
        <p>Los pedidos se procesan y envían en un plazo de 1 a 3 días laborables tras recibir el pago. Este plazo puede ser mayor en periodos de mucha actividad.</p>

        <h2>Método y costes de envío</h2>
        <p>Actualmente ofrecemos envío estándar con seguimiento para todos los pedidos. <strong>El envío es gratuito en todos los pedidos, a todos los destinos a los que enviamos.</strong> No se aplica un importe mínimo de pedido.</p>
        <p>Todos los pedidos se envían en un embalaje resistente y protector: las zapatillas viajan dentro de una caja exterior para que la caja original llegue en condiciones de coleccionista.</p>

        <h2>Tiempo de entrega</h2>
        <p>Los tiempos de entrega estimados varían según la dirección de entrega (se calculan desde el momento en que el paquete sale de nuestras instalaciones).</p>

        <h2>Envíos internacionales</h2>
        <p>Ofrecemos envío internacional. El plazo estimado de entrega para pedidos internacionales es de 5 a 15 días laborables. Los tiempos reales pueden variar y están sujetos a la normativa aduanera.</p>

        <h2>Seguimiento del pedido</h2>
        <p>Una vez que tu pedido haya sido enviado, recibirás un correo electrónico con la confirmación de envío y el número de seguimiento para poder rastrearlo. Esto puede no aplicarse a algunos países, pero te proporcionaremos una prueba de envío.</p>

        <h2>Pedidos retrasados o perdidos</h2>
        <p>Si tu pedido se retrasa o no lo recibes, ponte en contacto con nosotros en ${mail()} para que podamos ayudarte a localizarlo y resolver el problema.</p>

        <h2>Impuestos y aranceles aduaneros</h2>
        <p>Es responsabilidad del comprador cumplir con todos los aranceles de importación, impuestos y tasas aduaneras aplicables a los envíos internacionales. Los precios no incluyen IVA. Consulta nuestras Condiciones de Servicio para más detalles.</p>

        <h2>Datos de dirección</h2>
        <p>Asegúrate de introducir la dirección de entrega correcta al finalizar la compra. No nos hacemos responsables de retrasos o paquetes devueltos por datos de dirección incorrectos.</p>

        <h2>Atención al cliente</h2>
        <p>Si tienes preguntas o necesitas ayuda adicional, contáctanos en ${mail()}. Consulta nuestras Condiciones de Servicio para más información.</p>
        <p>Al hacer clic en «Proceder al pago», aceptas nuestra Política de envío.</p>
      `,
    },
    IT: {
      title: 'Politica di spedizione',
      intro: 'Tempi di elaborazione, stime di consegna e tracciamento.',
      body: `
        <p>Ecco tutto ciò che devi sapere su come e quando viene spedito il tuo ordine ${SHOP.name}.</p>

        <h2>Tempi di elaborazione</h2>
        <p>Gli ordini vengono elaborati e spediti entro 1-3 giorni lavorativi dal ricevimento del pagamento. I tempi di elaborazione potrebbero essere più lunghi nei periodi di maggiore affluenza.</p>

        <h2>Metodo e costi di spedizione</h2>
        <p>Attualmente offriamo spedizione standard tracciata per tutti gli ordini. <strong>La spedizione è gratuita su ogni ordine, verso ogni destinazione che serviamo.</strong> Non è previsto un valore minimo d'ordine.</p>
        <p>Tutti gli ordini vengono spediti in un imballaggio robusto e protettivo: le sneaker viaggiano in un cartone esterno affinché la scatola originale arrivi in condizioni da collezione.</p>

        <h2>Tempi di consegna</h2>
        <p>I tempi di consegna stimati variano in base all'indirizzo di consegna (calcolati dal momento in cui il pacco viene spedito da noi).</p>

        <h2>Spedizioni internazionali</h2>
        <p>Offriamo spedizioni internazionali. La consegna stimata per gli ordini internazionali è di 5-15 giorni lavorativi. I tempi effettivi possono variare e sono soggetti alle normative doganali.</p>

        <h2>Tracciamento dell'ordine</h2>
        <p>Una volta spedito il tuo ordine, riceverai un'email con la conferma di spedizione e il numero di tracciamento per seguirlo. Questo potrebbe non essere disponibile in alcuni paesi, ma ti forniremo comunque una prova di spedizione.</p>

        <h2>Ordini in ritardo o smarriti</h2>
        <p>Se il tuo ordine è in ritardo o non è stato ricevuto, contattaci a ${mail()} così da poterti aiutare a rintracciarlo e risolvere il problema.</p>

        <h2>Tasse e dazi doganali</h2>
        <p>È responsabilità dell'acquirente rispettare tutti i dazi d'importazione, le tasse e gli oneri doganali applicabili alle spedizioni internazionali. I prezzi non includono l'IVA. Consulta i nostri Termini di Servizio per i dettagli completi.</p>

        <h2>Informazioni sull'indirizzo</h2>
        <p>Assicurati di inserire l'indirizzo di consegna corretto al momento del pagamento. Non siamo responsabili di ritardi o pacchi restituiti a causa di informazioni sull'indirizzo errate.</p>

        <h2>Assistenza clienti</h2>
        <p>Per qualsiasi domanda o ulteriore assistenza, contattaci a ${mail()}. Consulta i nostri Termini di Servizio per maggiori informazioni.</p>
        <p>Cliccando su "Procedi al pagamento" accetti la nostra Politica di spedizione.</p>
      `,
    },
    SV: {
      title: 'Fraktpolicy',
      intro: 'Handläggningstider, leveransuppskattningar och spårning.',
      body: `
        <p>Här är allt du behöver veta om hur och när din ${SHOP.name}-beställning skickas.</p>

        <h2>Handläggningstid</h2>
        <p>Beställningar behandlas och skickas inom 1–3 arbetsdagar efter mottagen betalning. Handläggningstiden kan vara längre under perioder med hög belastning.</p>

        <h2>Fraktmetod och kostnader</h2>
        <p>Vi erbjuder för närvarande spårbar standardfrakt på alla beställningar. <strong>Frakten är gratis på varje beställning, till varje destination vi levererar till.</strong> Inget minsta ordervärde gäller.</p>
        <p>Alla beställningar skickas i stabil, skyddande förpackning — sneakers reser i en ytterkartong så att skokartongen anländer i samlarskick.</p>

        <h2>Leveranstid</h2>
        <p>Uppskattade leveranstider varierar beroende på leveransadress (beräknat från den tidpunkt då paketet skickas från oss).</p>

        <h2>Internationell frakt</h2>
        <p>Vi erbjuder internationell frakt. Uppskattad leveranstid för internationella beställningar är 5–15 arbetsdagar. Faktiska leveranstider kan variera och styrs av tullbestämmelser.</p>

        <h2>Spåra din beställning</h2>
        <p>När din beställning har skickats får du ett e-postmeddelande med en fraktbekräftelse och ett spårningsnummer så att du kan följa din beställning. Detta kanske inte gäller alla länder, men vi tillhandahåller alltid ett bevis på leverans.</p>

        <h2>Försenade eller förlorade beställningar</h2>
        <p>Om din beställning är försenad eller inte har kommit fram, kontakta oss på ${mail()} så hjälper vi dig att spåra och lösa problemet.</p>

        <h2>Skatter och tullavgifter</h2>
        <p>Det är köparens ansvar att uppfylla alla tillämpliga importavgifter, skatter och tullavgifter för internationella leveranser. Priserna exkluderar moms. Se våra användarvillkor för fullständiga detaljer.</p>

        <h2>Adressuppgifter</h2>
        <p>Se till att ange rätt leveransadress i kassan. Vi ansvarar inte för förseningar eller returnerade paket på grund av felaktiga adressuppgifter.</p>

        <h2>Kundtjänst</h2>
        <p>Vid frågor eller om du behöver ytterligare hjälp, kontakta oss på ${mail()}. Se våra användarvillkor för mer information.</p>
        <p>Genom att klicka på "Fortsätt till betalning" godkänner du vår fraktpolicy.</p>
      `,
    },
    TR: {
      title: 'Kargo Politikası',
      intro: 'Hazırlık süreleri, teslimat tahminleri ve takip.',
      body: `
        <p>${SHOP.name} siparişinizin nasıl ve ne zaman kargoya verildiğine dair bilmeniz gereken her şey burada.</p>

        <h2>Hazırlık süresi</h2>
        <p>Siparişler, ödeme alındıktan sonra 1-3 iş günü içinde hazırlanıp kargoya verilir. Yoğun dönemlerde hazırlık süresi daha uzun olabilir.</p>

        <h2>Kargo yöntemi ve ücretleri</h2>
        <p>Şu anda tüm siparişler için takip edilebilir standart kargo hizmeti sunuyoruz. <strong>Teslimat yaptığımız her adrese, her siparişte kargo ücretsizdir.</strong> Minimum sipariş tutarı uygulanmaz.</p>
        <p>Tüm siparişler sağlam, koruyucu ambalajlarla gönderilir — spor ayakkabılar dış bir karton içinde seyahat eder, böylece kutu koleksiyonluk durumda ulaşır.</p>

        <h2>Teslimat süresi</h2>
        <p>Tahmini teslimat süreleri teslimat adresine göre değişir (paketin bizden kargoya verildiği andan itibaren hesaplanır).</p>

        <h2>Uluslararası kargo</h2>
        <p>Uluslararası kargo hizmeti sunuyoruz. Uluslararası siparişler için tahmini teslimat süresi 5-15 iş günüdür. Gerçek teslimat süreleri değişebilir ve gümrük mevzuatına tabidir.</p>

        <h2>Sipariş takibi</h2>
        <p>Siparişiniz kargoya verildiğinde, siparişinizi takip edebilmeniz için kargo onayı ve takip numarası içeren bir e-posta alacaksınız. Bu, bazı ülkeler için geçerli olmayabilir; bu durumda size bir gönderi kanıtı sağlarız.</p>

        <h2>Gecikmiş veya kayıp siparişler</h2>
        <p>Siparişiniz gecikirse veya elinize ulaşmazsa, takip edip sorunu çözebilmemiz için lütfen ${mail()} adresinden bizimle iletişime geçin.</p>

        <h2>Vergiler ve gümrük vergileri</h2>
        <p>Uluslararası gönderiler için geçerli tüm ithalat vergilerine, resimlere ve gümrük ücretlerine uymak alıcının sorumluluğundadır. Fiyatlara KDV dahil değildir. Ayrıntılar için Hizmet Şartlarımıza bakın.</p>

        <h2>Adres bilgileri</h2>
        <p>Lütfen ödeme sırasında doğru teslimat adresini girdiğinizden emin olun. Hatalı adres bilgileri nedeniyle oluşan gecikme veya iade edilen paketlerden sorumlu değiliz.</p>

        <h2>Müşteri hizmetleri</h2>
        <p>Sorularınız veya ek yardıma ihtiyacınız için ${mail()} adresinden bize ulaşın. Daha fazla bilgi için Hizmet Şartlarımıza bakın.</p>
        <p>"Ödemeye Geç" seçeneğine tıklayarak Kargo Politikamızı kabul etmiş olursunuz.</p>
      `,
    },
  },
  'privacy-policy': {
    DE: {
      title: 'Datenschutzrichtlinie',
      intro: 'Wie wir deine persönlichen Daten erheben, nutzen und schützen.',
      body: `
        <p><strong>Übersicht der Services.</strong> ${SHOP.name} betreibt den Shop und die Website einschließlich aller zugehörigen Tools, Produkte und Dienste, um ein kuratiertes Einkaufserlebnis zu bieten („Services“). Shopify betreibt die Website und die Services technisch. Diese Datenschutzrichtlinie erklärt, wie ${SHOP.name} deine personenbezogenen Daten erhebt, verwendet und offenlegt. Bei einem Widerspruch zu den Nutzungsbedingungen hat diese Datenschutzrichtlinie im Hinblick auf die Verarbeitung personenbezogener Daten Vorrang.</p>

        <h2>Personenbezogene Daten, die wir erheben</h2>
        <p>„Personenbezogene Daten“ sind Daten, mit denen du direkt oder indirekt identifiziert werden kannst. Beispiele:</p>
        <ul>
          <li><strong>Kontaktdaten:</strong> Name, Adresse, Telefonnummer, E-Mail.</li>
          <li><strong>Finanzinformationen:</strong> Zahlungskartennummern, Kontoinformationen, Transaktionen.</li>
          <li><strong>Kontoinformationen:</strong> Benutzername, Passwort, Präferenzen.</li>
          <li><strong>Transaktionsinformationen:</strong> Bestellungen, Rücksendungen, Wunschliste, Browserverlauf.</li>
          <li><strong>Kommunikation:</strong> E-Mails oder Nachrichten an den Kundenservice.</li>
          <li><strong>Geräte- &amp; Nutzungsdaten:</strong> IP-Adresse, Browserinformationen, Interaktion mit der Website.</li>
        </ul>

        <h3>Datenquellen</h3>
        <ul>
          <li><strong>Direkt von dir</strong> — Kontoerstellung, Kauf, Nachrichten.</li>
          <li><strong>Automatisch über die Website</strong> — Cookies, Tracking-Tools.</li>
          <li><strong>Von Dienstleistern</strong> — Zahlungsanbieter, IT-Dienste.</li>
          <li><strong>Von Partnern oder Dritten.</strong></li>
        </ul>

        <h2>Wie deine Daten genutzt werden</h2>
        <p>${SHOP.name} nutzt deine Daten, um:</p>
        <ul>
          <li><strong>Services bereitzustellen &amp; zu verbessern:</strong> Zahlungen abzuwickeln, Bestellungen zu erfüllen, Konten zu verwalten und dein Einkaufserlebnis zu personalisieren.</li>
          <li><strong>Marketing &amp; Werbung:</strong> Aktionen, E-Mails und Online-Werbung basierend auf deiner Aktivität zu versenden.</li>
          <li><strong>Sicherheit &amp; Betrugsprävention:</strong> Konten zu sichern, Betrug zu erkennen, Nutzer zu schützen.</li>
          <li><strong>Kommunikation:</strong> Kundensupport und Kontoaktualisierungen.</li>
          <li><strong>Rechtliche Compliance:</strong> auf rechtliche Anfragen zu reagieren, Richtlinien durchzusetzen oder Rechte zu schützen.</li>
        </ul>

        <h2>Weitergabe von Daten</h2>
        <p>Deine Daten können weitergegeben werden an:</p>
        <ul>
          <li><strong>Shopify und andere Anbieter</strong>, die IT-, Zahlungs-, Erfüllungs- oder Analysedienste erbringen.</li>
          <li><strong>Marketingpartner</strong> für personalisierte Werbung.</li>
          <li><strong>Konzerngesellschaften</strong> innerhalb der Unternehmensgruppe.</li>
          <li>Im Rahmen von <strong>Unternehmenstransaktionen, rechtlichen Verfahren</strong> oder zur Durchsetzung von Richtlinien.</li>
        </ul>
        <p><strong>Die Rolle von Shopify.</strong> Shopify hostet die Website, erhebt bestimmte Daten und stellt erweiterte Funktionen bereit. Mehr dazu in der <a href="https://www.shopify.com/legal/privacy" target="_blank" rel="noopener noreferrer">Shopify-Datenschutzrichtlinie</a>.</p>

        <h2>Links zu Drittanbietern</h2>
        <p>${SHOP.name} kann auf andere Websites verlinken. Wir sind nicht für deren Datenschutzpraktiken verantwortlich. Bitte prüfe stets die Richtlinien Dritter.</p>

        <h2>Daten von Kindern</h2>
        <p>Die Website richtet sich nicht an Kinder, und ${SHOP.name} erhebt wissentlich keine Daten von Kindern unter dem Volljährigkeitsalter. Eltern können die Löschung solcher Daten beantragen.</p>

        <h2>Sicherheit &amp; Datenspeicherung</h2>
        <p>Obwohl Sicherheitsmaßnahmen bestehen, kann absolute Sicherheit nicht garantiert werden. Die Speicherdauer richtet sich nach Zweck, gesetzlichen Vorgaben oder betrieblichen Erfordernissen.</p>

        <h2>Deine Rechte</h2>
        <p>Je nach Wohnort hast du unter Umständen das Recht auf:</p>
        <ul>
          <li><strong>Zugang, Löschung oder Berichtigung</strong> deiner Daten.</li>
          <li><strong>Erhalt oder Übertragung</strong> deiner Daten (Datenübertragbarkeit).</li>
          <li><strong>Einschränkung oder Widerspruch</strong> gegen die Verarbeitung.</li>
          <li><strong>Widerruf der Einwilligung</strong>, sofern zutreffend.</li>
          <li><strong>Verwaltung von Marketingkommunikation.</strong></li>
        </ul>
        <p>Personen aus dem Vereinigten Königreich/EWR können zusätzliche Rechte haben. Anfragen können über die Kontaktmöglichkeiten der Website gestellt werden.</p>

        <h2>Internationale Übermittlungen</h2>
        <p>Deine Daten können außerhalb deines Landes verarbeitet werden. Übermittlungen aus dem EWR/UK stützen sich auf rechtliche Garantien wie Standardvertragsklauseln.</p>

        <h2>Aktualisierungen der Richtlinie</h2>
        <p>${SHOP.name} kann diese Datenschutzrichtlinie aktualisieren, um Änderungen der Praxis, gesetzlicher Vorgaben oder betrieblicher Erfordernisse widerzuspiegeln. Aktualisierungen werden mit einem geänderten Datum „Zuletzt aktualisiert“ veröffentlicht.</p>

        <h2>Kontakt</h2>
        <p>Fragen zum Datenschutz? Schreib uns an ${mail()}.</p>
      `,
    },
    FR: {
      title: 'Politique de confidentialité',
      intro: 'Comment nous collectons, utilisons et protégeons vos données personnelles.',
      body: `
        <p><strong>Aperçu des services.</strong> ${SHOP.name} exploite la boutique et le site web, y compris tous les outils, produits et services associés, afin de proposer une expérience d'achat sélectionnée (les « Services »). Shopify héberge techniquement le site et les Services. Cette politique de confidentialité explique comment ${SHOP.name} collecte, utilise et divulgue vos données personnelles. En cas de conflit avec les Conditions Générales, cette politique de confidentialité prévaut pour le traitement des données personnelles.</p>

        <h2>Données personnelles que nous collectons</h2>
        <p>Les « données personnelles » désignent toute donnée permettant de vous identifier directement ou indirectement. Exemples :</p>
        <ul>
          <li><strong>Coordonnées :</strong> nom, adresse, téléphone, e-mail.</li>
          <li><strong>Informations financières :</strong> numéros de carte de paiement, informations de compte, transactions.</li>
          <li><strong>Informations de compte :</strong> nom d'utilisateur, mot de passe, préférences.</li>
          <li><strong>Informations de transaction :</strong> commandes, retours, liste de souhaits, historique de navigation.</li>
          <li><strong>Communications :</strong> e-mails ou messages au service client.</li>
          <li><strong>Informations sur l'appareil et l'utilisation :</strong> adresse IP, informations du navigateur, interaction avec le site.</li>
        </ul>

        <h3>Sources des données</h3>
        <ul>
          <li><strong>Directement auprès de vous</strong> — création de compte, achat, messages.</li>
          <li><strong>Automatiquement via le site web</strong> — cookies, outils de suivi.</li>
          <li><strong>Auprès de prestataires de services</strong> — processeurs de paiement, services informatiques.</li>
          <li><strong>Auprès de partenaires ou tiers.</strong></li>
        </ul>

        <h2>Comment vos données sont utilisées</h2>
        <p>${SHOP.name} utilise vos données pour :</p>
        <ul>
          <li><strong>Fournir et améliorer les Services :</strong> traiter les paiements, exécuter les commandes, gérer les comptes, personnaliser votre expérience d'achat.</li>
          <li><strong>Marketing et publicité :</strong> envoyer des promotions, e-mails et publicités en ligne selon votre activité.</li>
          <li><strong>Sécurité et prévention de la fraude :</strong> sécuriser les comptes, détecter la fraude, protéger les utilisateurs.</li>
          <li><strong>Communication :</strong> support client et mises à jour de compte.</li>
          <li><strong>Conformité légale :</strong> répondre aux demandes légales, faire respecter les politiques ou protéger nos droits.</li>
        </ul>

        <h2>Partage des données</h2>
        <p>Vos informations peuvent être partagées avec :</p>
        <ul>
          <li><strong>Shopify et d'autres prestataires</strong> fournissant des services informatiques, de paiement, d'exécution ou d'analyse.</li>
          <li><strong>Des partenaires marketing</strong> pour des publicités personnalisées.</li>
          <li><strong>Des filiales</strong> au sein du groupe.</li>
          <li>Dans le cadre de <strong>transactions commerciales, de procédures judiciaires</strong> ou pour faire respecter nos politiques.</li>
        </ul>
        <p><strong>Le rôle de Shopify.</strong> Shopify héberge le site web, collecte certaines données et fournit des fonctionnalités avancées. En savoir plus dans la <a href="https://www.shopify.com/legal/privacy" target="_blank" rel="noopener noreferrer">politique de confidentialité de Shopify</a>.</p>

        <h2>Liens vers des tiers</h2>
        <p>${SHOP.name} peut renvoyer vers d'autres sites. Nous ne sommes pas responsables de leurs pratiques en matière de confidentialité. Consultez toujours les politiques des tiers.</p>

        <h2>Données des enfants</h2>
        <p>Le site n'est pas destiné aux enfants, et ${SHOP.name} ne collecte pas sciemment de données auprès d'enfants n'ayant pas atteint la majorité. Les parents peuvent demander la suppression de telles données.</p>

        <h2>Sécurité et conservation des données</h2>
        <p>Bien que des mesures de sécurité soient en place, une sécurité absolue ne peut être garantie. La durée de conservation dépend de la finalité, des obligations légales ou des besoins de gestion de compte.</p>

        <h2>Vos droits</h2>
        <p>Selon votre lieu de résidence, vous pouvez avoir le droit de :</p>
        <ul>
          <li><strong>Accéder, supprimer ou corriger</strong> vos données.</li>
          <li><strong>Recevoir ou transférer</strong> vos données (portabilité).</li>
          <li><strong>Restreindre ou vous opposer</strong> au traitement.</li>
          <li><strong>Retirer votre consentement</strong>, le cas échéant.</li>
          <li><strong>Gérer les communications marketing.</strong></li>
        </ul>
        <p>Les résidents du Royaume-Uni/EEE peuvent bénéficier de droits supplémentaires. Les demandes peuvent être effectuées via les options de contact du site.</p>

        <h2>Transferts internationaux</h2>
        <p>Vos données peuvent être traitées en dehors de votre pays. Les transferts depuis l'EEE/le Royaume-Uni s'appuient sur des garanties légales telles que les clauses contractuelles types.</p>

        <h2>Mises à jour de la politique</h2>
        <p>${SHOP.name} peut mettre à jour cette politique de confidentialité pour refléter des changements de pratiques, d'exigences légales ou de besoins opérationnels. Les mises à jour seront publiées avec une date de « dernière mise à jour » révisée.</p>

        <h2>Contact</h2>
        <p>Des questions sur votre confidentialité ? Écrivez-nous à ${mail()}.</p>
      `,
    },
    ES: {
      title: 'Política de privacidad',
      intro: 'Cómo recopilamos, usamos y protegemos tu información personal.',
      body: `
        <p><strong>Resumen de los servicios.</strong> ${SHOP.name} opera la tienda y el sitio web, incluidas todas las herramientas, productos y servicios relacionados, para ofrecer una experiencia de compra seleccionada (los «Servicios»). Shopify alberga técnicamente el sitio web y los Servicios. Esta Política de privacidad explica cómo ${SHOP.name} recopila, usa y divulga tu información personal. En caso de conflicto con las Condiciones de Servicio, esta Política de privacidad prevalece en cuanto al tratamiento de datos personales.</p>

        <h2>Información personal que recopilamos</h2>
        <p>«Información personal» se refiere a datos que pueden identificarte directa o indirectamente. Ejemplos:</p>
        <ul>
          <li><strong>Datos de contacto:</strong> nombre, dirección, teléfono, correo electrónico.</li>
          <li><strong>Información financiera:</strong> números de tarjeta de pago, información de cuenta, transacciones.</li>
          <li><strong>Información de cuenta:</strong> nombre de usuario, contraseña, preferencias.</li>
          <li><strong>Información de transacciones:</strong> pedidos, devoluciones, lista de deseos, historial de navegación.</li>
          <li><strong>Comunicaciones:</strong> correos o mensajes al servicio de atención al cliente.</li>
          <li><strong>Información del dispositivo y de uso:</strong> dirección IP, información del navegador, interacción con el sitio.</li>
        </ul>

        <h3>Fuentes de los datos</h3>
        <ul>
          <li><strong>Directamente de ti</strong> — creación de cuenta, compra, mensajes.</li>
          <li><strong>Automáticamente a través del sitio web</strong> — cookies, herramientas de seguimiento.</li>
          <li><strong>De proveedores de servicios</strong> — procesadores de pago, servicios de TI.</li>
          <li><strong>De socios o terceros.</strong></li>
        </ul>

        <h2>Cómo se usan tus datos</h2>
        <p>${SHOP.name} usa tus datos para:</p>
        <ul>
          <li><strong>Prestar y mejorar los Servicios:</strong> procesar pagos, gestionar pedidos, administrar cuentas y personalizar tu experiencia de compra.</li>
          <li><strong>Marketing y publicidad:</strong> enviar promociones, correos electrónicos y anuncios en línea según tu actividad.</li>
          <li><strong>Seguridad y prevención del fraude:</strong> proteger cuentas, detectar fraude, proteger a los usuarios.</li>
          <li><strong>Comunicación:</strong> atención al cliente y actualizaciones de cuenta.</li>
          <li><strong>Cumplimiento legal:</strong> responder a solicitudes legales, aplicar políticas o proteger derechos.</li>
        </ul>

        <h2>Compartir datos</h2>
        <p>Tu información puede compartirse con:</p>
        <ul>
          <li><strong>Shopify y otros proveedores</strong> que prestan servicios de TI, pago, logística o análisis.</li>
          <li><strong>Socios de marketing</strong> para anuncios personalizados.</li>
          <li><strong>Filiales</strong> dentro del grupo empresarial.</li>
          <li>Durante <strong>transacciones comerciales, procesos legales</strong>, o para hacer cumplir las políticas.</li>
        </ul>
        <p><strong>El papel de Shopify.</strong> Shopify aloja el sitio web, recopila algunos datos y ofrece funciones adicionales. Más información en la <a href="https://www.shopify.com/legal/privacy" target="_blank" rel="noopener noreferrer">Política de privacidad de Shopify</a>.</p>

        <h2>Enlaces a terceros</h2>
        <p>${SHOP.name} puede enlazar a otros sitios web. No somos responsables de sus prácticas de privacidad. Revisa siempre las políticas de terceros.</p>

        <h2>Datos de menores</h2>
        <p>El sitio no está dirigido a menores, y ${SHOP.name} no recopila conscientemente datos de menores de edad. Los padres pueden solicitar la eliminación de dichos datos.</p>

        <h2>Seguridad y conservación de datos</h2>
        <p>Aunque existen medidas de seguridad, no se puede garantizar una seguridad absoluta. El período de conservación depende de la finalidad, las obligaciones legales o las necesidades de gestión de la cuenta.</p>

        <h2>Tus derechos</h2>
        <p>Según tu ubicación, puedes tener derecho a:</p>
        <ul>
          <li><strong>Acceder, eliminar o corregir</strong> tus datos.</li>
          <li><strong>Recibir o transferir</strong> tus datos (portabilidad).</li>
          <li><strong>Restringir u oponerte</strong> al tratamiento.</li>
          <li><strong>Retirar tu consentimiento</strong>, cuando corresponda.</li>
          <li><strong>Gestionar las comunicaciones de marketing.</strong></li>
        </ul>
        <p>Los residentes del Reino Unido/EEE pueden tener derechos adicionales. Las solicitudes pueden realizarse a través de las opciones de contacto del sitio web.</p>

        <h2>Transferencias internacionales</h2>
        <p>Tus datos pueden procesarse fuera de tu país. Las transferencias desde el EEE/Reino Unido se basan en garantías legales como las Cláusulas Contractuales Tipo.</p>

        <h2>Actualizaciones de la política</h2>
        <p>${SHOP.name} puede actualizar esta Política de privacidad para reflejar cambios en las prácticas, requisitos legales o necesidades operativas. Las actualizaciones se publicarán con una fecha de «Última actualización» revisada.</p>

        <h2>Contacto</h2>
        <p>¿Tienes preguntas sobre tu privacidad? Escríbenos a ${mail()}.</p>
      `,
    },
    IT: {
      title: 'Informativa sulla privacy',
      intro: 'Come raccogliamo, utilizziamo e proteggiamo i tuoi dati personali.',
      body: `
        <p><strong>Panoramica dei servizi.</strong> ${SHOP.name} gestisce il negozio e il sito web, inclusi tutti gli strumenti, i prodotti e i servizi correlati, per offrire un'esperienza di shopping curata (i "Servizi"). Shopify ospita tecnicamente il sito web e i Servizi. Questa Informativa sulla privacy spiega come ${SHOP.name} raccoglie, utilizza e divulga i tuoi dati personali. In caso di conflitto con i Termini di Servizio, questa Informativa sulla privacy prevale per quanto riguarda il trattamento dei dati personali.</p>

        <h2>Dati personali che raccogliamo</h2>
        <p>Per "dati personali" si intendono i dati che possono identificarti direttamente o indirettamente. Esempi:</p>
        <ul>
          <li><strong>Dati di contatto:</strong> nome, indirizzo, telefono, email.</li>
          <li><strong>Informazioni finanziarie:</strong> numeri di carte di pagamento, informazioni sull'account, transazioni.</li>
          <li><strong>Informazioni sull'account:</strong> nome utente, password, preferenze.</li>
          <li><strong>Informazioni sulle transazioni:</strong> ordini, resi, lista dei desideri, cronologia di navigazione.</li>
          <li><strong>Comunicazioni:</strong> email o messaggi all'assistenza clienti.</li>
          <li><strong>Informazioni su dispositivo e utilizzo:</strong> indirizzo IP, informazioni sul browser, interazione con il sito.</li>
        </ul>

        <h3>Origine dei dati</h3>
        <ul>
          <li><strong>Direttamente da te</strong> — creazione dell'account, acquisto, messaggi.</li>
          <li><strong>Automaticamente tramite il sito web</strong> — cookie, strumenti di tracciamento.</li>
          <li><strong>Da fornitori di servizi</strong> — processori di pagamento, servizi IT.</li>
          <li><strong>Da partner o terze parti.</strong></li>
        </ul>

        <h2>Come vengono utilizzati i tuoi dati</h2>
        <p>${SHOP.name} utilizza i tuoi dati per:</p>
        <ul>
          <li><strong>Fornire e migliorare i Servizi:</strong> elaborare pagamenti, evadere ordini, gestire account, personalizzare la tua esperienza di acquisto.</li>
          <li><strong>Marketing e pubblicità:</strong> inviare promozioni, email e annunci online in base alla tua attività.</li>
          <li><strong>Sicurezza e prevenzione delle frodi:</strong> proteggere gli account, individuare frodi, tutelare gli utenti.</li>
          <li><strong>Comunicazione:</strong> assistenza clienti e aggiornamenti sull'account.</li>
          <li><strong>Conformità legale:</strong> rispondere a richieste legali, applicare le politiche o tutelare i diritti.</li>
        </ul>

        <h2>Condivisione dei dati</h2>
        <p>Le tue informazioni possono essere condivise con:</p>
        <ul>
          <li><strong>Shopify e altri fornitori</strong> che offrono servizi IT, di pagamento, logistica o analisi.</li>
          <li><strong>Partner di marketing</strong> per annunci personalizzati.</li>
          <li><strong>Società affiliate</strong> all'interno del gruppo aziendale.</li>
          <li>Nell'ambito di <strong>transazioni commerciali, procedimenti legali</strong> o per far rispettare le politiche.</li>
        </ul>
        <p><strong>Il ruolo di Shopify.</strong> Shopify ospita il sito web, raccoglie alcuni dati e fornisce funzionalità avanzate. Maggiori informazioni nell'<a href="https://www.shopify.com/legal/privacy" target="_blank" rel="noopener noreferrer">Informativa sulla privacy di Shopify</a>.</p>

        <h2>Link di terze parti</h2>
        <p>${SHOP.name} potrebbe contenere link ad altri siti web. Non siamo responsabili delle loro pratiche in materia di privacy. Consulta sempre le politiche di terze parti.</p>

        <h2>Dati dei minori</h2>
        <p>Il sito non è destinato ai minori e ${SHOP.name} non raccoglie consapevolmente dati da minori che non hanno raggiunto la maggiore età. I genitori possono richiedere la cancellazione di tali dati.</p>

        <h2>Sicurezza e conservazione dei dati</h2>
        <p>Sebbene siano in atto misure di sicurezza, non è possibile garantire una sicurezza assoluta. La conservazione dei dati dipende dalla finalità, dagli obblighi legali o dalle esigenze di gestione dell'account.</p>

        <h2>I tuoi diritti</h2>
        <p>A seconda della tua posizione, potresti avere il diritto di:</p>
        <ul>
          <li><strong>Accedere, cancellare o correggere</strong> i tuoi dati.</li>
          <li><strong>Ricevere o trasferire</strong> i tuoi dati (portabilità).</li>
          <li><strong>Limitare o opporti</strong> al trattamento.</li>
          <li><strong>Revocare il consenso</strong>, ove applicabile.</li>
          <li><strong>Gestire le comunicazioni di marketing.</strong></li>
        </ul>
        <p>I residenti nel Regno Unito/SEE potrebbero avere diritti aggiuntivi. Le richieste possono essere inoltrate tramite le opzioni di contatto del sito web.</p>

        <h2>Trasferimenti internazionali</h2>
        <p>I tuoi dati potrebbero essere trattati al di fuori del tuo paese. I trasferimenti dal SEE/Regno Unito si basano su garanzie legali come le Clausole Contrattuali Standard.</p>

        <h2>Aggiornamenti dell'informativa</h2>
        <p>${SHOP.name} potrebbe aggiornare questa Informativa sulla privacy per riflettere cambiamenti nelle pratiche, requisiti legali o esigenze operative. Gli aggiornamenti saranno pubblicati con una data di "Ultimo aggiornamento" rivista.</p>

        <h2>Contatti</h2>
        <p>Domande sulla tua privacy? Scrivici a ${mail()}.</p>
      `,
    },
    SV: {
      title: 'Integritetspolicy',
      intro: 'Hur vi samlar in, använder och skyddar din personliga information.',
      body: `
        <p><strong>Översikt av tjänsterna.</strong> ${SHOP.name} driver butiken och webbplatsen, inklusive alla relaterade verktyg, produkter och tjänster, för att erbjuda en kurerad shoppingupplevelse ("Tjänsterna"). Shopify driver webbplatsen och Tjänsterna tekniskt. Denna integritetspolicy förklarar hur ${SHOP.name} samlar in, använder och lämnar ut dina personuppgifter. Vid konflikt med användarvillkoren gäller denna integritetspolicy för hanteringen av personuppgifter.</p>

        <h2>Personuppgifter vi samlar in</h2>
        <p>"Personuppgifter" avser uppgifter som direkt eller indirekt kan identifiera dig. Exempel:</p>
        <ul>
          <li><strong>Kontaktuppgifter:</strong> namn, adress, telefon, e-post.</li>
          <li><strong>Finansiell information:</strong> betalkortsnummer, kontoinformation, transaktioner.</li>
          <li><strong>Kontoinformation:</strong> användarnamn, lösenord, preferenser.</li>
          <li><strong>Transaktionsinformation:</strong> beställningar, returer, önskelista, webbhistorik.</li>
          <li><strong>Kommunikation:</strong> e-post eller meddelanden till kundtjänsten.</li>
          <li><strong>Enhets- och användningsinformation:</strong> IP-adress, webbläsarinformation, interaktion med webbplatsen.</li>
        </ul>

        <h3>Datakällor</h3>
        <ul>
          <li><strong>Direkt från dig</strong> — kontoskapande, köp, meddelanden.</li>
          <li><strong>Automatiskt via webbplatsen</strong> — cookies, spårningsverktyg.</li>
          <li><strong>Från tjänsteleverantörer</strong> — betalningsleverantörer, IT-tjänster.</li>
          <li><strong>Från partners eller tredje part.</strong></li>
        </ul>

        <h2>Hur din data används</h2>
        <p>${SHOP.name} använder dina uppgifter för att:</p>
        <ul>
          <li><strong>Tillhandahålla och förbättra Tjänsterna:</strong> behandla betalningar, hantera beställningar, administrera konton, anpassa din shoppingupplevelse.</li>
          <li><strong>Marknadsföring och reklam:</strong> skicka erbjudanden, e-post och onlineannonser baserat på din aktivitet.</li>
          <li><strong>Säkerhet och bedrägeriprevention:</strong> skydda konton, upptäcka bedrägeri, skydda användare.</li>
          <li><strong>Kommunikation:</strong> kundsupport och kontouppdateringar.</li>
          <li><strong>Rättslig efterlevnad:</strong> besvara rättsliga förfrågningar, upprätthålla policyer eller skydda rättigheter.</li>
        </ul>

        <h2>Delning av data</h2>
        <p>Din information kan delas med:</p>
        <ul>
          <li><strong>Shopify och andra leverantörer</strong> som tillhandahåller IT-, betalnings-, logistik- eller analystjänster.</li>
          <li><strong>Marknadsföringspartners</strong> för personanpassade annonser.</li>
          <li><strong>Dotterbolag</strong> inom koncernen.</li>
          <li>Vid <strong>affärstransaktioner, rättsliga processer</strong> eller för att upprätthålla policyer.</li>
        </ul>
        <p><strong>Shopifys roll.</strong> Shopify driftar webbplatsen, samlar in viss data och tillhandahåller utökade funktioner. Läs mer i <a href="https://www.shopify.com/legal/privacy" target="_blank" rel="noopener noreferrer">Shopifys integritetspolicy</a>.</p>

        <h2>Länkar till tredje part</h2>
        <p>${SHOP.name} kan länka till andra webbplatser. Vi ansvarar inte för deras integritetspraxis. Granska alltid tredje parts policyer.</p>

        <h2>Barns uppgifter</h2>
        <p>Webbplatsen är inte avsedd för barn, och ${SHOP.name} samlar inte medvetet in uppgifter från barn under myndighetsåldern. Föräldrar kan begära radering av sådana uppgifter.</p>

        <h2>Säkerhet och datalagring</h2>
        <p>Även om säkerhetsåtgärder finns på plats kan fullständig säkerhet inte garanteras. Lagringstiden beror på syfte, rättsliga skyldigheter eller behov av kontounderhåll.</p>

        <h2>Dina rättigheter</h2>
        <p>Beroende på var du bor kan du ha rätt att:</p>
        <ul>
          <li><strong>Få tillgång till, radera eller rätta</strong> dina uppgifter.</li>
          <li><strong>Ta emot eller överföra</strong> dina uppgifter (dataportabilitet).</li>
          <li><strong>Begränsa eller invända mot</strong> behandling.</li>
          <li><strong>Återkalla samtycke</strong> där det är tillämpligt.</li>
          <li><strong>Hantera marknadsföringskommunikation.</strong></li>
        </ul>
        <p>Boende i Storbritannien/EES kan ha ytterligare rättigheter. Förfrågningar kan göras via webbplatsens kontaktalternativ.</p>

        <h2>Internationella överföringar</h2>
        <p>Dina uppgifter kan behandlas utanför ditt land. Överföringar från EES/Storbritannien bygger på rättsliga skyddsåtgärder som standardavtalsklausuler.</p>

        <h2>Uppdateringar av policyn</h2>
        <p>${SHOP.name} kan uppdatera denna integritetspolicy för att återspegla ändringar i praxis, rättsliga krav eller verksamhetsbehov. Uppdateringar publiceras med ett reviderat "Senast uppdaterad"-datum.</p>

        <h2>Kontakt</h2>
        <p>Frågor om din integritet? Maila oss på ${mail()}.</p>
      `,
    },
    TR: {
      title: 'Gizlilik Politikası',
      intro: 'Kişisel bilgilerinizi nasıl topladığımız, kullandığımız ve koruduğumuz.',
      body: `
        <p><strong>Hizmetlere genel bakış.</strong> ${SHOP.name}, seçkin bir alışveriş deneyimi sunmak amacıyla mağazayı ve web sitesini, ilgili tüm araçlar, ürünler ve hizmetler dahil olmak üzere işletir ("Hizmetler"). Web sitesi ve Hizmetler teknik olarak Shopify tarafından barındırılır. Bu Gizlilik Politikası, ${SHOP.name}'in kişisel bilgilerinizi nasıl topladığını, kullandığını ve ifşa ettiğini açıklar. Hizmet Şartları ile çelişki durumunda, kişisel veri işleme konusunda bu Gizlilik Politikası geçerlidir.</p>

        <h2>Topladığımız kişisel bilgiler</h2>
        <p>"Kişisel bilgi", sizi doğrudan veya dolaylı olarak tanımlayabilecek verileri ifade eder. Örnekler:</p>
        <ul>
          <li><strong>İletişim bilgileri:</strong> ad, adres, telefon, e-posta.</li>
          <li><strong>Mali bilgiler:</strong> ödeme kartı numaraları, hesap bilgileri, işlemler.</li>
          <li><strong>Hesap bilgileri:</strong> kullanıcı adı, şifre, tercihler.</li>
          <li><strong>İşlem bilgileri:</strong> siparişler, iadeler, istek listesi, gezinme geçmişi.</li>
          <li><strong>İletişimler:</strong> müşteri destek birimine gönderilen e-postalar veya mesajlar.</li>
          <li><strong>Cihaz ve kullanım bilgileri:</strong> IP adresi, tarayıcı bilgileri, sitedeki etkileşimler.</li>
        </ul>

        <h3>Veri kaynakları</h3>
        <ul>
          <li><strong>Doğrudan sizden</strong> — hesap oluşturma, satın alma, mesajlar.</li>
          <li><strong>Web sitesi aracılığıyla otomatik olarak</strong> — çerezler, izleme araçları.</li>
          <li><strong>Hizmet sağlayıcılardan</strong> — ödeme işlemcileri, BT hizmetleri.</li>
          <li><strong>Ortaklardan veya üçüncü taraflardan.</strong></li>
        </ul>

        <h2>Verileriniz nasıl kullanılır</h2>
        <p>${SHOP.name} verilerinizi şu amaçlarla kullanır:</p>
        <ul>
          <li><strong>Hizmetleri sağlamak ve geliştirmek:</strong> ödemeleri işlemek, siparişleri karşılamak, hesapları yönetmek, alışveriş deneyiminizi kişiselleştirmek.</li>
          <li><strong>Pazarlama ve reklam:</strong> etkinliğinize dayalı promosyonlar, e-postalar ve çevrimiçi reklamlar göndermek.</li>
          <li><strong>Güvenlik ve dolandırıcılık önleme:</strong> hesapları güvence altına almak, dolandırıcılığı tespit etmek, kullanıcıları korumak.</li>
          <li><strong>İletişim:</strong> müşteri desteği ve hesap güncellemeleri.</li>
          <li><strong>Yasal uyumluluk:</strong> yasal taleplere yanıt vermek, politikaları uygulamak veya hakları korumak.</li>
        </ul>

        <h2>Veri paylaşımı</h2>
        <p>Bilgileriniz şunlarla paylaşılabilir:</p>
        <ul>
          <li><strong>BT, ödeme, sipariş karşılama veya analiz hizmetleri sağlayan Shopify ve diğer tedarikçiler.</strong></li>
          <li><strong>Kişiselleştirilmiş reklamlar için pazarlama ortakları.</strong></li>
          <li><strong>Şirketler grubu içindeki bağlı kuruluşlar.</strong></li>
          <li><strong>İş işlemleri, yasal süreçler</strong> sırasında veya politikaların uygulanması amacıyla.</li>
        </ul>
        <p><strong>Shopify'ın rolü.</strong> Shopify web sitesini barındırır, bazı verileri toplar ve gelişmiş özellikler sunar. Daha fazla bilgi için <a href="https://www.shopify.com/legal/privacy" target="_blank" rel="noopener noreferrer">Shopify Gizlilik Politikası</a>'na bakın.</p>

        <h2>Üçüncü taraf bağlantıları</h2>
        <p>${SHOP.name} başka web sitelerine bağlantı verebilir. Bu sitelerin gizlilik uygulamalarından sorumlu değiliz. Her zaman üçüncü taraf politikalarını inceleyin.</p>

        <h2>Çocukların verileri</h2>
        <p>Site çocuklara yönelik değildir ve ${SHOP.name} reşit olmayan çocuklardan bilerek veri toplamaz. Ebeveynler bu tür verilerin silinmesini talep edebilir.</p>

        <h2>Güvenlik ve veri saklama</h2>
        <p>Güvenlik önlemleri mevcut olsa da, mükemmel güvenlik garanti edilemez. Veri saklama süresi amaca, yasal yükümlülüklere veya hesap bakım ihtiyaçlarına bağlıdır.</p>

        <h2>Haklarınız</h2>
        <p>Bulunduğunuz konuma bağlı olarak şu haklara sahip olabilirsiniz:</p>
        <ul>
          <li>Verilerinize <strong>erişme, silme veya düzeltme.</strong></li>
          <li>Verilerinizi <strong>alma veya aktarma</strong> (taşınabilirlik).</li>
          <li>İşlemeyi <strong>kısıtlama veya itiraz etme.</strong></li>
          <li>Uygulanabilir olduğunda <strong>rızayı geri çekme.</strong></li>
          <li><strong>Pazarlama iletişimlerini yönetme.</strong></li>
        </ul>
        <p>Birleşik Krallık/AEA sakinlerinin ek hakları olabilir. Talepler web sitesindeki iletişim seçenekleri aracılığıyla yapılabilir.</p>

        <h2>Uluslararası aktarımlar</h2>
        <p>Verileriniz ülkeniz dışında işlenebilir. AEA/Birleşik Krallık'tan aktarımlar, Standart Sözleşme Maddeleri gibi yasal güvencelere dayanır.</p>

        <h2>Politika güncellemeleri</h2>
        <p>${SHOP.name}, uygulamalardaki, yasal gereksinimlerdeki veya operasyonel ihtiyaçlardaki değişiklikleri yansıtmak için bu Gizlilik Politikasını güncelleyebilir. Güncellemeler, revize edilmiş bir "Son güncelleme" tarihiyle yayınlanacaktır.</p>

        <h2>İletişim</h2>
        <p>Gizliliğinizle ilgili sorularınız mı var? Bize ${mail()} adresinden e-posta gönderin.</p>
      `,
    },
  },
  'refund-policy': {
    DE: {
      title: 'Rückgabe- & Widerrufsrecht',
      intro: 'Wie Rückgaben und Rückerstattungen funktionieren und wie du sie startest.',
      body: `
        <h2>1. Rückgabeberechtigung</h2>
        <p>Um für eine Rückgabe berechtigt zu sein, müssen Artikel ungetragen, unbenutzt und im gleichen Zustand wie erhalten sein, einschließlich der Originalverpackung.</p>
        <p>Rückgaben müssen innerhalb von ${SHOP.returnDays} Tagen nach Erhalt deiner Bestellung angemeldet werden.</p>
        <p>Als Finalverkauf gekennzeichnete oder ausdrücklich als nicht erstattungsfähig bezeichnete Artikel sind von Rückgaben oder Rückerstattungen ausgeschlossen.</p>

        <h2>2. So beantragst du eine Rückgabe oder Rückerstattung</h2>
        <p>Um eine Rückgabe oder Rückerstattung zu beantragen, schreib uns bitte innerhalb von ${SHOP.returnDays} Tagen nach Erhalt deiner Bestellung eine E-Mail an ${mail()} mit folgenden Angaben:</p>
        <ul>
          <li>Deine Bestellnummer</li>
          <li>Den Grund für die Rückgabe</li>
        </ul>
        <p>Unser Team schickt dir die richtige Rücksendeadresse und vollständige Anweisungen. Bitte sende einen Artikel nicht zurück, bevor du eine bestätigte Rücksendeadresse von uns erhalten hast, da wir unangekündigte Rücksendungen nicht bearbeiten können. Bitte verpacke die Artikel sicher, um Transportschäden zu vermeiden.</p>

        <h2>3. Kosten der Rücksendung</h2>
        <p>Die Kosten für die Rücksendung trägt der Kunde. Wir empfehlen dringend einen nachverfolgbaren Versanddienst, da wir den Erhalt zurückgesendeter Artikel nicht garantieren können.</p>

        <h2>4. Rückerstattungsprozess</h2>
        <p>Sobald wir deine Rücksendung erhalten und geprüft haben, informieren wir dich über den Genehmigungsstatus.</p>
        <p>Bei Genehmigung:</p>
        <ul>
          <li>Rückerstattungen werden innerhalb von 5 Werktagen bearbeitet</li>
          <li>Das Geld wird an deine ursprüngliche Zahlungsmethode zurücküberwiesen</li>
        </ul>
        <p>Bitte beachte, dass es bei deiner Bank oder deinem Kartenanbieter zusätzliche Zeit in Anspruch nehmen kann, die Rückerstattung zu verarbeiten. Wenn mehr als 15 Werktage seit der Genehmigung vergangen sind, kontaktiere uns bitte.</p>

        <h2>5. Nicht rückgabefähige Artikel</h2>
        <p>Folgende Artikel sind von der Rückgabe ausgeschlossen:</p>
        <ul>
          <li>Personalisierte oder individualisierte Produkte, außer bei Defekt oder Beschädigung</li>
          <li>Ausverkaufs- oder Finalverkaufsartikel</li>
        </ul>

        <h2>6. Liefer- &amp; Rückgabebedingungen</h2>
        <ul>
          <li>Rückgaben können nicht eingeleitet werden, bevor der Artikel geliefert wurde.</li>
          <li>Möchtest du deine Bestellung stornieren, musst du das Paket zunächst entgegennehmen und anschließend zurücksenden.</li>
          <li>Wir erstatten keine Rückerstattungen, wenn ein Kunde die Annahme verweigert oder das Paket nicht abholt.</li>
          <li>Wird ein Paket an eine Abholstation gesendet und nicht abgeholt, wird eine Bearbeitungsgebühr von ${SHOP.uncollectedFee} von einer etwaigen Rückerstattung abgezogen.</li>
        </ul>

        <h2>7. Rücksendeadresse</h2>
        <p>Um eine Rückerstattung oder Rückgabe zu beantragen, schreib uns bitte an ${mail()} — wir senden dir die korrekte Rücksendeadresse. Rücksendeadressen werden pro Bestellung ausgestellt, bitte fordere daher immer zuerst eine bei uns an, bevor du etwas zurücksendest.</p>

        <h2>8. Kontakt</h2>
        <p>Bei Fragen zu dieser Richtlinie kontaktiere uns bitte unter ${mail()}. Wir antworten in der Regel innerhalb von 1 bis 2 Werktagen.</p>
        <p>Mit der Bestellung bei uns erklärst du dich mit dieser Rückgabe- &amp; Widerrufsrichtlinie einverstanden.</p>

        <h2>Rückgabe &amp; Rückerstattung — USA und Kanada</h2>
        <p>Dieser Abschnitt gilt für Bestellungen, die in die Vereinigten Staaten und nach Kanada geliefert werden. Bestellungen innerhalb der Europäischen Union folgen der oben stehenden Standardrichtlinie, einschließlich des gesetzlichen ${SHOP.returnDays}-tägigen Widerrufsrechts.</p>

        <h3>Es doch nicht behalten wollen?</h3>
        <p>Du hast ${SHOP.returnDays} Tage ab Lieferung Zeit, ungetragene Artikel im Originalzustand mit Etiketten und Verpackung zurückzusenden.</p>
        <p>Wir möchten von Anfang an klarstellen, was eine Rückgabe aus reiner Nichtgefallen-Entscheidung kostet, damit es bei deiner Rückerstattung keine Überraschungen gibt.</p>
        <p>Der Versand nach Nordamerika ist kostenlos — an der Kasse wird dir nie eine Versandgebühr berechnet. Einfuhrabgaben und Zollgebühren werden an der Kasse als eigene Position <strong>„Zoll &amp; Bearbeitung“</strong> erhoben, damit dein Paket den Zoll ohne weitere Nachzahlung bei Lieferung passiert.</p>
        <p>Wenn eine Bestellung an uns zurückgeschickt wird, sind zwei dieser Kosten bereits ausgegeben und können nicht zurückgeholt werden. Sie werden dir daher nicht erstattet:</p>
        <ul>
          <li><strong>Die von uns bezahlten Versandkosten für deine Bestellung</strong> — dieser Betrag variiert je nach Größe und Gewicht deiner Bestellung und wird dir bei Genehmigung der Rücksendung mitgeteilt. Er wird von deiner Rückerstattung abgezogen.</li>
          <li><strong>Die an der Kasse gezahlten „Zoll &amp; Bearbeitung“-Kosten</strong> — der Zoll erstattet uns diese nach der Einfuhr des Pakets nicht zurück, daher ist diese Position nicht erstattungsfähig.</li>
          <li><strong>Rückgabebearbeitungsgebühr: ${SHOP.returnAdminFee}</strong> — wird von deiner Rückerstattung abgezogen.</li>
        </ul>
        <p>Die Rücksendung wird von dir organisiert und bezahlt. Wir stellen für Rückgaben aus reiner Nichtgefallen-Entscheidung keine vorfrankierten Rücksendeetiketten zur Verfügung. Wir empfehlen einen nachverfolgbaren Versanddienst — bis das Paket bei uns eintrifft, liegt die Verantwortung bei dir.</p>

        <h3>Beschädigte, fehlerhafte oder falsche Artikel</h3>
        <p>Es werden keine Abzüge vorgenommen. Du erhältst eine vollständige Rückerstattung, einschließlich der gezahlten „Zoll &amp; Bearbeitung“-Kosten, und wir übernehmen die Rücksendekosten. Schreib innerhalb von ${SHOP.returnDays} Tagen eine E-Mail an ${mail()} mit deiner Bestellnummer und Fotos.</p>
        <p>Mit einer Bestellung zur Lieferung in die Vereinigten Staaten oder nach Kanada bestätigst du, dass du die obigen Bedingungen gelesen und akzeptiert hast.</p>
      `,
    },
    FR: {
      title: 'Politique de retour et remboursement',
      intro: 'Comment fonctionnent les retours et remboursements, et comment en démarrer un.',
      body: `
        <h2>1. Conditions d'éligibilité aux retours</h2>
        <p>Pour être éligibles à un retour, les articles doivent être non portés, non utilisés et dans le même état qu'à leur réception, emballage d'origine inclus.</p>
        <p>Les retours doivent être demandés dans les ${SHOP.returnDays} jours suivant la réception de votre commande.</p>
        <p>Les articles marqués comme soldes finaux ou explicitement indiqués comme non remboursables ne sont pas éligibles aux retours ou remboursements.</p>

        <h2>2. Comment demander un retour ou un remboursement</h2>
        <p>Pour demander un retour ou un remboursement, veuillez nous écrire à ${mail()} dans les ${SHOP.returnDays} jours suivant la réception de votre commande, en indiquant :</p>
        <ul>
          <li>Votre numéro de commande</li>
          <li>Le motif du retour</li>
        </ul>
        <p>Notre équipe vous répondra avec l'adresse de retour correcte et des instructions complètes. Merci de ne pas renvoyer un article avant d'avoir reçu une adresse de retour confirmée de notre part, car nous ne pouvons pas traiter les retours non annoncés. Veuillez veiller à ce que les articles soient emballés de manière sécurisée pour éviter tout dommage pendant le transport.</p>

        <h2>3. Frais de retour</h2>
        <p>Les frais de retour sont à la charge du client. Nous recommandons vivement d'utiliser un service d'expédition avec suivi, car nous ne pouvons garantir la réception des articles retournés.</p>

        <h2>4. Processus de remboursement</h2>
        <p>Une fois votre retour reçu et inspecté, nous vous informerons du statut d'approbation.</p>
        <p>En cas d'approbation :</p>
        <ul>
          <li>Les remboursements sont traités sous 5 jours ouvrés</li>
          <li>Les fonds sont restitués sur votre mode de paiement d'origine</li>
        </ul>
        <p>Veuillez noter qu'un délai supplémentaire peut être nécessaire pour que votre banque ou votre fournisseur de carte traite le remboursement. Si plus de 15 jours ouvrés se sont écoulés depuis l'approbation, veuillez nous contacter.</p>

        <h2>5. Articles non retournables</h2>
        <p>Les articles suivants ne sont pas éligibles au retour :</p>
        <ul>
          <li>Produits personnalisés ou sur mesure, sauf en cas de défaut ou de dommage</li>
          <li>Articles en liquidation ou en solde final</li>
        </ul>

        <h2>6. Conditions de livraison et de retour</h2>
        <ul>
          <li>Les retours ne peuvent pas être initiés avant que l'article n'ait été livré.</li>
          <li>Si vous souhaitez annuler votre commande, vous devez d'abord recevoir le colis puis le retourner.</li>
          <li>Nous n'émettons pas de remboursement si un client refuse la livraison ou ne récupère pas son colis.</li>
          <li>Si un colis est envoyé à un point relais et n'est pas récupéré, des frais administratifs de ${SHOP.uncollectedFee} seront déduits de tout remboursement.</li>
        </ul>

        <h2>7. Adresse de retour</h2>
        <p>Pour demander un remboursement ou un retour, veuillez nous écrire à ${mail()} et nous vous enverrons l'adresse de retour correcte. Les adresses de retour sont attribuées par commande, veuillez donc toujours nous en demander une avant de renvoyer quoi que ce soit.</p>

        <h2>8. Nous contacter</h2>
        <p>Pour toute question concernant cette politique, veuillez nous contacter à ${mail()}. Nous visons à répondre sous 1 à 2 jours ouvrés.</p>
        <p>En passant commande chez nous, vous acceptez cette politique de retour et remboursement.</p>

        <h2>Retours et remboursements — États-Unis et Canada</h2>
        <p>Cette section s'applique aux commandes livrées aux États-Unis et au Canada. Les commandes au sein de l'Union européenne suivent la politique standard ci-dessus, y compris le droit de rétractation légal de ${SHOP.returnDays} jours.</p>

        <h3>Vous avez changé d'avis ?</h3>
        <p>Vous disposez de ${SHOP.returnDays} jours à compter de la livraison pour retourner des articles non portés dans leur état d'origine, étiquettes et emballage intacts.</p>
        <p>Nous tenons à être transparents sur le coût d'un retour pour simple changement d'avis, afin qu'il n'y ait aucune surprise au moment de votre remboursement.</p>
        <p>La livraison vers l'Amérique du Nord est gratuite — aucun frais de livraison ne vous est jamais facturé au paiement. Les droits d'importation et frais de douane sont perçus au paiement sous la forme d'une ligne distincte <strong>« Droits de douane et traitement »</strong>, afin que votre colis passe la douane sans reste à payer à la livraison.</p>
        <p>Lorsqu'une commande nous revient, deux de ces coûts sont déjà engagés et ne peuvent être récupérés. Ils ne vous sont donc pas remboursés :</p>
        <ul>
          <li><strong>Le coût de livraison que nous avons payé pour expédier votre commande</strong> — ce montant varie selon la taille et le poids de votre commande, et vous est confirmé lorsque votre retour est approuvé. Il est déduit de votre remboursement.</li>
          <li><strong>Les frais de « Droits de douane et traitement » payés au paiement</strong> — la douane ne nous les restitue pas une fois le colis importé, cette ligne n'est donc pas remboursable.</li>
          <li><strong>Frais d'administration du retour : ${SHOP.returnAdminFee}</strong> — déduits de votre remboursement.</li>
        </ul>
        <p>Le retour est organisé et payé par vos soins. Nous ne fournissons pas d'étiquettes de retour prépayées pour les retours pour simple changement d'avis. Nous recommandons d'utiliser un service avec suivi — tant que le colis ne nous est pas parvenu, il reste sous votre responsabilité.</p>

        <h3>Articles endommagés, défectueux ou incorrects</h3>
        <p>Aucune déduction ne s'applique. Vous recevez un remboursement intégral, y compris les frais de « Droits de douane et traitement » payés, et nous prenons en charge les frais de retour. Écrivez à ${mail()} dans les ${SHOP.returnDays} jours avec votre numéro de commande et des photos.</p>
        <p>En passant une commande pour une livraison aux États-Unis ou au Canada, vous confirmez avoir lu et accepté les conditions ci-dessus.</p>
      `,
    },
    ES: {
      title: 'Política de devoluciones y reembolsos',
      intro: 'Cómo funcionan las devoluciones y reembolsos, y cómo iniciar uno.',
      body: `
        <h2>1. Condiciones para las devoluciones</h2>
        <p>Para ser elegibles para una devolución, los artículos deben estar sin usar, sin desgaste y en las mismas condiciones en que se recibieron, incluido el embalaje original.</p>
        <p>Las devoluciones deben solicitarse en un plazo de ${SHOP.returnDays} días desde la recepción de tu pedido.</p>
        <p>Los artículos marcados como venta final o explícitamente indicados como no reembolsables no son elegibles para devoluciones ni reembolsos.</p>

        <h2>2. Cómo solicitar una devolución o reembolso</h2>
        <p>Para solicitar una devolución o reembolso, envíanos un correo a ${mail()} dentro de los ${SHOP.returnDays} días posteriores a la recepción de tu pedido, incluyendo:</p>
        <ul>
          <li>Tu número de pedido</li>
          <li>El motivo de la devolución</li>
        </ul>
        <p>Nuestro equipo te responderá con la dirección de devolución correcta y las instrucciones completas. Por favor, no nos envíes un artículo antes de haber recibido una dirección de devolución confirmada por nuestra parte, ya que no podemos procesar devoluciones no anunciadas. Asegúrate de embalar bien los artículos para evitar daños durante el transporte.</p>

        <h2>3. Costes de envío de la devolución</h2>
        <p>Los costes de envío de la devolución corren a cargo del cliente. Recomendamos encarecidamente usar un servicio de envío con seguimiento, ya que no podemos garantizar la recepción de los artículos devueltos.</p>

        <h2>4. Proceso de reembolso</h2>
        <p>Una vez que recibamos e inspeccionemos tu devolución, te notificaremos el estado de aprobación.</p>
        <p>Si se aprueba:</p>
        <ul>
          <li>Los reembolsos se procesan en un plazo de 5 días laborables</li>
          <li>El importe se devuelve a tu método de pago original</li>
        </ul>
        <p>Ten en cuenta que tu banco o proveedor de tarjeta puede tardar un tiempo adicional en procesar el reembolso. Si han pasado más de 15 días laborables desde la aprobación, ponte en contacto con nosotros.</p>

        <h2>5. Artículos no retornables</h2>
        <p>Los siguientes artículos no son elegibles para devolución:</p>
        <ul>
          <li>Productos personalizados, salvo que estén defectuosos o dañados</li>
          <li>Artículos en liquidación o de venta final</li>
        </ul>

        <h2>6. Condiciones de entrega y devolución</h2>
        <ul>
          <li>Las devoluciones no pueden iniciarse antes de que el artículo haya sido entregado.</li>
          <li>Si deseas cancelar tu pedido, primero debes recibir el paquete y luego devolverlo.</li>
          <li>No emitimos reembolsos si un cliente rechaza la entrega o no recoge su paquete.</li>
          <li>Si un paquete se envía a un punto de recogida y no se recoge, se descontará una tasa administrativa de ${SHOP.uncollectedFee} de cualquier reembolso.</li>
        </ul>

        <h2>7. Dirección de devolución</h2>
        <p>Para solicitar un reembolso o devolución, escríbenos a ${mail()} y te enviaremos la dirección de devolución correcta. Las direcciones de devolución se emiten por pedido, así que solicita siempre una antes de enviarnos algo de vuelta.</p>

        <h2>8. Contáctanos</h2>
        <p>Para cualquier pregunta sobre esta política, contáctanos en ${mail()}. Nuestro objetivo es responder en un plazo de 1 a 2 días laborables.</p>
        <p>Al realizar un pedido con nosotros, aceptas esta Política de devoluciones y reembolsos.</p>

        <h2>Devoluciones y reembolsos — Estados Unidos y Canadá</h2>
        <p>Esta sección se aplica a los pedidos entregados en Estados Unidos y Canadá. Los pedidos dentro de la Unión Europea siguen la política estándar anterior, incluido el derecho de desistimiento legal de ${SHOP.returnDays} días.</p>

        <h3>¿Has cambiado de opinión?</h3>
        <p>Tienes ${SHOP.returnDays} días desde la entrega para devolver artículos sin usar en su estado original, con etiquetas y embalaje intactos.</p>
        <p>Queremos ser transparentes sobre el coste de una devolución por cambio de opinión, para que no haya sorpresas cuando llegue tu reembolso.</p>
        <p>El envío a Norteamérica es gratuito: nunca se te cobra una tarifa de entrega al finalizar la compra. Los aranceles de importación y los cargos aduaneros se cobran al finalizar la compra como una línea propia de <strong>«Aranceles y gestión»</strong>, de modo que tu paquete pasa la aduana sin nada pendiente de pagar en la entrega.</p>
        <p>Cuando un pedido nos es devuelto, dos de esos costes ya se han gastado y no pueden recuperarse. Por lo tanto, no se te reembolsan:</p>
        <ul>
          <li><strong>El coste de envío que pagamos para enviar tu pedido</strong> — este importe varía según el tamaño y el peso de tu pedido, y se te confirma cuando se aprueba tu devolución. Se descuenta de tu reembolso.</li>
          <li><strong>Los «Aranceles y gestión» que pagaste al finalizar la compra</strong> — la aduana no nos los devuelve una vez importado el paquete, por lo que esta línea no es reembolsable.</li>
          <li><strong>Tasa administrativa de devolución: ${SHOP.returnAdminFee}</strong> — se descuenta de tu reembolso.</li>
        </ul>
        <p>El envío de devolución lo organizas y pagas tú. No proporcionamos etiquetas de devolución prepagadas para devoluciones por cambio de opinión. Recomendamos usar un servicio con seguimiento: hasta que el paquete llegue a nosotros, sigue siendo tu responsabilidad.</p>

        <h3>Artículos dañados, defectuosos o incorrectos</h3>
        <p>No se aplican deducciones. Recibes un reembolso completo, incluidos los «Aranceles y gestión» que pagaste, y nosotros cubrimos el envío de devolución. Escribe a ${mail()} dentro de los ${SHOP.returnDays} días con tu número de pedido y fotos.</p>
        <p>Al realizar un pedido para entrega en Estados Unidos o Canadá, confirmas que has leído y aceptado los términos anteriores.</p>
      `,
    },
    IT: {
      title: 'Politica di reso e rimborso',
      intro: 'Come funzionano resi e rimborsi e come avviarne uno.',
      body: `
        <h2>1. Idoneità al reso</h2>
        <p>Per essere idonei al reso, gli articoli devono essere non indossati, non utilizzati e nelle stesse condizioni in cui sono stati ricevuti, imballaggio originale incluso.</p>
        <p>I resi devono essere richiesti entro ${SHOP.returnDays} giorni dal ricevimento dell'ordine.</p>
        <p>Gli articoli contrassegnati come vendita finale o esplicitamente indicati come non rimborsabili non sono idonei per resi o rimborsi.</p>

        <h2>2. Come richiedere un reso o un rimborso</h2>
        <p>Per richiedere un reso o un rimborso, scrivici a ${mail()} entro ${SHOP.returnDays} giorni dal ricevimento del tuo ordine, includendo:</p>
        <ul>
          <li>Il tuo numero d'ordine</li>
          <li>Il motivo del reso</li>
        </ul>
        <p>Il nostro team ti risponderà con l'indirizzo di reso corretto e le istruzioni complete. Ti preghiamo di non spedire un articolo prima di aver ricevuto un indirizzo di reso confermato da parte nostra, poiché non possiamo elaborare resi non annunciati. Assicurati di imballare gli articoli in modo sicuro per evitare danni durante il trasporto.</p>

        <h2>3. Costi di spedizione del reso</h2>
        <p>I costi di spedizione del reso sono a carico del cliente. Consigliamo vivamente di utilizzare un servizio di spedizione tracciabile, poiché non possiamo garantire la ricezione degli articoli restituiti.</p>

        <h2>4. Processo di rimborso</h2>
        <p>Una volta ricevuto e ispezionato il tuo reso, ti comunicheremo lo stato di approvazione.</p>
        <p>Se approvato:</p>
        <ul>
          <li>I rimborsi vengono elaborati entro 5 giorni lavorativi</li>
          <li>L'importo viene restituito al tuo metodo di pagamento originale</li>
        </ul>
        <p>Tieni presente che la tua banca o il fornitore della carta potrebbero richiedere ulteriore tempo per elaborare il rimborso. Se sono trascorsi più di 15 giorni lavorativi dall'approvazione, contattaci.</p>

        <h2>5. Articoli non restituibili</h2>
        <p>I seguenti articoli non sono idonei per il reso:</p>
        <ul>
          <li>Prodotti personalizzati, salvo che siano difettosi o danneggiati</li>
          <li>Articoli in liquidazione o vendita finale</li>
        </ul>

        <h2>6. Condizioni di consegna e reso</h2>
        <ul>
          <li>I resi non possono essere avviati prima che l'articolo sia stato consegnato.</li>
          <li>Se desideri annullare il tuo ordine, devi prima ricevere il pacco e poi restituirlo.</li>
          <li>Non emettiamo rimborsi se un cliente rifiuta la consegna o non ritira il proprio pacco.</li>
          <li>Se un pacco viene inviato a un punto di ritiro e non viene ritirato, una commissione amministrativa di ${SHOP.uncollectedFee} verrà detratta da qualsiasi rimborso.</li>
        </ul>

        <h2>7. Indirizzo di reso</h2>
        <p>Per richiedere un rimborso o un reso, scrivici a ${mail()} e ti invieremo l'indirizzo di reso corretto. Gli indirizzi di reso vengono forniti per ogni ordine, quindi richiedine sempre uno a noi prima di rispedire qualsiasi cosa.</p>

        <h2>8. Contattaci</h2>
        <p>Per qualsiasi domanda su questa politica, contattaci a ${mail()}. Il nostro obiettivo è rispondere entro 1-2 giorni lavorativi.</p>
        <p>Effettuando un ordine con noi, accetti questa Politica di reso e rimborso.</p>

        <h2>Resi e rimborsi — Stati Uniti e Canada</h2>
        <p>Questa sezione si applica agli ordini consegnati negli Stati Uniti e in Canada. Gli ordini all'interno dell'Unione Europea seguono la politica standard sopra indicata, incluso il diritto di recesso legale di ${SHOP.returnDays} giorni.</p>

        <h3>Hai cambiato idea?</h3>
        <p>Hai ${SHOP.returnDays} giorni dalla consegna per restituire articoli non indossati nelle loro condizioni originali, con etichette e imballaggio intatti.</p>
        <p>Vogliamo essere trasparenti su quanto costa un reso per cambio idea, così non ci saranno sorprese quando arriverà il tuo rimborso.</p>
        <p>La spedizione verso il Nord America è gratuita: non ti viene mai addebitata una spedizione al momento del pagamento. I dazi d'importazione e le spese doganali vengono riscossi al momento del pagamento come voce separata <strong>"Dazi e gestione"</strong>, così il tuo pacco supera la dogana senza nulla da pagare alla consegna.</p>
        <p>Quando un ordine ci viene restituito, due di questi costi sono già stati sostenuti e non possono essere recuperati. Pertanto non ti vengono rimborsati:</p>
        <ul>
          <li><strong>Il costo di spedizione che abbiamo pagato per spedire il tuo ordine</strong> — questo importo varia in base alle dimensioni e al peso del tuo ordine e ti viene confermato quando il reso viene approvato. Viene detratto dal tuo rimborso.</li>
          <li><strong>I "Dazi e gestione" pagati al momento del pagamento</strong> — la dogana non ce li restituisce una volta importato il pacco, quindi questa voce non è rimborsabile.</li>
          <li><strong>Commissione amministrativa di reso: ${SHOP.returnAdminFee}</strong> — detratta dal tuo rimborso.</li>
        </ul>
        <p>La spedizione di reso è organizzata e pagata da te. Non forniamo etichette di reso prepagate per i resi dovuti a cambio idea. Consigliamo di usare un servizio tracciabile — finché il pacco non ci raggiunge, resta di tua responsabilità.</p>

        <h3>Articoli danneggiati, difettosi o errati</h3>
        <p>Non si applicano detrazioni. Ricevi un rimborso completo, incluso il costo di "Dazi e gestione" pagato, e copriamo noi la spedizione di reso. Scrivi a ${mail()} entro ${SHOP.returnDays} giorni con il numero d'ordine e delle foto.</p>
        <p>Effettuando un ordine per la consegna negli Stati Uniti o in Canada, confermi di aver letto e accettato i termini sopra indicati.</p>
      `,
    },
    SV: {
      title: 'Retur- och återbetalningspolicy',
      intro: 'Så fungerar returer och återbetalningar, och så startar du en.',
      body: `
        <h2>1. Villkor för retur</h2>
        <p>För att vara berättigad till retur måste artiklar vara obrukade, oanvända och i samma skick som vid mottagandet, inklusive originalförpackningen.</p>
        <p>Returer måste begäras inom ${SHOP.returnDays} dagar från mottagandet av din beställning.</p>
        <p>Artiklar markerade som slutförsäljning eller uttryckligen angivna som ej återbetalningsbara är inte berättigade till retur eller återbetalning.</p>

        <h2>2. Så begär du en retur eller återbetalning</h2>
        <p>För att begära en retur eller återbetalning, maila oss på ${mail()} inom ${SHOP.returnDays} dagar efter mottagandet av din beställning och inkludera:</p>
        <ul>
          <li>Ditt ordernummer</li>
          <li>Anledningen till returen</li>
        </ul>
        <p>Vårt team svarar med korrekt returadress och fullständiga instruktioner. Skicka inte tillbaka en vara innan du fått en bekräftad returadress från oss, eftersom vi inte kan hantera oanmälda returer. Se till att varorna är säkert förpackade för att undvika skador under transporten.</p>

        <h2>3. Returfraktkostnader</h2>
        <p>Kunden ansvarar för returfraktkostnaderna. Vi rekommenderar starkt att använda en spårbar fraktjänst, eftersom vi inte kan garantera mottagandet av returnerade varor.</p>

        <h2>4. Återbetalningsprocess</h2>
        <p>När vi tagit emot och inspekterat din retur meddelar vi dig om godkännandestatus.</p>
        <p>Om godkänd:</p>
        <ul>
          <li>Återbetalningar behandlas inom 5 arbetsdagar</li>
          <li>Pengarna återförs till din ursprungliga betalningsmetod</li>
        </ul>
        <p>Observera att det kan ta ytterligare tid för din bank eller kortleverantör att behandla återbetalningen. Om mer än 15 arbetsdagar har gått sedan godkännandet, kontakta oss.</p>

        <h2>5. Ej returnerbara varor</h2>
        <p>Följande varor är inte berättigade till retur:</p>
        <ul>
          <li>Personanpassade eller specialbeställda produkter, om inte defekta eller skadade</li>
          <li>Reaartiklar eller slutförsäljningsvaror</li>
        </ul>

        <h2>6. Leverans- och returvillkor</h2>
        <ul>
          <li>Returer kan inte påbörjas innan varan har levererats.</li>
          <li>Om du vill avboka din beställning måste du först ta emot paketet och sedan returnera det.</li>
          <li>Vi återbetalar inte om en kund vägrar leverans eller inte hämtar ut sitt paket.</li>
          <li>Om ett paket skickas till ett ombud och inte hämtas ut dras en administrationsavgift på ${SHOP.uncollectedFee} från eventuell återbetalning.</li>
        </ul>

        <h2>7. Returadress</h2>
        <p>För att begära återbetalning eller retur, maila oss på ${mail()} så skickar vi den korrekta returadressen. Returadresser utfärdas per beställning, så be alltid om en från oss innan du skickar tillbaka något.</p>

        <h2>8. Kontakta oss</h2>
        <p>Vid frågor om denna policy, kontakta oss på ${mail()}. Vi strävar efter att svara inom 1–2 arbetsdagar.</p>
        <p>Genom att lägga en beställning hos oss godkänner du denna retur- och återbetalningspolicy.</p>

        <h2>Returer och återbetalningar — USA och Kanada</h2>
        <p>Detta avsnitt gäller beställningar som levereras till USA och Kanada. Beställningar inom EU följer standardpolicyn ovan, inklusive den lagstadgade ångerrätten på ${SHOP.returnDays} dagar.</p>

        <h3>Har du ångrat dig?</h3>
        <p>Du har ${SHOP.returnDays} dagar från leverans att returnera obrukade varor i originalskick, med etiketter och förpackning intakta.</p>
        <p>Vi vill vara tydliga med vad en retur på grund av ångerköp kostar, så att det inte blir några överraskningar när din återbetalning kommer.</p>
        <p>Frakt till Nordamerika är gratis — du debiteras aldrig en fraktavgift i kassan. Importavgifter och tullavgifter tas ut i kassan som en egen post, <strong>"Tull och hantering"</strong>, så att ditt paket klarar tullen utan något kvar att betala vid leverans.</p>
        <p>När en beställning kommer tillbaka till oss är två av dessa kostnader redan spenderade och kan inte återvinnas. De återbetalas därför inte till dig:</p>
        <ul>
          <li><strong>Fraktkostnaden vi betalade för att skicka din beställning</strong> — beloppet varierar beroende på storlek och vikt på din beställning och bekräftas för dig när din retur godkänns. Den dras av från din återbetalning.</li>
          <li><strong>"Tull och hantering" som du betalade i kassan</strong> — tullen återbetalar inte dessa till oss när paketet väl har importerats, så denna post är inte återbetalningsbar.</li>
          <li><strong>Returadministrationsavgift: ${SHOP.returnAdminFee}</strong> — dras av från din återbetalning.</li>
        </ul>
        <p>Returfrakten ordnas och betalas av dig. Vi tillhandahåller inte förbetalda returetiketter för returer på grund av ångerköp. Vi rekommenderar en spårad tjänst — tills paketet når oss är det ditt ansvar.</p>

        <h3>Skadade, felaktiga eller fel artiklar</h3>
        <p>Inga avdrag görs. Du får full återbetalning, inklusive "Tull och hantering" som du betalat, och vi står för returfrakten. Maila ${mail()} inom ${SHOP.returnDays} dagar med ditt ordernummer och foton.</p>
        <p>Genom att lägga en beställning för leverans till USA eller Kanada bekräftar du att du har läst och accepterat villkoren ovan.</p>
      `,
    },
    TR: {
      title: 'İade ve Geri Ödeme Politikası',
      intro: 'İade ve geri ödemelerin nasıl işlediği ve nasıl başlatılacağı.',
      body: `
        <h2>1. İade uygunluğu</h2>
        <p>İade için uygun olması adına ürünler giyilmemiş, kullanılmamış ve orijinal ambalajı dahil teslim alındığı şekliyle aynı durumda olmalıdır.</p>
        <p>İadeler, siparişinizi teslim aldıktan sonra ${SHOP.returnDays} gün içinde talep edilmelidir.</p>
        <p>İndirimli son satış olarak işaretlenmiş veya açıkça iade edilemez olarak belirtilmiş ürünler iade veya geri ödeme için uygun değildir.</p>

        <h2>2. İade veya geri ödeme nasıl talep edilir</h2>
        <p>İade veya geri ödeme talep etmek için lütfen siparişinizi teslim aldıktan sonra ${SHOP.returnDays} gün içinde ${mail()} adresine aşağıdakileri içeren bir e-posta gönderin:</p>
        <ul>
          <li>Sipariş numaranız</li>
          <li>İade nedeni</li>
        </ul>
        <p>Ekibimiz size doğru iade adresi ve eksiksiz talimatlarla yanıt verecektir. Bizden onaylanmış bir iade adresi almadan lütfen bir ürünü geri göndermeyin, çünkü haber verilmeden yapılan iadeleri işleme alamıyoruz. Taşıma sırasında hasar görmemesi için ürünlerin güvenli şekilde paketlendiğinden emin olun.</p>

        <h2>3. İade kargo ücretleri</h2>
        <p>İade kargo ücretlerinden müşteri sorumludur. İade edilen ürünlerin tarafımıza ulaştığını garanti edemediğimiz için takip edilebilir bir kargo hizmeti kullanmanızı önemle tavsiye ederiz.</p>

        <h2>4. Geri ödeme süreci</h2>
        <p>İadenizi teslim alıp inceledikten sonra onay durumu hakkında sizi bilgilendireceğiz.</p>
        <p>Onaylanırsa:</p>
        <ul>
          <li>Geri ödemeler 5 iş günü içinde işleme alınır</li>
          <li>Tutar orijinal ödeme yönteminize iade edilir</li>
        </ul>
        <p>Bankanızın veya kart sağlayıcınızın geri ödemeyi işleme koyması için ek süre gerekebileceğini lütfen unutmayın. Onaydan bu yana 15 iş gününden fazla zaman geçtiyse lütfen bizimle iletişime geçin.</p>

        <h2>5. İade edilemeyen ürünler</h2>
        <p>Aşağıdaki ürünler iadeye uygun değildir:</p>
        <ul>
          <li>Kişiselleştirilmiş veya özel yapım ürünler, arızalı veya hasarlı olmadıkça</li>
          <li>İndirimli veya son satış ürünleri</li>
        </ul>

        <h2>6. Teslimat ve iade koşulları</h2>
        <ul>
          <li>Ürün teslim edilmeden iade başlatılamaz.</li>
          <li>Siparişinizi iptal etmek istiyorsanız, önce paketi teslim almanız ardından iade etmeniz gerekir.</li>
          <li>Bir müşteri teslimatı reddederse veya paketini teslim almazsa geri ödeme yapmıyoruz.</li>
          <li>Bir paket bir teslim alma noktasına gönderilir ve teslim alınmazsa, herhangi bir geri ödemeden ${SHOP.uncollectedFee} idari ücret düşülür.</li>
        </ul>

        <h2>7. İade adresi</h2>
        <p>Geri ödeme veya iade talep etmek için lütfen ${mail()} adresine yazın; size doğru iade adresini göndereceğiz. İade adresleri sipariş başına verilir, bu nedenle herhangi bir şey göndermeden önce her zaman bizden bir tane isteyin.</p>

        <h2>8. Bize ulaşın</h2>
        <p>Bu politikayla ilgili herhangi bir sorunuz için lütfen ${mail()} adresinden bize ulaşın. 1 ila 2 iş günü içinde yanıt vermeyi hedefliyoruz.</p>
        <p>Bizden sipariş vererek bu İade ve Geri Ödeme Politikasını kabul etmiş olursunuz.</p>

        <h2>İade ve geri ödemeler — Amerika Birleşik Devletleri ve Kanada</h2>
        <p>Bu bölüm, Amerika Birleşik Devletleri ve Kanada'ya teslim edilen siparişler için geçerlidir. Avrupa Birliği içindeki siparişler, yasal ${SHOP.returnDays} günlük cayma hakkı dahil olmak üzere yukarıdaki standart politikayı izler.</p>

        <h3>Fikrinizi mi değiştirdiniz?</h3>
        <p>Etiketleri ve ambalajı sağlam, orijinal durumdaki giyilmemiş ürünleri teslimattan itibaren ${SHOP.returnDays} gün içinde iade edebilirsiniz.</p>
        <p>Fikir değişikliği iadesinin maliyeti konusunda baştan açık olmak istiyoruz, böylece geri ödemeniz geldiğinde hiçbir sürpriz olmaz.</p>
        <p>Kuzey Amerika'ya kargo ücretsizdir — ödeme sırasında hiçbir zaman teslimat ücreti alınmaz. İthalat vergileri ve gümrük ücretleri, ödeme sırasında ayrı bir <strong>"Gümrük ve işlem"</strong> kalemi olarak tahsil edilir, böylece paketiniz teslimatta ödenecek bir bakiye kalmadan gümrükten geçer.</p>
        <p>Bir sipariş bize geri döndüğünde, bu maliyetlerden ikisi zaten harcanmıştır ve geri alınamaz. Bu nedenle size iade edilmezler:</p>
        <ul>
          <li><strong>Siparişinizi göndermek için ödediğimiz teslimat ücreti</strong> — bu tutar siparişinizin boyutuna ve ağırlığına göre değişir ve iadeniz onaylandığında size bildirilir. Geri ödemenizden düşülür.</li>
          <li><strong>Ödeme sırasında ödediğiniz "Gümrük ve işlem" ücreti</strong> — paket ithal edildikten sonra gümrük bunu bize iade etmez, bu nedenle bu kalem iade edilemez.</li>
          <li><strong>İade idari ücreti: ${SHOP.returnAdminFee}</strong> — geri ödemenizden düşülür.</li>
        </ul>
        <p>İade kargosu sizin tarafınızdan düzenlenir ve ödenir. Fikir değişikliği iadeleri için ön ödemeli iade etiketleri sağlamıyoruz. Takip edilebilir bir hizmet kullanmanızı öneririz — paket bize ulaşana kadar sorumluluk sizdedir.</p>

        <h3>Hasarlı, arızalı veya yanlış ürünler</h3>
        <p>Herhangi bir kesinti uygulanmaz. Ödediğiniz "Gümrük ve işlem" dahil tam geri ödeme alırsınız ve iade kargosunu biz karşılarız. Sipariş numaranız ve fotoğraflarla birlikte ${SHOP.returnDays} gün içinde ${mail()} adresine e-posta gönderin.</p>
        <p>Amerika Birleşik Devletleri veya Kanada'ya teslimat için sipariş vererek, yukarıdaki şartları okuduğunuzu ve kabul ettiğinizi onaylarsınız.</p>
      `,
    },
  },
  'terms-of-service': {
    DE: {
      title: 'Allgemeine Geschäftsbedingungen',
      intro: 'Die Bedingungen, die für jede Bestellung gelten.',
      body: `
        <p>Diese Allgemeinen Geschäftsbedingungen gelten für jedes Angebot und jede Bestellung zwischen ${SHOP.name} und dem Verbraucher.</p>

        <h2>Artikel 1 – Begriffsbestimmungen</h2>
        <ul>
          <li><strong>Widerrufsrecht:</strong> der Zeitraum, in dem der Verbraucher sein Recht ausüben kann, den Vertrag zu widerrufen.</li>
          <li><strong>Verbraucher:</strong> eine natürliche Person, die nicht zu gewerblichen Zwecken handelt und mit dem Unternehmen einen Fernabsatzvertrag abschließt.</li>
          <li><strong>Dauervertrag:</strong> ein Fernabsatzvertrag über eine Reihe von Produkten oder Dienstleistungen, dessen Pflichten sich über die Zeit erstrecken.</li>
          <li><strong>Widerrufsrecht:</strong> das Recht des Verbrauchers, den Vertrag innerhalb der Widerrufsfrist zu widerrufen.</li>
          <li><strong>Unternehmen:</strong> die natürliche oder juristische Person, die Verbrauchern Produkte oder Dienstleistungen aus der Ferne anbietet.</li>
          <li><strong>Fernabsatzvertrag:</strong> ein Vertrag, der zwischen dem Unternehmen und dem Verbraucher unter Verwendung von Fernkommunikationsmitteln geschlossen wird.</li>
          <li><strong>CESOP:</strong> das zentrale elektronische EU-System für Zahlungsinformationen zur Überwachung von Zahlungsdienstleistern.</li>
        </ul>

        <h2>Artikel 2 – Unternehmensidentität</h2>
        <ul>
          ${companyIdentityDE}
        </ul>

        <h2>Artikel 3 – Anwendbarkeit</h2>
        <p>Diese Bedingungen gelten für jedes Angebot, jeden Fernabsatzvertrag und jede Bestellung zwischen dem Unternehmen und dem Verbraucher. Der Verbraucher hat vor Vertragsabschluss Zugang zu den Bedingungen. Ist dies nicht möglich, wird der Verbraucher informiert, wo er die Bedingungen kostenlos einsehen oder erhalten kann.</p>
        <p>Bei elektronischen Verträgen werden die Bedingungen so bereitgestellt, dass sie auf einem dauerhaften Datenträger gespeichert werden können. Ist dies nicht möglich, wird der Speicherort der Bedingungen angegeben. Bei einem Widerspruch zwischen diesen Bedingungen und spezifischen Produkt- oder Dienstleistungsbedingungen gelten die für den Verbraucher günstigeren Regelungen. Unwirksame Bestimmungen berühren die übrigen Bedingungen nicht; sie werden durch Bestimmungen ersetzt, die dem ursprünglichen Zweck am nächsten kommen.</p>

        <h2>Artikel 4 – Das Angebot</h2>
        <p>Angebote sind unverbindlich; das Unternehmen kann sie ändern. Etwaige Einschränkungen oder Bedingungen von Angeboten werden klar angegeben. Produktbeschreibungen sind so genau wie möglich; Farben und Abbildungen können abweichen. Folgende Informationen werden klar angegeben:</p>
        <ul>
          <li>Preise (ohne Einfuhrzölle und Einfuhrumsatzsteuer – Verantwortung des Verbrauchers).</li>
          <li>Etwaige Versandkosten.</li>
          <li>Wie der Vertrag zustande kommt und welche Schritte erforderlich sind.</li>
        </ul>

        <h2>Artikel 5 – Der Vertrag</h2>
        <p>Der Vertrag kommt zustande, wenn der Verbraucher das Angebot annimmt und die Bedingungen erfüllt. Bei elektronischer Annahme bestätigt das Unternehmen den Eingang unverzüglich. Bis dahin kann der Verbraucher den Vertrag widerrufen. Das Unternehmen verwendet geeignete technische und organisatorische Sicherheitsmaßnahmen für elektronische Transaktionen.</p>
        <p>Das Unternehmen kann Informationen über die Zahlungsfähigkeit des Verbrauchers anfordern. Auf dieser Grundlage können Bestellungen abgelehnt oder besondere Bedingungen angewandt werden. Nach Vertragsschluss erhält der Verbraucher Informationen über:</p>
        <ul>
          <li>Das Widerrufsrecht.</li>
          <li>Gewährleistung und Kundendienst.</li>
          <li>Sonstige relevante Informationen (siehe Artikel 4).</li>
          <li>Kündigungsbedingungen bei Dauerverträgen.</li>
        </ul>
        <p>Alle Verträge stehen unter dem Vorbehalt der Produktverfügbarkeit.</p>

        <h2>Artikel 6 – Widerrufsrecht</h2>
        <p>Der Verbraucher hat ein 14-tägiges Widerrufsrecht ab Erhalt der Ware. Die Rücksendung erfolgt auf Kosten des Verbrauchers. Fehlerhafte Waren werden erstattet oder ersetzt. Während der Widerrufsfrist ist mit dem Produkt sorgsam umzugehen. Der Widerruf muss innerhalb von 14 Tagen schriftlich mitgeteilt werden; danach muss das Produkt innerhalb weiterer 14 Tage zurückgesendet werden. Ein Nachweis der rechtzeitigen Rücksendung ist zu erbringen. Bei unterbliebener Mitteilung oder Rücksendung gilt der Kauf als endgültig.</p>
        <p>Das Widerrufsrecht gilt nicht für:</p>
        <ul>
          <li>Nach Kundenspezifikation angefertigte oder personalisierte Produkte.</li>
          <li>Artikel, die getragen, gewaschen oder verändert wurden oder deren Etiketten oder Anhänger entfernt wurden.</li>
          <li>Zeitungen, Software, Audio- und Videoaufnahmen mit beschädigter Verpackung.</li>
          <li>Dienstleistungen mit festem Termin (Unterkunft, Transport, Freizeit).</li>
        </ul>
        <p>Der Kunde stellt ${SHOP.name} von Ansprüchen Dritter frei. Das Unternehmen haftet nicht für Fehler in Produktbeschreibungen, es sei denn, diese beruhen auf grober Fahrlässigkeit.</p>

        <h2>Artikel 7 – Kosten des Widerrufs</h2>
        <p>Nur die Kosten der Rücksendung trägt der Verbraucher. Gezahlte Beträge werden innerhalb von 14 Tagen nach Erhalt der zurückgesendeten Ware erstattet.</p>

        <h2>Artikel 8 – Zoll und Mehrwertsteuer</h2>
        <ol>
          <li>Der Kunde ist allein dafür verantwortlich, alle gesetzlichen Verpflichtungen im Zusammenhang mit der Einfuhr von Waren in das Lieferland zu erfüllen, einschließlich der Zahlung von Einfuhrabgaben, Steuern und Zollabfertigungskosten.</li>
          <li>Der Unternehmer handelt bei keinem an den Kunden versendeten Produkt als Einführer im Sinne der Zollvorschriften.</li>
          <li>Der Kunde ist dafür verantwortlich, die Einhaltung der örtlichen Gesetze und Vorschriften bezüglich der Einfuhr und Nutzung der gekauften Waren sicherzustellen.</li>
          <li>Alle zusätzlichen, bei der Zollabfertigung anfallenden Kosten, einschließlich von Post- oder Kurierdiensten erhobener Verwaltungsgebühren, trägt ausschließlich der Kunde.</li>
          <li>Der Unternehmer stellt die für die Sendung notwendigen Unterlagen bereit, garantiert jedoch nicht, dass die Waren den örtlichen Einfuhrbestimmungen entsprechen. Kunden wird empfohlen, die Einfuhrbestimmungen vor Bestellung zu prüfen.</li>
        </ol>

        <h2>Artikel 9 – CESOP</h2>
        <p>Ab 2024 erfassen Zahlungsdienstleister Transaktionen im EU-System CESOP. ${SHOP.name} hält sich an diese Vorschriften.</p>

        <h2>Artikel 10 – Vertragsgemäßheit und Gewährleistung</h2>
        <p>Produkte werden vertragsgemäß geliefert. Mängel müssen innerhalb von 14 Tagen schriftlich gemeldet werden. Rücksendungen müssen im Originalzustand und in der Originalverpackung erfolgen.</p>

        <h2>Artikel 11 – Lieferung</h2>
        <p>Im Falle einer Verzögerung erfolgt eine Benachrichtigung innerhalb von 30 Tagen. Der Kunde ist für einfuhrbezogene Vorgänge verantwortlich. ${SHOP.name} hält sich an internationale Versandregeln, ist jedoch nicht verantwortlich für Zollabfertigung, Verzögerungen oder Ablehnungen. Die Nichtzahlung von Zöllen berechtigt den Kunden nicht zu einer Rückerstattung.</p>

        <h2>Artikel 12 – Beschwerdeverfahren</h2>
        <p>Beschwerden müssen innerhalb von 7 Tagen nach Feststellung schriftlich eingereicht werden. Eine Antwort erfolgt innerhalb von 14 Tagen. Falls mehr Zeit benötigt wird, wird eine neue Frist mitgeteilt.</p>

        <h2>Artikel 13 – Streitigkeiten</h2>
        <p>Streitigkeiten unterliegen belgischem Recht. Die Parteien versuchen zunächst eine gütliche Einigung. Andernfalls wird der Fall dem zuständigen Gericht vorgelegt.</p>

        <h2>Artikel 14 – Preis</h2>
        <p>Preise bleiben während des Angebotszeitraums unverändert, sofern sich die Gesetzeslage nicht ändert. Preisänderungen innerhalb von 3 Monaten dürfen nur aufgrund gesetzlicher Änderungen erfolgen. Nach 3 Monaten nur, wenn der Verbraucher informiert wird und den Vertrag kündigen kann. Bei Lieferungen außerhalb der EU sind Einfuhrumsatzsteuer und Zölle bei der Einfuhr vom Kunden zu zahlen. Druck- und Schreibfehler bleiben vorbehalten; Produkte werden nicht zu fehlerhaften Preisen geliefert.</p>

        <h2>Artikel 15 – Rechtlicher Hinweis</h2>
        <p>${SHOP.name} ist ein unabhängiger Wiederverkäufer und mit keiner Marke verbunden. Markennamen und Logos gehören ihren jeweiligen Inhabern. Stilbezeichnungen dienen ausschließlich der Beschreibung.</p>

        <h2>Artikel 16 – Zahlung</h2>
        <p>Sofern nicht anders vereinbart, muss die Zahlung innerhalb von 7 Werktagen nach Beginn der Widerrufsfrist erfolgen. Fehler in den Zahlungsangaben sind dem Unternehmen unverzüglich zu melden. Bei Zahlungsverzug kann das Unternehmen zuvor angekündigte Kosten gemäß den gesetzlichen Vorgaben in Rechnung stellen.</p>

        <h2>Artikel 17 – Beschwerden</h2>
        <p>Beschwerden über die Durchführung des Vertrags müssen innerhalb von 7 Tagen nach Feststellung schriftlich und detailliert gemeldet werden. Eine Antwort erfolgt innerhalb von 14 Tagen. Falls die Bearbeitung länger dauert, werden ein Statusupdate und eine neue Frist mitgeteilt. Ungelöste Beschwerden gelten als Streitfall. Beschwerden setzen Verpflichtungen nicht aus, es sei denn, das Unternehmen bestätigt dies schriftlich. Ist die Beschwerde begründet, wird das Unternehmen das Produkt nach eigenem Ermessen kostenlos ersetzen oder reparieren.</p>

        <h2>Artikel 18 – Änderungen der Bedingungen</h2>
        <p>Die jeweils aktuellen Bedingungen sind stets auf unserer Website verfügbar. Wir behalten uns das Recht vor, sie jederzeit zu ändern. Die fortgesetzte Nutzung der Website nach Änderungen gilt als Zustimmung.</p>
      `,
    },
    FR: {
      title: 'Conditions Générales de Vente',
      intro: 'Les conditions générales applicables à chaque commande.',
      body: `
        <p>Les présentes Conditions Générales s'appliquent à toute offre et commande entre ${SHOP.name} et le consommateur.</p>

        <h2>Article 1 – Définitions</h2>
        <ul>
          <li><strong>Droit de rétractation :</strong> la période pendant laquelle le consommateur peut exercer son droit d'annuler l'accord.</li>
          <li><strong>Consommateur :</strong> une personne physique qui n'agit pas à des fins commerciales et conclut un contrat de vente à distance avec l'entreprise.</li>
          <li><strong>Accord continu :</strong> un contrat de vente à distance portant sur une série de produits ou services, dont les obligations s'étalent dans le temps.</li>
          <li><strong>Droit de rétractation :</strong> le droit du consommateur d'annuler l'accord pendant la période de rétractation.</li>
          <li><strong>Entreprise :</strong> la personne physique ou morale offrant des produits ou services à distance aux consommateurs.</li>
          <li><strong>Contrat de vente à distance :</strong> un accord conclu entre l'entreprise et le consommateur au moyen de communications à distance.</li>
          <li><strong>CESOP :</strong> le Système électronique central européen d'informations de paiement pour le contrôle des prestataires de services de paiement.</li>
        </ul>

        <h2>Article 2 – Identité de l'entreprise</h2>
        <ul>
          ${companyIdentityFR}
        </ul>

        <h2>Article 3 – Applicabilité</h2>
        <p>Ces conditions s'appliquent à toute offre, contrat de vente à distance et commande entre l'entreprise et le consommateur. Le consommateur a accès aux conditions avant de conclure l'accord. Si cela n'est pas possible, le consommateur sera informé de l'endroit où il peut consulter ou recevoir les conditions gratuitement.</p>
        <p>Pour les accords électroniques, les conditions sont fournies de manière à pouvoir être stockées sur un support durable. Si cela n'est pas possible, l'emplacement des conditions sera indiqué. En cas de conflit entre ces conditions et des conditions spécifiques de produit ou de service, les dispositions les plus favorables au consommateur s'appliquent. Les dispositions invalides n'affectent pas les autres conditions ; elles sont remplacées par des dispositions correspondant au mieux à l'intention initiale.</p>

        <h2>Article 4 – L'offre</h2>
        <p>Les offres sont sans engagement ; l'entreprise peut les modifier. Toute limitation ou condition des offres est clairement indiquée. Les descriptions de produits sont aussi précises que possible ; les couleurs et images peuvent varier. Les informations suivantes sont clairement indiquées :</p>
        <ul>
          <li>Les prix (hors droits de douane et TVA à l'importation – responsabilité du consommateur).</li>
          <li>Les éventuels frais de livraison.</li>
          <li>Comment l'accord est conclu et quelles étapes sont requises.</li>
        </ul>

        <h2>Article 5 – L'accord</h2>
        <p>L'accord est conclu lorsque le consommateur accepte l'offre et remplit les conditions. Pour une acceptation électronique, l'entreprise confirme immédiatement la réception. Jusque-là, le consommateur peut annuler l'accord. L'entreprise utilise des mesures de sécurité techniques et organisationnelles appropriées pour les transactions électroniques.</p>
        <p>L'entreprise peut demander des informations sur la capacité de paiement du consommateur. Sur cette base, des commandes peuvent être refusées ou des conditions spéciales appliquées. À la conclusion de l'accord, le consommateur reçoit des informations sur :</p>
        <ul>
          <li>Le droit de rétractation.</li>
          <li>La garantie et le service après-vente.</li>
          <li>D'autres informations pertinentes (voir Article 4).</li>
          <li>Les conditions de résiliation pour les accords à long terme.</li>
        </ul>
        <p>Tous les accords sont soumis à la disponibilité des produits.</p>

        <h2>Article 6 – Droit de rétractation</h2>
        <p>Le consommateur dispose d'un droit de rétractation de 14 jours à compter de la réception des biens. Les retours sont à la charge du consommateur. Les biens défectueux seront remboursés ou remplacés. Pendant la période de rétractation, le produit doit être traité avec soin. La rétractation doit être notifiée par écrit dans les 14 jours, après quoi le produit doit être retourné dans un délai supplémentaire de 14 jours. Une preuve de retour dans les délais doit être fournie. L'absence de notification ou de retour est considérée comme un achat définitif.</p>
        <p>Le droit de rétractation ne s'applique pas :</p>
        <ul>
          <li>Aux produits fabriqués sur mesure ou personnalisés.</li>
          <li>Aux articles portés, lavés ou modifiés, ou dont les étiquettes ont été retirées.</li>
          <li>Aux journaux, logiciels, enregistrements audio et vidéo dont l'emballage est ouvert.</li>
          <li>Aux services à date déterminée (hébergement, transport, loisirs).</li>
        </ul>
        <p>Le client garantit ${SHOP.name} contre les réclamations de tiers. L'entreprise n'est pas responsable des erreurs dans les descriptions de produits, sauf en cas de négligence grave.</p>

        <h2>Article 7 – Coûts de rétractation</h2>
        <p>Seuls les frais de retour sont à la charge du consommateur. Les montants payés seront remboursés dans les 14 jours suivant la réception des biens retournés.</p>

        <h2>Article 8 – Douane et TVA</h2>
        <ol>
          <li>Le client est seul responsable du respect de toutes les obligations légales relatives à l'importation de biens dans le pays de livraison, y compris le paiement des droits d'importation, taxes et frais de dédouanement.</li>
          <li>L'entrepreneur n'agit en aucun cas en tant qu'importateur officiel des produits expédiés au client.</li>
          <li>Le client est responsable de garantir le respect des lois et réglementations locales concernant l'importation et l'utilisation des biens achetés.</li>
          <li>Tous les frais supplémentaires engagés lors du dédouanement, y compris les frais administratifs imposés par le service postal ou de messagerie, sont exclusivement à la charge du client.</li>
          <li>L'entrepreneur fournit la documentation nécessaire à l'expédition mais ne garantit pas que les biens respecteront la réglementation locale d'importation. Il est conseillé aux clients de vérifier les exigences d'importation avant de passer commande.</li>
        </ol>

        <h2>Article 9 – CESOP</h2>
        <p>À partir de 2024, les prestataires de services de paiement enregistrent les transactions dans le système européen CESOP. ${SHOP.name} se conforme à ces règles.</p>

        <h2>Article 10 – Conformité et garantie</h2>
        <p>Les produits sont livrés conformément à l'accord. Les défauts doivent être signalés par écrit dans les 14 jours. Les retours doivent être dans leur état et emballage d'origine.</p>

        <h2>Article 11 – Livraison</h2>
        <p>En cas de retard, une notification sera donnée dans les 30 jours. Le client est responsable des démarches liées à l'importation. ${SHOP.name} respecte les règles d'expédition internationales mais n'est pas responsable du dédouanement, des retards ou des refus. Le non-paiement des droits de douane n'ouvre pas droit à un remboursement pour le client.</p>

        <h2>Article 12 – Procédure de réclamation</h2>
        <p>Les réclamations doivent être soumises par écrit dans les 7 jours suivant leur découverte. Une réponse sera fournie dans les 14 jours. Si plus de temps est nécessaire, un nouveau délai sera communiqué.</p>

        <h2>Article 13 – Litiges</h2>
        <p>Les litiges sont régis par le droit belge. Les parties tenteront d'abord un règlement amiable. À défaut, l'affaire sera soumise au tribunal compétent.</p>

        <h2>Article 14 – Prix</h2>
        <p>Les prix restent fixes pendant la période de l'offre, sauf changement législatif. Les changements de prix dans les 3 mois ne peuvent survenir qu'en raison de changements légaux. Après 3 mois, uniquement si le consommateur en est informé et peut résilier l'accord. Pour les livraisons hors UE, la TVA à l'importation et les droits de douane sont payés par le client à l'importation. Les erreurs typographiques et d'écriture sont réservées ; les produits ne sont pas livrés à des prix incorrects.</p>

        <h2>Article 15 – Mention légale</h2>
        <p>${SHOP.name} est un revendeur indépendant et n'est affilié à aucune marque. Les noms de marque et logos appartiennent à leurs propriétaires respectifs. Toute référence de style est purement descriptive.</p>

        <h2>Article 16 – Paiement</h2>
        <p>Sauf accord contraire, le paiement doit être effectué dans les 7 jours ouvrés suivant le début de la période de rétractation. Toute erreur dans les informations de paiement doit être immédiatement signalée à l'entreprise. En cas de non-paiement, l'entreprise peut facturer des frais préalablement notifiés conformément à la loi.</p>

        <h2>Article 17 – Réclamations</h2>
        <p>Les réclamations concernant l'exécution de l'accord doivent être signalées par écrit et en détail dans les 7 jours suivant leur découverte. Une réponse sera fournie dans les 14 jours. Si le traitement prend plus de temps, une mise à jour de statut et un nouveau délai seront communiqués. Les réclamations non résolues sont traitées comme un litige. Les réclamations ne suspendent pas les obligations, sauf confirmation écrite de l'entreprise. Si la réclamation est justifiée, l'entreprise remplacera ou réparera le produit gratuitement, à sa discrétion.</p>

        <h2>Article 18 – Modifications des conditions</h2>
        <p>Les conditions les plus récentes sont toujours disponibles sur notre site web. Nous nous réservons le droit de les modifier à tout moment. La poursuite de l'utilisation du site après modification vaut acceptation.</p>
      `,
    },
    ES: {
      title: 'Términos y Condiciones',
      intro: 'Los términos y condiciones que se aplican a cada pedido.',
      body: `
        <p>Estos Términos y Condiciones se aplican a toda oferta y pedido entre ${SHOP.name} y el consumidor.</p>

        <h2>Artículo 1 – Definiciones</h2>
        <ul>
          <li><strong>Derecho de desistimiento:</strong> el período durante el cual el consumidor puede ejercer su derecho a cancelar el acuerdo.</li>
          <li><strong>Consumidor:</strong> una persona física que no actúa con fines comerciales y celebra un contrato de venta a distancia con la empresa.</li>
          <li><strong>Acuerdo continuado:</strong> un contrato de venta a distancia relativo a una serie de productos o servicios, cuyas obligaciones se extienden en el tiempo.</li>
          <li><strong>Derecho a desistir:</strong> el derecho del consumidor a cancelar el acuerdo dentro del período de desistimiento.</li>
          <li><strong>Empresa:</strong> la persona física o jurídica que ofrece productos o servicios a distancia a los consumidores.</li>
          <li><strong>Contrato de venta a distancia:</strong> un acuerdo celebrado entre la empresa y el consumidor mediante comunicación a distancia.</li>
          <li><strong>CESOP:</strong> el Sistema Electrónico Central de Información de Pagos de la UE para supervisar a los proveedores de servicios de pago.</li>
        </ul>

        <h2>Artículo 2 – Identidad de la empresa</h2>
        <ul>
          ${companyIdentityES}
        </ul>

        <h2>Artículo 3 – Aplicabilidad</h2>
        <p>Estas condiciones se aplican a cualquier oferta, contrato de venta a distancia y pedido entre la empresa y el consumidor. El consumidor tiene acceso a las condiciones antes de celebrar el acuerdo. Si esto no es posible, se informará al consumidor de dónde puede consultarlas o recibirlas de forma gratuita.</p>
        <p>En los acuerdos electrónicos, las condiciones se proporcionan de manera que puedan almacenarse en un soporte duradero. Si esto no es posible, se indicará dónde se encuentran las condiciones. En caso de conflicto entre estas condiciones y las condiciones específicas de un producto o servicio, prevalecerán las disposiciones más favorables para el consumidor. Las disposiciones inválidas no afectan al resto de las condiciones; serán sustituidas por disposiciones que mejor se ajusten a la intención original.</p>

        <h2>Artículo 4 – La oferta</h2>
        <p>Las ofertas no son vinculantes; la empresa puede modificarlas. Cualquier limitación o condición de las ofertas se indica claramente. Las descripciones de los productos son lo más precisas posible; los colores e imágenes pueden variar. Se indica claramente la siguiente información:</p>
        <ul>
          <li>Precios (excluyendo aranceles aduaneros e IVA de importación, responsabilidad del consumidor).</li>
          <li>Cualquier coste de envío.</li>
          <li>Cómo se celebra el acuerdo y qué pasos son necesarios.</li>
        </ul>

        <h2>Artículo 5 – El acuerdo</h2>
        <p>El acuerdo se celebra cuando el consumidor acepta la oferta y cumple las condiciones. Para la aceptación electrónica, la empresa confirma inmediatamente la recepción. Hasta entonces, el consumidor puede cancelar el acuerdo. La empresa utiliza medidas de seguridad técnicas y organizativas adecuadas para las transacciones electrónicas.</p>
        <p>La empresa puede solicitar información sobre la capacidad de pago del consumidor. Sobre esta base, los pedidos pueden ser rechazados o aplicarse condiciones especiales. Al celebrarse el acuerdo, el consumidor recibe información sobre:</p>
        <ul>
          <li>El derecho de desistimiento.</li>
          <li>La garantía y el servicio posventa.</li>
          <li>Otra información relevante (ver Artículo 4).</li>
          <li>Las condiciones de terminación para acuerdos a largo plazo.</li>
        </ul>
        <p>Todos los acuerdos están sujetos a la disponibilidad del producto.</p>

        <h2>Artículo 6 – Derecho de desistimiento</h2>
        <p>El consumidor tiene un derecho de desistimiento de 14 días desde la recepción de los bienes. Las devoluciones corren por cuenta del consumidor. Los bienes defectuosos serán reembolsados o sustituidos. Durante el período de desistimiento, el producto debe tratarse con cuidado. El desistimiento debe notificarse por escrito en un plazo de 14 días, tras lo cual el producto debe devolverse en un plazo adicional de 14 días. Debe aportarse prueba de la devolución dentro de plazo. La falta de notificación o devolución se considera una compra definitiva.</p>
        <p>El derecho de desistimiento no se aplica a:</p>
        <ul>
          <li>Productos fabricados a medida o personalizados.</li>
          <li>Artículos que hayan sido usados, lavados o alterados, o cuyas etiquetas hayan sido retiradas.</li>
          <li>Periódicos, software, grabaciones de audio y vídeo con el embalaje abierto.</li>
          <li>Servicios con una fecha específica (alojamiento, transporte, ocio).</li>
        </ul>
        <p>El cliente exime a ${SHOP.name} de reclamaciones de terceros. La empresa no es responsable de errores en las descripciones de productos, salvo negligencia grave.</p>

        <h2>Artículo 7 – Costes del desistimiento</h2>
        <p>Solo los costes de envío de la devolución corren por cuenta del consumidor. Los importes pagados se reembolsarán en un plazo de 14 días desde la recepción de los bienes devueltos.</p>

        <h2>Artículo 8 – Aduanas e IVA</h2>
        <ol>
          <li>El cliente es el único responsable de cumplir con todas las obligaciones legales relativas a la importación de bienes al país de entrega, incluido el pago de aranceles de importación, impuestos y costes de despacho de aduana.</li>
          <li>El empresario no actúa como importador oficial de ningún producto enviado al cliente.</li>
          <li>El cliente es responsable de garantizar el cumplimiento de las leyes y normativas locales relativas a la importación y el uso de los bienes adquiridos.</li>
          <li>Todos los costes adicionales incurridos durante el despacho de aduana, incluidas las tasas administrativas impuestas por el servicio postal o de mensajería, corren exclusivamente por cuenta del cliente.</li>
          <li>El empresario proporciona la documentación necesaria para el envío, pero no garantiza que los bienes cumplan con la normativa local de importación. Se aconseja a los clientes verificar los requisitos de importación antes de realizar un pedido.</li>
        </ol>

        <h2>Artículo 9 – CESOP</h2>
        <p>A partir de 2024, los proveedores de servicios de pago registran las transacciones en el sistema CESOP de la UE. ${SHOP.name} cumple con estas normas.</p>

        <h2>Artículo 10 – Conformidad y garantía</h2>
        <p>Los productos se entregan de conformidad con el acuerdo. Los defectos deben notificarse por escrito en un plazo de 14 días. Las devoluciones deben realizarse en su estado y embalaje originales.</p>

        <h2>Artículo 11 – Entrega</h2>
        <p>En caso de retraso, se notificará en un plazo de 30 días. El cliente es responsable de los procesos relacionados con la importación. ${SHOP.name} sigue las normas internacionales de envío, pero no es responsable del despacho de aduana, retrasos o rechazos. El impago de aranceles no da derecho al cliente a un reembolso.</p>

        <h2>Artículo 12 – Procedimiento de reclamación</h2>
        <p>Las reclamaciones deben presentarse por escrito en un plazo de 7 días desde su descubrimiento. Se dará respuesta en un plazo de 14 días. Si se necesita más tiempo, se comunicará un nuevo plazo.</p>

        <h2>Artículo 13 – Disputas</h2>
        <p>Las disputas se rigen por la legislación belga. Las partes intentarán primero llegar a un acuerdo amistoso. De lo contrario, el caso se someterá al tribunal competente.</p>

        <h2>Artículo 14 – Precio</h2>
        <p>Los precios permanecen fijos durante el período de la oferta, salvo cambios legislativos. Los cambios de precio dentro de los 3 meses solo pueden producirse por cambios legales. Después de 3 meses, solo si se informa al consumidor y este puede rescindir el acuerdo. En las entregas fuera de la UE, el IVA de importación y los aranceles aduaneros los paga el cliente al importar. Se reservan los errores tipográficos y de transcripción; los productos no se entregan a precios incorrectos.</p>

        <h2>Artículo 15 – Aviso legal</h2>
        <p>${SHOP.name} es un revendedor independiente y no está afiliado a ninguna marca. Los nombres y logotipos de marcas pertenecen a sus respectivos propietarios. Cualquier referencia de estilo es meramente descriptiva.</p>

        <h2>Artículo 16 – Pago</h2>
        <p>Salvo acuerdo en contrario, el pago debe realizarse dentro de los 7 días laborables siguientes al inicio del período de desistimiento. Los errores en los datos de pago deben notificarse inmediatamente a la empresa. En caso de impago, la empresa podrá cobrar los costes previamente notificados de conformidad con la ley.</p>

        <h2>Artículo 17 – Quejas</h2>
        <p>Las quejas sobre la ejecución del acuerdo deben notificarse por escrito y en detalle en un plazo de 7 días desde su descubrimiento. Se dará respuesta en un plazo de 14 días. Si el procesamiento requiere más tiempo, se proporcionará una actualización del estado y un nuevo plazo. Las quejas no resueltas se tratan como una disputa. Las quejas no suspenden las obligaciones a menos que la empresa lo confirme por escrito. Si la queja está justificada, la empresa sustituirá o reparará el producto de forma gratuita, a su discreción.</p>

        <h2>Artículo 18 – Cambios en las condiciones</h2>
        <p>Las condiciones más recientes están siempre disponibles en nuestro sitio web. Nos reservamos el derecho de modificarlas en cualquier momento. El uso continuado del sitio web tras los cambios constituye la aceptación de los mismos.</p>
      `,
    },
    IT: {
      title: 'Termini e Condizioni',
      intro: 'I termini e le condizioni che si applicano a ogni ordine.',
      body: `
        <p>I presenti Termini e Condizioni si applicano a ogni offerta e ordine tra ${SHOP.name} e il consumatore.</p>

        <h2>Articolo 1 – Definizioni</h2>
        <ul>
          <li><strong>Diritto di recesso:</strong> il periodo durante il quale il consumatore può esercitare il proprio diritto di annullare il contratto.</li>
          <li><strong>Consumatore:</strong> una persona fisica che non agisce per scopi commerciali e conclude un contratto a distanza con l'azienda.</li>
          <li><strong>Accordo continuativo:</strong> un contratto di vendita a distanza relativo a una serie di prodotti o servizi, i cui obblighi si estendono nel tempo.</li>
          <li><strong>Diritto di recedere:</strong> il diritto del consumatore di annullare il contratto entro il periodo di recesso.</li>
          <li><strong>Azienda (Imprenditore):</strong> la persona fisica o giuridica che offre prodotti o servizi a distanza ai consumatori.</li>
          <li><strong>Contratto a distanza:</strong> un accordo concluso tra l'azienda e il consumatore mediante comunicazione a distanza.</li>
          <li><strong>CESOP:</strong> il Sistema Elettronico Centrale Europeo di Informazioni sui Pagamenti per il monitoraggio dei prestatori di servizi di pagamento.</li>
        </ul>

        <h2>Articolo 2 – Identità dell'azienda</h2>
        <ul>
          ${companyIdentityIT}
        </ul>

        <h2>Articolo 3 – Applicabilità</h2>
        <p>Questi termini si applicano a qualsiasi offerta, contratto a distanza e ordine tra l'azienda e il consumatore. Il consumatore ha accesso ai termini prima di concludere il contratto. Se ciò non è possibile, il consumatore sarà informato su dove poterli visionare o ricevere gratuitamente.</p>
        <p>Per gli accordi elettronici, i termini sono forniti in modo tale da poter essere memorizzati su un supporto durevole. Se ciò non è possibile, verrà indicata la posizione dei termini. In caso di conflitto tra questi termini e i termini specifici di prodotto o servizio, si applicheranno le disposizioni più favorevoli al consumatore. Le disposizioni non valide non influiscono sui restanti termini; saranno sostituite da disposizioni che meglio corrispondono all'intento originale.</p>

        <h2>Articolo 4 – L'offerta</h2>
        <p>Le offerte non sono vincolanti; l'azienda può modificarle. Eventuali limitazioni o condizioni delle offerte sono chiaramente indicate. Le descrizioni dei prodotti sono il più accurate possibile; i colori e le immagini possono variare. Le seguenti informazioni sono chiaramente indicate:</p>
        <ul>
          <li>Prezzi (esclusi dazi doganali e IVA all'importazione – responsabilità del consumatore).</li>
          <li>Eventuali costi di spedizione.</li>
          <li>Come viene concluso l'accordo e quali passaggi sono richiesti.</li>
        </ul>

        <h2>Articolo 5 – L'accordo</h2>
        <p>L'accordo si conclude quando il consumatore accetta l'offerta e soddisfa le condizioni. Per l'accettazione elettronica, l'azienda conferma immediatamente la ricezione. Fino ad allora, il consumatore può annullare l'accordo. L'azienda utilizza adeguate misure di sicurezza tecniche e organizzative per le transazioni elettroniche.</p>
        <p>L'azienda può richiedere informazioni sulla capacità di pagamento del consumatore. Su questa base, gli ordini possono essere rifiutati o possono essere applicate condizioni speciali. Alla conclusione dell'accordo, il consumatore riceve informazioni su:</p>
        <ul>
          <li>Il diritto di recesso.</li>
          <li>Garanzia e assistenza post-vendita.</li>
          <li>Altre informazioni rilevanti (vedi Articolo 4).</li>
          <li>Condizioni di risoluzione per accordi a lungo termine.</li>
        </ul>
        <p>Tutti gli accordi sono soggetti alla disponibilità dei prodotti.</p>

        <h2>Articolo 6 – Diritto di recesso</h2>
        <p>Il consumatore ha un diritto di recesso di 14 giorni dal ricevimento della merce. I resi sono a spese del consumatore. La merce difettosa sarà rimborsata o sostituita. Durante il periodo di recesso, il prodotto deve essere trattato con cura. Il recesso deve essere notificato per iscritto entro 14 giorni, dopodiché il prodotto deve essere restituito entro ulteriori 14 giorni. Deve essere fornita la prova della restituzione tempestiva. La mancata notifica o restituzione è considerata un acquisto definitivo.</p>
        <p>Il diritto di recesso non si applica a:</p>
        <ul>
          <li>Prodotti realizzati su misura o personalizzati.</li>
          <li>Articoli indossati, lavati o alterati, o le cui etichette siano state rimosse.</li>
          <li>Giornali, software, registrazioni audio e video con imballaggio manomesso.</li>
          <li>Servizi con una data specifica (alloggio, trasporto, tempo libero).</li>
        </ul>
        <p>Il cliente manleva ${SHOP.name} da eventuali reclami di terzi. L'azienda non è responsabile di errori nelle descrizioni dei prodotti, salvo negligenza grave.</p>

        <h2>Articolo 7 – Costi del recesso</h2>
        <p>Solo i costi di spedizione del reso sono a carico del consumatore. Gli importi pagati saranno rimborsati entro 14 giorni dal ricevimento della merce restituita.</p>

        <h2>Articolo 8 – Dogana e IVA</h2>
        <ol>
          <li>Il cliente è l'unico responsabile dell'adempimento di tutti gli obblighi legali relativi all'importazione di merci nel paese di consegna, compreso il pagamento di dazi d'importazione, tasse e costi di sdoganamento.</li>
          <li>L'imprenditore non agisce come importatore ufficiale di alcun prodotto spedito al cliente.</li>
          <li>Il cliente è responsabile di garantire la conformità alle leggi e ai regolamenti locali relativi all'importazione e all'uso dei beni acquistati.</li>
          <li>Tutti i costi aggiuntivi sostenuti durante lo sdoganamento, comprese le spese amministrative imposte dal servizio postale o di corriere, sono a carico esclusivo del cliente.</li>
          <li>L'imprenditore fornisce la documentazione necessaria per la spedizione ma non garantisce che i beni soddisfino le normative locali di importazione. Si consiglia ai clienti di verificare i requisiti di importazione prima di effettuare un ordine.</li>
        </ol>

        <h2>Articolo 9 – CESOP</h2>
        <p>Dal 2024, i prestatori di servizi di pagamento registrano le transazioni nel sistema UE CESOP. ${SHOP.name} rispetta queste norme.</p>

        <h2>Articolo 10 – Conformità e garanzia</h2>
        <p>I prodotti vengono consegnati in conformità con l'accordo. I difetti devono essere segnalati per iscritto entro 14 giorni. I resi devono essere effettuati nelle condizioni e nell'imballaggio originali.</p>

        <h2>Articolo 11 – Consegna</h2>
        <p>In caso di ritardo, verrà data comunicazione entro 30 giorni. Il cliente è responsabile dei processi relativi all'importazione. ${SHOP.name} rispetta le norme internazionali di spedizione ma non è responsabile dello sdoganamento, dei ritardi o dei rifiuti. Il mancato pagamento dei dazi doganali non dà diritto al cliente a un rimborso.</p>

        <h2>Articolo 12 – Procedura di reclamo</h2>
        <p>I reclami devono essere presentati per iscritto entro 7 giorni dalla scoperta. Verrà fornita una risposta entro 14 giorni. Se è necessario più tempo, verrà comunicata una nuova scadenza.</p>

        <h2>Articolo 13 – Controversie</h2>
        <p>Le controversie sono disciplinate dalla legge belga. Le parti tenteranno prima una composizione amichevole. In caso contrario, la causa sarà sottoposta al tribunale competente.</p>

        <h2>Articolo 14 – Prezzo</h2>
        <p>I prezzi rimangono fissi durante il periodo dell'offerta, salvo modifiche legislative. Le variazioni di prezzo entro 3 mesi possono verificarsi solo a causa di modifiche legali. Dopo 3 mesi, solo se il consumatore ne è informato e può recedere dall'accordo. Per le consegne al di fuori dell'UE, l'IVA all'importazione e i dazi doganali sono a carico del cliente all'importazione. Sono riservati errori tipografici e di trascrizione; i prodotti non vengono consegnati a prezzi errati.</p>

        <h2>Articolo 15 – Avviso legale</h2>
        <p>${SHOP.name} è un rivenditore indipendente e non è affiliato ad alcun marchio. I nomi dei marchi e i loghi appartengono ai rispettivi proprietari. Qualsiasi riferimento di stile è puramente descrittivo.</p>

        <h2>Articolo 16 – Pagamento</h2>
        <p>Salvo diverso accordo, il pagamento deve essere effettuato entro 7 giorni lavorativi dall'inizio del periodo di recesso. Eventuali errori nei dati di pagamento devono essere immediatamente segnalati all'azienda. In caso di mancato pagamento, l'azienda può addebitare costi precedentemente notificati in conformità con la legge.</p>

        <h2>Articolo 17 – Reclami</h2>
        <p>I reclami relativi all'esecuzione dell'accordo devono essere segnalati per iscritto e in dettaglio entro 7 giorni dalla scoperta. Verrà fornita una risposta entro 14 giorni. Se l'elaborazione richiede più tempo, verranno comunicati un aggiornamento sullo stato e una nuova scadenza. I reclami irrisolti sono trattati come una controversia. I reclami non sospendono gli obblighi a meno che l'azienda non lo confermi per iscritto. Se il reclamo è giustificato, l'azienda sostituirà o riparerà il prodotto gratuitamente, a propria discrezione.</p>

        <h2>Articolo 18 – Modifiche ai termini</h2>
        <p>I termini più aggiornati sono sempre disponibili sul nostro sito web. Ci riserviamo il diritto di modificarli in qualsiasi momento. L'uso continuato del sito web dopo le modifiche costituisce accettazione.</p>
      `,
    },
    SV: {
      title: 'Allmänna villkor',
      intro: 'Villkoren som gäller för varje beställning.',
      body: `
        <p>Dessa Allmänna villkor gäller för varje erbjudande och beställning mellan ${SHOP.name} och konsumenten.</p>

        <h2>Artikel 1 – Definitioner</h2>
        <ul>
          <li><strong>Ångerrätt:</strong> perioden under vilken konsumenten kan utöva sin rätt att avbryta avtalet.</li>
          <li><strong>Konsument:</strong> en fysisk person som inte agerar i kommersiellt syfte och ingår ett distansavtal med företaget.</li>
          <li><strong>Löpande avtal:</strong> ett distansavtal avseende en serie produkter eller tjänster, där skyldigheterna sträcker sig över tid.</li>
          <li><strong>Rätt att frånträda:</strong> konsumentens rätt att avbryta avtalet inom ångerfristen.</li>
          <li><strong>Företag:</strong> den fysiska eller juridiska person som erbjuder produkter eller tjänster på distans till konsumenter.</li>
          <li><strong>Distansavtal:</strong> ett avtal som ingås mellan företaget och konsumenten med hjälp av distanskommunikation.</li>
          <li><strong>CESOP:</strong> EU:s centrala elektroniska system för betalningsinformation för övervakning av betaltjänstleverantörer.</li>
        </ul>

        <h2>Artikel 2 – Företagets identitet</h2>
        <ul>
          ${companyIdentitySV}
        </ul>

        <h2>Artikel 3 – Tillämplighet</h2>
        <p>Dessa villkor gäller för alla erbjudanden, distansavtal och beställningar mellan företaget och konsumenten. Konsumenten har tillgång till villkoren innan avtalet ingås. Om detta inte är möjligt informeras konsumenten om var villkoren kan visas eller erhållas kostnadsfritt.</p>
        <p>För elektroniska avtal tillhandahålls villkoren på ett sätt som gör att de kan lagras på ett varaktigt medium. Om detta inte är möjligt anges var villkoren finns. Vid konflikt mellan dessa villkor och specifika produkt- eller tjänstevillkor gäller de bestämmelser som är mest fördelaktiga för konsumenten. Ogiltiga bestämmelser påverkar inte de återstående villkoren; de ersätts av bestämmelser som bäst motsvarar den ursprungliga avsikten.</p>

        <h2>Artikel 4 – Erbjudandet</h2>
        <p>Erbjudanden är icke-bindande; företaget kan ändra dem. Eventuella begränsningar eller villkor för erbjudanden anges tydligt. Produktbeskrivningar är så exakta som möjligt; färger och bilder kan variera. Följande information anges tydligt:</p>
        <ul>
          <li>Priser (exklusive tullavgifter och importmoms – konsumentens ansvar).</li>
          <li>Eventuella fraktkostnader.</li>
          <li>Hur avtalet ingås och vilka steg som krävs.</li>
        </ul>

        <h2>Artikel 5 – Avtalet</h2>
        <p>Avtalet ingås när konsumenten accepterar erbjudandet och uppfyller villkoren. Vid elektroniskt godkännande bekräftar företaget omedelbart mottagandet. Fram till dess kan konsumenten avbryta avtalet. Företaget använder lämpliga tekniska och organisatoriska säkerhetsåtgärder för elektroniska transaktioner.</p>
        <p>Företaget kan begära information om konsumentens betalningsförmåga. Utifrån detta kan beställningar nekas eller särskilda villkor tillämpas. Vid avtalets ingående får konsumenten information om:</p>
        <ul>
          <li>Ångerrätten.</li>
          <li>Garanti och service efter köp.</li>
          <li>Annan relevant information (se Artikel 4).</li>
          <li>Villkor för uppsägning av långsiktiga avtal.</li>
        </ul>
        <p>Alla avtal är föremål för produkttillgänglighet.</p>

        <h2>Artikel 6 – Ångerrätt</h2>
        <p>Konsumenten har 14 dagars ångerrätt från mottagandet av varorna. Returer sker på konsumentens egen bekostnad. Defekta varor återbetalas eller ersätts. Under ångerfristen ska produkten behandlas varsamt. Ångerrätten måste meddelas skriftligen inom 14 dagar, varefter produkten måste returneras inom ytterligare 14 dagar. Bevis på returnering i tid måste tillhandahållas. Utebliven anmälan eller retur betraktas som ett slutgiltigt köp.</p>
        <p>Ångerrätten gäller inte för:</p>
        <ul>
          <li>Skräddarsydda eller personanpassade produkter.</li>
          <li>Varor som har använts, tvättats eller ändrats, eller vars etiketter eller taggar har tagits bort.</li>
          <li>Tidningar, mjukvara, ljud- och videoinspelningar med bruten förpackning.</li>
          <li>Tjänster med ett specifikt datum (boende, transport, fritid).</li>
        </ul>
        <p>Kunden håller ${SHOP.name} skadeslöst mot krav från tredje part. Företaget ansvarar inte för fel i produktbeskrivningar såvida det inte beror på grov oaktsamhet.</p>

        <h2>Artikel 7 – Kostnader för ångerrätt</h2>
        <p>Endast returfraktkostnaderna betalas av konsumenten. Betalda belopp återbetalas inom 14 dagar från mottagandet av de returnerade varorna.</p>

        <h2>Artikel 8 – Tull och moms</h2>
        <ol>
          <li>Kunden är ensam ansvarig för att uppfylla alla lagliga skyldigheter avseende import av varor till leveranslandet, inklusive betalning av importavgifter, skatter och tullhanteringskostnader.</li>
          <li>Näringsidkaren agerar inte som registrerad importör för några produkter som skickas till kunden.</li>
          <li>Kunden ansvarar för att säkerställa efterlevnad av lokala lagar och förordningar avseende import och användning av de köpta varorna.</li>
          <li>Alla ytterligare kostnader som uppstår under tullhantering, inklusive administrativa avgifter som tas ut av post- eller kurirtjänsten, bärs uteslutande av kunden.</li>
          <li>Näringsidkaren tillhandahåller nödvändig dokumentation för leveransen men garanterar inte att varorna uppfyller lokala importbestämmelser. Kunder rekommenderas att kontrollera importkraven innan de lägger en beställning.</li>
        </ol>

        <h2>Artikel 9 – CESOP</h2>
        <p>Från och med 2024 registrerar betaltjänstleverantörer transaktioner i EU:s CESOP-system. ${SHOP.name} följer dessa regler.</p>

        <h2>Artikel 10 – Avtalsenlighet och garanti</h2>
        <p>Produkter levereras i enlighet med avtalet. Fel måste rapporteras skriftligen inom 14 dagar. Returer måste vara i originalskick och originalförpackning.</p>

        <h2>Artikel 11 – Leverans</h2>
        <p>Vid förseningar lämnas besked inom 30 dagar. Kunden ansvarar för importrelaterade processer. ${SHOP.name} följer internationella fraktregler men ansvarar inte för tullhantering, förseningar eller avslag. Utebliven betalning av tull ger inte kunden rätt till återbetalning.</p>

        <h2>Artikel 12 – Klagomålsförfarande</h2>
        <p>Klagomål måste lämnas skriftligen inom 7 dagar efter upptäckt. Ett svar ges inom 14 dagar. Om mer tid behövs kommuniceras en ny tidsfrist.</p>

        <h2>Artikel 13 – Tvister</h2>
        <p>Tvister regleras av belgisk lag. Parterna ska först försöka nå en uppgörelse i godo. I annat fall hänskjuts ärendet till behörig domstol.</p>

        <h2>Artikel 14 – Pris</h2>
        <p>Priserna förblir fasta under erbjudandeperioden om inte lagstiftningen ändras. Prisändringar inom 3 månader får endast ske på grund av lagändringar. Efter 3 månader endast om konsumenten informeras och kan säga upp avtalet. Vid leverans utanför EU betalas importmoms och tullavgifter av kunden vid import. Tryck- och skrivfel förbehålls; produkter levereras inte till felaktiga priser.</p>

        <h2>Artikel 15 – Juridiskt meddelande</h2>
        <p>${SHOP.name} är en oberoende återförsäljare och är inte anknuten till något varumärke. Varumärkesnamn och logotyper tillhör respektive ägare. Eventuella stilhänvisningar är enbart beskrivande.</p>

        <h2>Artikel 16 – Betalning</h2>
        <p>Om inget annat avtalats ska betalning ske inom 7 arbetsdagar efter ångerfristens början. Fel i betalningsuppgifter måste omedelbart rapporteras till företaget. Vid utebliven betalning kan företaget ta ut i förväg meddelade kostnader i enlighet med lagen.</p>

        <h2>Artikel 17 – Klagomål</h2>
        <p>Klagomål om avtalets genomförande måste rapporteras skriftligen och i detalj inom 7 dagar efter upptäckt. Ett svar ges inom 14 dagar. Om behandlingen tar längre tid lämnas en statusuppdatering och en ny tidsfrist. Olösta klagomål behandlas som en tvist. Klagomål upphäver inte skyldigheter om inte företaget bekräftar detta skriftligen. Om klagomålet är berättigat kommer företaget, efter eget gottfinnande, att ersätta eller reparera produkten kostnadsfritt.</p>

        <h2>Artikel 18 – Ändringar av villkoren</h2>
        <p>De senaste villkoren finns alltid tillgängliga på vår webbplats. Vi förbehåller oss rätten att ändra dem när som helst. Fortsatt användning av webbplatsen efter ändringar utgör godkännande.</p>
      `,
    },
    TR: {
      title: 'Hizmet Şartları',
      intro: 'Her siparişe uygulanan şartlar ve koşullar.',
      body: `
        <p>Bu Şartlar ve Koşullar, ${SHOP.name} ile tüketici arasındaki her teklif ve sipariş için geçerlidir.</p>

        <h2>Madde 1 – Tanımlar</h2>
        <ul>
          <li><strong>Cayma Hakkı:</strong> tüketicinin sözleşmeyi iptal etme hakkını kullanabileceği süre.</li>
          <li><strong>Tüketici:</strong> ticari amaçla hareket etmeyen ve şirketle bir mesafeli satış sözleşmesi yapan gerçek kişi.</li>
          <li><strong>Süreklilik Arz Eden Sözleşme:</strong> yükümlülüklerin zaman içine yayıldığı, bir dizi ürün veya hizmete ilişkin mesafeli satış sözleşmesi.</li>
          <li><strong>Cayma Hakkı:</strong> tüketicinin sözleşmeyi cayma süresi içinde iptal etme hakkı.</li>
          <li><strong>Şirket (Girişimci):</strong> tüketicilere uzaktan ürün veya hizmet sunan gerçek veya tüzel kişi.</li>
          <li><strong>Mesafeli Satış Sözleşmesi:</strong> şirket ile tüketici arasında uzaktan iletişim araçları kullanılarak akdedilen sözleşme.</li>
          <li><strong>CESOP:</strong> ödeme hizmeti sağlayıcılarını izlemek için AB Merkezi Elektronik Ödeme Bilgi Sistemi.</li>
        </ul>

        <h2>Madde 2 – Şirket kimliği</h2>
        <ul>
          ${companyIdentityTR}
        </ul>

        <h2>Madde 3 – Uygulanabilirlik</h2>
        <p>Bu şartlar, şirket ile tüketici arasındaki her teklif, mesafeli satış sözleşmesi ve sipariş için geçerlidir. Tüketici, sözleşmeyi akdetmeden önce şartlara erişebilir. Bu mümkün değilse, tüketici şartları nerede görüntüleyebileceği veya ücretsiz olarak alabileceği konusunda bilgilendirilir.</p>
        <p>Elektronik sözleşmeler için şartlar, kalıcı bir ortamda saklanabilecek şekilde sunulur. Bu mümkün değilse, şartların bulunduğu yer belirtilir. Bu şartlar ile belirli ürün veya hizmet şartları arasında çelişki olması halinde, tüketici lehine olan hükümler uygulanır. Geçersiz hükümler diğer şartları etkilemez; bunlar orijinal amaca en uygun hükümlerle değiştirilir.</p>

        <h2>Madde 4 – Teklif</h2>
        <p>Teklifler bağlayıcı değildir; şirket bunları değiştirebilir. Tekliflerin herhangi bir sınırlaması veya koşulu açıkça belirtilir. Ürün açıklamaları mümkün olduğunca doğrudur; renkler ve görseller farklılık gösterebilir. Aşağıdaki bilgiler açıkça belirtilir:</p>
        <ul>
          <li>Fiyatlar (gümrük vergileri ve ithalat KDV'si hariç – tüketicinin sorumluluğundadır).</li>
          <li>Varsa kargo ücretleri.</li>
          <li>Sözleşmenin nasıl akdedildiği ve hangi adımların gerekli olduğu.</li>
        </ul>

        <h2>Madde 5 – Sözleşme</h2>
        <p>Sözleşme, tüketicinin teklifi kabul etmesi ve koşulları karşılamasıyla akdedilir. Elektronik kabul için şirket, alımı derhal onaylar. Bu ana kadar tüketici sözleşmeyi iptal edebilir. Şirket, elektronik işlemler için uygun teknik ve organizasyonel güvenlik önlemleri kullanır.</p>
        <p>Şirket, tüketicinin ödeme gücü hakkında bilgi talep edebilir. Buna dayanarak siparişler reddedilebilir veya özel koşullar uygulanabilir. Sözleşmenin akdedilmesi üzerine tüketici şu konularda bilgi alır:</p>
        <ul>
          <li>Cayma hakkı.</li>
          <li>Garanti ve satış sonrası hizmet.</li>
          <li>Diğer ilgili bilgiler (bkz. Madde 4).</li>
          <li>Uzun vadeli sözleşmeler için fesih koşulları.</li>
        </ul>
        <p>Tüm sözleşmeler ürün müsaitliğine tabidir.</p>

        <h2>Madde 6 – Cayma hakkı</h2>
        <p>Tüketici, malların teslim alınmasından itibaren 14 günlük cayma hakkına sahiptir. İadeler tüketicinin kendi masrafıyla yapılır. Kusurlu mallar iade edilir veya değiştirilir. Cayma süresi boyunca ürün özenle kullanılmalıdır. Cayma, 14 gün içinde yazılı olarak bildirilmeli, ardından ürün ek 14 gün içinde iade edilmelidir. Zamanında iade edildiğine dair kanıt sunulmalıdır. Bildirimin veya iadenin yapılmaması, kesin bir satın alma olarak kabul edilir.</p>
        <p>Cayma hakkı şunlar için geçerli değildir:</p>
        <ul>
          <li>Özel yapım veya kişiselleştirilmiş ürünler.</li>
          <li>Giyilmiş, yıkanmış veya değiştirilmiş ya da etiketleri çıkarılmış ürünler.</li>
          <li>Ambalajı açılmış gazeteler, yazılımlar, ses ve video kayıtları.</li>
          <li>Belirli bir tarihe sahip hizmetler (konaklama, ulaşım, eğlence).</li>
        </ul>
        <p>Müşteri, ${SHOP.name}'i üçüncü taraf taleplerine karşı zararsız tutar. Şirket, ağır ihmal kaynaklı olmadıkça ürün açıklamalarındaki hatalardan sorumlu değildir.</p>

        <h2>Madde 7 – Cayma masrafları</h2>
        <p>Yalnızca iade kargo ücretleri tüketici tarafından ödenir. Ödenen tutarlar, iade edilen malların teslim alınmasından itibaren 14 gün içinde geri ödenir.</p>

        <h2>Madde 8 – Gümrük ve KDV</h2>
        <ol>
          <li>Müşteri, ithalat vergileri, resimleri ve gümrükleme masraflarının ödenmesi dahil olmak üzere, malların teslimat ülkesine ithal edilmesiyle ilgili tüm yasal yükümlülüklerin yerine getirilmesinden tek başına sorumludur.</li>
          <li>Girişimci, müşteriye gönderilen hiçbir ürün için kayıtlı ithalatçı olarak hareket etmez.</li>
          <li>Müşteri, satın alınan malların ithalatı ve kullanımıyla ilgili yerel yasa ve düzenlemelere uyumu sağlamaktan sorumludur.</li>
          <li>Posta veya kurye hizmeti tarafından uygulanan idari ücretler dahil olmak üzere gümrükleme sırasında oluşan tüm ek maliyetler yalnızca müşteri tarafından karşılanır.</li>
          <li>Girişimci, gönderi için gerekli belgeleri sağlar ancak malların yerel ithalat düzenlemelerine uygun olacağını garanti etmez. Müşterilere, sipariş vermeden önce ithalat gereksinimlerini kontrol etmeleri tavsiye edilir.</li>
        </ol>

        <h2>Madde 9 – CESOP</h2>
        <p>2024'ten itibaren, ödeme hizmeti sağlayıcıları işlemleri AB CESOP sisteminde kaydeder. ${SHOP.name} bu kurallara uyar.</p>

        <h2>Madde 10 – Uygunluk ve garanti</h2>
        <p>Ürünler sözleşmeye uygun olarak teslim edilir. Kusurlar 14 gün içinde yazılı olarak bildirilmelidir. İadeler orijinal durumda ve ambalajında olmalıdır.</p>

        <h2>Madde 11 – Teslimat</h2>
        <p>Gecikme durumunda, 30 gün içinde bildirim yapılır. Müşteri, ithalatla ilgili süreçlerden sorumludur. ${SHOP.name} uluslararası kargo kurallarına uyar ancak gümrükleme, gecikmeler veya reddedilmelerden sorumlu değildir. Gümrük ücretlerinin ödenmemesi, müşteriye geri ödeme hakkı vermez.</p>

        <h2>Madde 12 – Şikayet prosedürü</h2>
        <p>Şikayetler, fark edilmesinden itibaren 7 gün içinde yazılı olarak sunulmalıdır. 14 gün içinde yanıt verilir. Daha fazla zamana ihtiyaç duyulursa, yeni bir son tarih bildirilir.</p>

        <h2>Madde 13 – Uyuşmazlıklar</h2>
        <p>Uyuşmazlıklar Belçika yasalarına tabidir. Taraflar önce dostane bir çözüm bulmaya çalışacaktır. Aksi takdirde, dava yetkili mahkemeye sunulur.</p>

        <h2>Madde 14 – Fiyat</h2>
        <p>Fiyatlar, yasal değişiklikler olmadıkça teklif dönemi boyunca sabit kalır. 3 ay içindeki fiyat değişiklikleri yalnızca yasal değişiklikler nedeniyle gerçekleşebilir. 3 aydan sonra, yalnızca tüketici bilgilendirilir ve sözleşmeyi feshedebilirse. AB dışına yapılan teslimatlarda ithalat KDV'si ve gümrük vergileri ithalat sırasında müşteri tarafından ödenir. Baskı ve yazım hataları saklıdır; ürünler hatalı fiyatlarla teslim edilmez.</p>

        <h2>Madde 15 – Yasal uyarı</h2>
        <p>${SHOP.name} bağımsız bir satıcıdır ve hiçbir markayla bağlantılı değildir. Marka isimleri ve logoları kendi sahiplerine aittir. Herhangi bir stil referansı yalnızca açıklayıcı niteliktedir.</p>

        <h2>Madde 16 – Ödeme</h2>
        <p>Aksi kararlaştırılmadıkça, ödeme cayma süresinin başlamasından itibaren 7 iş günü içinde yapılmalıdır. Ödeme bilgilerindeki hatalar derhal şirkete bildirilmelidir. Ödeme yapılmaması durumunda şirket, kanuna uygun olarak önceden bildirilen maliyetleri tahsil edebilir.</p>

        <h2>Madde 17 – Şikayetler</h2>
        <p>Sözleşmenin ifasına ilişkin şikayetler, fark edilmesinden itibaren 7 gün içinde yazılı ve ayrıntılı olarak bildirilmelidir. 14 gün içinde yanıt verilir. İşlem daha uzun sürerse, bir durum güncellemesi ve yeni bir son tarih bildirilir. Çözülmemiş şikayetler bir uyuşmazlık olarak ele alınır. Şirket tarafından yazılı olarak onaylanmadıkça şikayetler yükümlülükleri askıya almaz. Şikayet haklı bulunursa, şirket kendi takdirine bağlı olarak ürünü ücretsiz olarak değiştirir veya onarır.</p>

        <h2>Madde 18 – Şartlarda değişiklik</h2>
        <p>En güncel şartlar her zaman web sitemizde mevcuttur. Bunları istediğimiz zaman değiştirme hakkını saklı tutarız. Değişikliklerden sonra web sitesinin kullanılmaya devam edilmesi, kabul edildiği anlamına gelir.</p>
      `,
    },
  },
};

/** Title + intro only, for the policy index cards. */
export function localizePolicySummary(
  policy: PolicyEntry,
  language: Language,
): {title: string; intro: string} {
  if (language === 'EN') return {title: policy.title, intro: policy.intro};
  const translation =
    POLICY_TRANSLATIONS[policy.handle]?.[language as TranslatedLanguage];
  if (!translation) return {title: policy.title, intro: policy.intro};
  return {
    title: translation.title ?? policy.title,
    intro: translation.intro,
  };
}

/** Full policy content (title/updated/body) for the given language. */
export function getLocalizedPolicy(
  handle: string,
  language: Language,
): {title: string; updated: string; intro: string; body: string} | undefined {
  const base = getPolicy(handle);
  if (!base) return undefined;
  if (language === 'EN') return base;

  const translation = POLICY_TRANSLATIONS[handle]?.[language as TranslatedLanguage];
  if (!translation) return base;

  const disclaimer = translate(
    'This policy is published in several languages. In case of any discrepancy, the English version prevails.',
    language,
  );

  return {
    title: translation.title ?? base.title,
    updated: base.updated,
    intro: translation.intro,
    body: `${translation.body}\n<p><em>${disclaimer}</em></p>`,
  };
}
