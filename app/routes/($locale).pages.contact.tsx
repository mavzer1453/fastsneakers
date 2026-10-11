import {useState} from 'react';
import {Link} from 'react-router';
import type {Route} from './+types/($locale).pages.contact';
import {useLocalizedHref} from '~/lib/localizedLink';
import {buildMeta} from '~/lib/seo';
import {SHOP} from '~/data/shop';
import {useTranslate} from '~/lib/useTranslate';

export const meta: Route.MetaFunction = ({matches, location}) => {
  return buildMeta(
    {matches, pathname: location.pathname},
    {
      title: 'Contact',
      description: `Questions about an order or product? Email ${SHOP.email} — ${SHOP.responseTime.toLowerCase()}.`,
    },
  );
};

/**
 * The form composes the message in the visitor's own mail app (mailto:).
 *
 * Sending server-side was tried and abandoned: Shopify's own /contact
 * endpoint is guarded by hCaptcha and answers any server-side post with
 * `400 Missing CAPTCHA token`, and a third-party email API means an account,
 * an API key and DNS verification to maintain. Handing the composed message
 * to the visitor's mail client needs none of that, and it never shows a fake
 * "sent" state — the customer watches their own client send it.
 */
export default function ContactPage() {
  const localize = useLocalizedHref();
  const t = useTranslate();
  const [attempted, setAttempted] = useState(false);

  function composeInMailApp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = (key: string) => {
      const raw = form.get(key);
      return typeof raw === 'string' ? raw.trim() : '';
    };

    const orderNumber = get('orderNumber');
    // The typed subject wins; without one, build something the inbox can be
    // sorted by rather than leaving the line blank.
    const subject =
      get('subject') ||
      `Contact request from ${get('name') || 'a customer'}${
        orderNumber ? ` — order ${orderNumber}` : ''
      }`;

    const body = [
      `Name: ${get('name')}`,
      `Email: ${get('email')}`,
      get('phone') ? `Phone: ${get('phone')}` : null,
      orderNumber ? `Order number: ${orderNumber}` : null,
      '',
      get('message'),
    ]
      .filter((line) => line !== null)
      .join('\n');

    window.location.href = `mailto:${SHOP.email}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
    setAttempted(true);
  }

  return (
    <div className="contact-page section">
      <div className="contact-header">
        <span className="eyebrow">{t('Customer service')}</span>
        <h1>{t('Get in touch')}</h1>
        <p className="contact-intro">
          {t(
            'Questions about an order, sizing or a specific piece? We’re happy to help — {time}.',
          ).replace('{time}', t(SHOP.responseTime))}
        </p>
      </div>

      <div className="contact-grid">
        <form
          id="contactForm"
          className="contact-form"
          onSubmit={composeInMailApp}
        >
          <h2>{t('Ask your question')}</h2>
          <p>
            {t(
              'Fill in the form and hit send — it opens the message in your email app, already written and addressed to',
            )}{' '}
            <a href={`mailto:${SHOP.email}`}>{SHOP.email}</a>.{' '}
            {t('Prefer to write directly? That address works too.')}
          </p>

          <label className="contact-field">
            <span>
              {t('Name')} <em>*</em>
            </span>
            <input
              name="name"
              type="text"
              placeholder={t('Your full name')}
              autoComplete="name"
              required
            />
          </label>

          <label className="contact-field">
            <span>
              {t('Email')} <em>*</em>
            </span>
            <input
              name="email"
              type="email"
              placeholder="name@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label className="contact-field">
            <span>{t('Phone number')}</span>
            <input
              name="phone"
              type="tel"
              placeholder="+32 471 23 45 67"
              autoComplete="tel"
            />
          </label>

          <label className="contact-field">
            <span>{t('Order number')}</span>
            <input
              name="orderNumber"
              type="text"
              placeholder={t('#1234 (if your question is about an order)')}
            />
          </label>

          <label className="contact-field">
            <span>{t('Subject')}</span>
            <input
              name="subject"
              type="text"
              placeholder={t('What is your question about?')}
            />
          </label>

          <label className="contact-field">
            <span>
              {t('Your message')} <em>*</em>
            </span>
            <textarea
              name="message"
              rows={6}
              placeholder={t(
                'Describe your question in as much detail as possible…',
              )}
              required
            />
          </label>

          <label className="contact-consent">
            <input type="checkbox" name="consent" value="yes" required />
            <span
              dangerouslySetInnerHTML={{
                __html: t(
                  'I agree to the <a href="{href}">privacy policy</a>.',
                ).replace('{href}', localize('/policies/privacy-policy')),
              }}
            />
            <em> *</em>
          </label>

          <div className="contact-actions">
            <button type="submit" className="btn btn-primary contact-submit">
              {t('Send via your email app')}
            </button>
            {attempted ? (
              <output className="contact-note">
                {t(
                  'Your email app should have opened with the message ready to send. If nothing happened, email us directly at',
                )}{' '}
                <a href={`mailto:${SHOP.email}`}>{SHOP.email}</a>{' '}
                {t('— we reply either way.')}
              </output>
            ) : (
              <p className="contact-hint">
                {t(
                  'Want to include photos? Attach them in your email app before sending.',
                )}
              </p>
            )}
          </div>
        </form>

        <div className="contact-aside">
          <div className="contact-card">
            <h3>{t('Customer service')}</h3>
            <ul className="contact-details">
              <li className="contact-detail">
                <span className="contact-detail-icon" aria-hidden="true">
                  <MailIcon />
                </span>
                <span className="contact-detail-body">
                  <strong>{t('Email')}</strong>
                  <a href={`mailto:${SHOP.email}`}>{SHOP.email}</a>
                </span>
              </li>
              {SHOP.phone && (
                <li className="contact-detail">
                  <span className="contact-detail-icon" aria-hidden="true">
                    <PhoneIcon />
                  </span>
                  <span className="contact-detail-body">
                    <strong>{t('Phone')}</strong>
                    <a href={SHOP.phone.href}>{SHOP.phone.display}</a>
                  </span>
                </li>
              )}
              {SHOP.whatsapp && (
                <li className="contact-detail">
                  <span className="contact-detail-icon" aria-hidden="true">
                    <WhatsAppIcon />
                  </span>
                  <span className="contact-detail-body">
                    <strong>WhatsApp</strong>
                    <a
                      href={SHOP.whatsapp.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {SHOP.whatsapp.display}
                    </a>
                  </span>
                </li>
              )}
            </ul>
            <div className="contact-hours">
              <strong>{t('Support hours')}</strong>
              <p>{t(SHOP.supportHours)}</p>
            </div>
          </div>

          {SHOP.address && (
            <div className="contact-card">
              <h3>{t('Address details')}</h3>
              <address className="contact-address">
                <span>
                  <strong>{SHOP.legalName}</strong>
                </span>
                {SHOP.address.map((line) => (
                  <span key={line}>{line}</span>
                ))}
                {SHOP.vatId ? (
                  <span className="contact-address-vat">
                    {t('VAT:')} {SHOP.vatId}
                  </span>
                ) : null}
                {SHOP.registrationId ? (
                  <span className="contact-address-vat">
                    {SHOP.registrationId}
                  </span>
                ) : null}
              </address>
            </div>
          )}

          <div className="contact-card contact-card--soft">
            <h3 className="contact-card-heading">
              <span className="contact-detail-icon" aria-hidden="true">
                <ClockIcon />
              </span>
              <span>{t('Response time')}</span>
            </h3>
            <p>
              {t(
                '{time}. During busy periods it may take a little longer — we answer every message.',
              ).replace('{time}', t(SHOP.responseTime))}
            </p>
          </div>

          <div className="contact-card contact-card--soft">
            <h3>{t('Quick answers')}</h3>
            <p>
              {t(
                'Many questions about shipping times, returns, sizing and authenticity are already answered in our',
              )}{' '}
              <Link to={localize('/pages/faq')}>{t('FAQ')}</Link>{' '}
              {t('and')}{' '}
              <Link to={localize('/pages/size-guide')}>
                {t('size guide')}
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MailIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="m4 7 8 6 8-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 3h3l2 5-2.5 1.5a11 11 0 0 0 5 5L21 12v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.6-1.2A9 9 0 1 0 12 3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M9 9c0 3 3 6 6 6 .7 0 1.2-.6 1-1.2l-.4-1.1a.8.8 0 0 0-1-.5l-.9.3a4 4 0 0 1-2-2l.3-.9a.8.8 0 0 0-.5-1l-1.1-.4C9.6 7.8 9 8.3 9 9z"
        fill="currentColor"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
