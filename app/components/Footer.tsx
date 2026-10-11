import {useEffect, useRef} from 'react';
import {NavLink, useFetcher} from 'react-router';
import type {I18nBase} from '@shopify/hydrogen';
import {
  LocaleMenu,
} from '~/components/CountrySelector';
import {PaymentIcons} from '~/components/PaymentIcons';
import {useLocalizedHref} from '~/lib/localizedLink';
import {BRAND_LOCKUP, SHOP} from '~/data/shop';
import {useTranslate} from '~/lib/useTranslate';
import {rememberIdentity} from '~/lib/identity';

interface FooterProps {
  selectedLocale?: I18nBase;
}

const HELP_LINKS = [
  {label: 'Contact us', to: '/pages/contact'},
  {label: 'Track my order', to: '/pages/track-order'},
  {label: 'Shipping & delivery', to: '/pages/shipping'},
  {label: 'Refund policy', to: '/policies/refund-policy'},
  {label: 'FAQ', to: '/pages/faq'},
];

const SHOP_LINKS = [
  {label: 'All products', to: '/collections/all'},
  // Replaces the long brand / model / collab directory that used to sit above
  // the footer: one link that leads to every collection.
  {label: 'All collections', to: '/collections'},
  {label: 'New in', to: '/collections/all?sort_by=newest'},
  {label: 'Sneakers', to: '/collections/sneakers'},
  {label: 'Men', to: '/collections/men'},
  {label: 'Women', to: '/collections/women'},
  {label: 'Kids', to: '/collections/kids'},
  {label: 'Essentials', to: '/collections/essentials'},
  {label: 'Sale', to: '/collections/sale'},
  // The numbered list of every product. Few shoppers will use it; it is here
  // so each product is three clicks from every page for a crawler — see
  // app/routes/($locale).product-index.($page).tsx.
  {label: 'Product index', to: '/product-index'},
];

const ABOUT_LINKS = [
  {label: 'About us', to: '/pages/about'},
  {label: 'Authenticity', to: '/pages/authenticity'},
  {label: 'Size guide', to: '/pages/size-guide'},
  {label: 'My account', to: '/account'},
  {label: 'Favorites', to: '/favorites'},
  {label: 'All policies', to: '/policies'},
];

/**
 * Re-opens Shopify's cookie banner (loaded by `withPrivacyBanner` in
 * root.tsx) so a visitor can change a choice they already made — the GDPR
 * requires withdrawing consent to be as easy as giving it.
 */
function openCookiePreferences() {
  const w = window as unknown as {
    privacyBanner?: {showPreferences?: () => void};
  };
  if (w.privacyBanner?.showPreferences) {
    w.privacyBanner.showPreferences();
  } else {
    window.location.href = '/pages/data-sharing-opt-out';
  }
}

const BOTTOM_LINKS = [
  {label: 'Privacy policy', to: '/policies/privacy-policy'},
  {label: 'Terms of service', to: '/policies/terms-of-service'},
  {label: 'Refund policy', to: '/policies/refund-policy'},
  {label: 'Shipping policy', to: '/policies/shipping-policy'},
  {label: 'Legal notice', to: '/policies/legal-notice'},
  {label: 'Contact information', to: '/policies/contact-information'},
  {label: 'Your privacy choices', to: '/pages/data-sharing-opt-out'},
];

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M9.5 9.3a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .8-1 1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M6 8h12l1 12.5a1 1 0 0 1-1 1.1H6a1 1 0 0 1-1-1.1L6 8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9 8V6.5a3 3 0 0 1 6 0V8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M12 11v5.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="7.9" r="0.9" fill="currentColor" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect
        x="3"
        y="6"
        width="18"
        height="12.5"
        rx="1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M3 10.2h18" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M6.5 14.7h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M12 3.3 19 6v5.4c0 4.5-2.9 7.9-7 9.3-4.1-1.4-7-4.8-7-9.3V6l7-2.7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="m9 12 2.2 2.2L15.5 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M3 12h18M12 3c2.4 2.4 3.6 5.6 3.6 9s-1.2 6.6-3.6 9c-2.4-2.4-3.6-5.6-3.6-9S9.6 5.4 12 3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <rect
        x="3"
        y="5.5"
        width="18"
        height="13"
        rx="1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="m4 7 8 6 8-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const SOCIAL_ICON: Record<string, React.ReactNode> = {
  instagram: (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle
        cx="12"
        cy="12"
        r="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="17" cy="7" r="1" fill="currentColor" />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <path
        d="M14 3.5c.5 2 2.1 3.4 4.3 3.6v2.7c-1.6 0-3-.5-4.3-1.4v6.2a5.4 5.4 0 1 1-5.4-5.4c.3 0 .6 0 .9.1v2.8a2.6 2.6 0 1 0 1.8 2.5V3.5H14Z"
        fill="currentColor"
      />
    </svg>
  ),
};

function socialIcon(label: string) {
  return SOCIAL_ICON[label.toLowerCase()] ?? <GlobeIcon />;
}

/**
 * Closing content above the footer: a short editorial block about the range.
 * The Brands / Popular models / Collabs link directory that used to follow it
 * was removed at the owner's request (too long); every collection is still
 * reachable from the "All collections" link in the Shop column.
 */
function PreFooter() {
  const localize = useLocalizedHref();
  const t = useTranslate();
  return (
    <div className="prefooter">
      <div className="prefooter-inner">
        <section className="prefooter-seo">
          <h3>
            {t('Discover the {name} range').replace('{name}', SHOP.name)}
          </h3>
          <p>
            {t(
              '{name} is a curated destination for streetwear and sneakers — limited drops next to everyday staples, across sneakers, boots and slippers, t-shirts, hoodies and sweatshirts, jackets, pants and shorts, full sets and tracksuits, kids’ sizes and accessories. Every item is 100% authentic and checked before it ships.',
            ).replace('{name}', SHOP.name)}
          </p>
          <h3>{t('Sneakers for every rotation')}</h3>
          <p>
            {t(
              'From Air Jordan 1s and Nike Dunks to Air Force 1, Air Max, New Balance 9060 and ASICS runners — filter by category, price and availability to find your pair, with Grade School, Pre-School and Toddler sizes for the youngest in the family.',
            )}
          </p>
          <h3>{t('Streetwear staples & full fits')}</h3>
          <p>
            {t(
              'Build the whole look with Fear of God Essentials hoodies and sets, Syna World and Corteiz pieces, tracksuits and graphic tees. Free shipping, tracked delivery and {days}-day returns on every order.',
            ).replace('{days}', String(SHOP.returnDays))}
          </p>
        </section>
      </div>
    </div>
  );
}

function NewsletterForm() {
  const localize = useLocalizedHref();
  const t = useTranslate();
  const fetcher = useFetcher<{ok: boolean; error?: string}>();
  const formRef = useRef<HTMLFormElement>(null);
  // Held only until the signup is confirmed, then hashed and dropped — see
  // the effect below and the privacy contract in `~/lib/identity`.
  const submittedEmail = useRef<string | null>(null);
  const done = fetcher.state === 'idle' && fetcher.data != null;
  const success = done && fetcher.data?.ok;

  useEffect(() => {
    if (!success) return;
    formRef.current?.reset();

    // A confirmed opt-in is the one moment on this storefront where an
    // anonymous visitor hands us an identifier. Hashing it here lifts every
    // subsequent Meta event from device-level matching (IP + browser id) to
    // person-level matching, which is what Events Manager is asking for under
    // "Send Email address to improve conversion reporting".
    const email = submittedEmail.current;
    submittedEmail.current = null;
    if (email) void rememberIdentity({email});
  }, [success]);

  return (
    <div className="footer-newsletter-form">
      <fetcher.Form
        ref={formRef}
        method="post"
        action={localize('/newsletter')}
        className="newsletter-form"
        onSubmit={(event) => {
          const field = event.currentTarget.elements.namedItem('email');
          submittedEmail.current =
            field instanceof HTMLInputElement ? field.value : null;
        }}
      >
        <input
          type="email"
          name="email"
          placeholder={t('Your email address')}
          aria-label={t('Email address')}
          required
          disabled={success}
        />
        <button
          type="submit"
          className="btn btn-dark newsletter-submit"
          disabled={fetcher.state !== 'idle' || success}
        >
          <MailIcon />
          {success ? t("You're in") : t('Sign me up')}
        </button>
      </fetcher.Form>
      {done && !success && fetcher.data?.error ? (
        <p className="newsletter-message is-error">{fetcher.data.error}</p>
      ) : success ? (
        <p className="newsletter-message is-success">
          {t('Thanks — watch your inbox for the next drop.')}
        </p>
      ) : (
        <p className="newsletter-message">
          {t('See our')}{' '}
          <NavLink to={localize('/policies/privacy-policy')}>
            {t('privacy policy')}
          </NavLink>{' '}
          {t('for how we handle your data. Unsubscribe anytime.')}
        </p>
      )}
    </div>
  );
}

export function Footer({selectedLocale}: FooterProps) {
  const localize = useLocalizedHref();
  const t = useTranslate();

  return (
    <footer className="footer">
      <PreFooter />
      <div className="footer-newsletter">
        <div className="footer-newsletter-inner">
          <div className="footer-newsletter-copy">
            <h3>
              {t('Deals, drops & trends.')}
              <br />
              {t('Straight to your inbox.')}
            </h3>
            <p>
              {t('Discounts, new products and inspiration in our newsletter.')}
            </p>
          </div>
          <NewsletterForm />
        </div>
      </div>

      <div className="footer-inner">
        <div className="footer-brand">
          <img
            src="/fastsneakers-logo.png"
            alt=""
            className="header-brand-logo footer-brand-logo"
            width="280"
            height="219"
          />
          <span className="header-brand-name">
            <span className="header-brand-top">{BRAND_LOCKUP.top}</span>
            <span className="header-brand-sub">{BRAND_LOCKUP.sub}</span>
          </span>
        </div>

        <div className="footer-columns">
          <div className="footer-col">
            <h4>
              <HelpIcon />
              {t('Help & Contact')}
            </h4>
            {HELP_LINKS.map((link) => (
              <NavLink key={link.to} prefetch="intent" to={localize(link.to)}>
                {t(link.label)}
              </NavLink>
            ))}
          </div>

          <div className="footer-col">
            <h4>
              <BagIcon />
              {t('Shop')}
            </h4>
            {SHOP_LINKS.map((link) => (
              <NavLink key={link.to} prefetch="intent" to={localize(link.to)}>
                {t(link.label)}
              </NavLink>
            ))}
          </div>

          <div className="footer-col">
            <h4>
              <InfoIcon />
              {t('About Us')}
            </h4>
            {ABOUT_LINKS.map((link) => (
              <NavLink key={link.to} prefetch="intent" to={localize(link.to)}>
                {t(link.label)}
              </NavLink>
            ))}
          </div>

          <div className="footer-col">
            <h4>
              <CardIcon />
              {t('Payment Methods')}
            </h4>
            <PaymentIcons />
            <p className="footer-col-note">
              {t('All payments are encrypted and processed securely.')}
            </p>
          </div>

          <div className="footer-col">
            <h4>
              <ShieldIcon />
              {t('Delivery & Returns')}
            </h4>
            <ul className="footer-benefits">
              <li>{t('Secure payment & checkout')}</li>
              <li>{t('Free shipping on every order')}</li>
              <li>
                {t('{days}-day returns').replace(
                  '{days}',
                  String(SHOP.returnDays),
                )}
              </li>
              <li>
                {t('Ships within {x}').replace('{x}', t(SHOP.shipsWithin))}
              </li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>
              <GlobeIcon />
              {t('Stay Connected')}
            </h4>
            <ul className="footer-contact">
              <li>
                {/* The address is too long for a narrow phone column, so
                    offer a break opportunity right after the "@" — it wraps
                    to "support@ / fastsneakers.com" instead of
                    splitting mid-word or running off the edge. */}
                <a href={`mailto:${SHOP.email}`}>
                  {SHOP.email.split('@')[0]}@<wbr />
                  {SHOP.email.split('@')[1]}
                </a>
              </li>
              {SHOP.whatsapp && (
                <li>
                  <a
                    href={SHOP.whatsapp.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {SHOP.whatsapp.display}
                  </a>
                </li>
              )}
              {SHOP.phone && (
                <li>
                  <a href={SHOP.phone.href}>{SHOP.phone.display}</a>
                </li>
              )}
              <li className="footer-contact-muted">
                {t(SHOP.supportHours)}
              </li>
            </ul>
            {SHOP.socials.length > 0 && (
              <div className="footer-socials">
                {SHOP.socials.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    title={social.label}
                  >
                    {socialIcon(social.label)}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="footer-bottom-inner">
          <div className="footer-legal">
            {SHOP.address ? (
              <p>
                {SHOP.legalName} ({t('trading as')} {SHOP.name}),{' '}
                {SHOP.address.join(', ')} · {SHOP.email}
                {SHOP.vatId ? (
                  <>
                    {' · '}
                    {t('Company registration / VAT')}: {SHOP.vatId}
                  </>
                ) : null}
              </p>
            ) : null}
            <p>
              {t(
                '{name} is an independent reseller and is not affiliated with, sponsored by or authorised by the brands offered on this website.',
              ).replace('{name}', SHOP.legalName)}
            </p>
          </div>
          <div className="footer-bottom-row">
            <nav className="footer-bottom-links">
              {BOTTOM_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  prefetch="intent"
                  to={localize(link.to)}
                >
                  {t(link.label)}
                </NavLink>
              ))}
            </nav>
            <div className="footer-country">
              <LocaleMenu selectedLocale={selectedLocale} />
            </div>
          </div>
          <p className="footer-copy">
            © {new Date().getFullYear()} {SHOP.name}. {t('All rights reserved.')}{' '}
            {t(SHOP.disclaimer)}
          </p>
        </div>
      </div>
    </footer>
  );
}
