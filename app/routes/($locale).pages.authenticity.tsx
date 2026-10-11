import {Link} from 'react-router';
import type {Route} from './+types/($locale).pages.authenticity';
import {useLocalizedHref} from '~/lib/localizedLink';
import {buildMeta} from '~/lib/seo';
import {SHOP} from '~/data/shop';
import {useTranslate} from '~/lib/useTranslate';

export const meta: Route.MetaFunction = ({matches, location}) => {
  return buildMeta(
    {matches, pathname: location.pathname},
    {
      title: 'Authenticity — how we check every item',
      description:
        'Every sneaker and every piece is 100% authentic — sourced through our network and checked pair by pair before it ships. See exactly what happens between your order and your doorstep.',
    },
  );
};

const CDN = 'https://cdn.shopify.com/s/files/1/1024/9466/7139/files';

/** Cutout strip under the intro — our own catalog shots. */
const SHOE_ROW = [
  '/authn-shoe-1.png',
  '/authn-shoe-2.png',
  '/authn-shoe-3.png',
  '/authn-shoe-4.png',
  '/authn-shoe-5.png',
  '/authn-shoe-6.png',
];

interface Step {
  n: number;
  title: string;
  /** Photo slot id — swap the placeholder for a real image later. */
  slot: string;
  flip?: boolean;
  /** Trusted HTML, already translated — see the batch of `<p>...</p>` keys. */
  bodyHtml: string;
}

function StepPhoto({slot, src}: {slot: string; src: string}) {
  return (
    <div className="authn-photo" data-slot={slot}>
      <img src={src} alt="" loading="lazy" />
    </div>
  );
}

export default function AuthenticityPage() {
  const localize = useLocalizedHref();
  const t = useTranslate();
  const shippingHref = localize('/pages/shipping');

  const steps: Step[] = [
    {
      n: 1,
      title: t('You order your item with us!'),
      slot: 'step-1-order',
      flip: true,
      bodyHtml: t(
        "<p>You place your order with <strong>{name}</strong>. Our delivery time is on average between <strong>5 and 12 days</strong>. For very exclusive models, special sizes, or pieces that have not been available in stores for years, this can take up to a maximum of 25 working days.</p><p>This is because we source your items through our network across the world from reliable suppliers. Finding the right pair can sometimes take a little longer — we do our best to make it happen as quickly as possible!</p>",
      ).replace(/\{name\}/g, SHOP.name),
    },
    {
      n: 2,
      title: t('Deal & shipping to us'),
      slot: 'step-2-deal',
      bodyHtml: t(
        '<p>Once we have found the right pair, we close the deal with the supplier and send a shipping label. The item is then sent to us. This can take <strong>several working days</strong>, as the supplier needs to ship and we need to receive the package.</p>',
      ),
    },
    {
      n: 3,
      title: t('Reception & first check-up'),
      slot: 'step-3-reception',
      flip: true,
      bodyHtml: t(
        '<p>When the pair arrives, we prepare it for inspection. For some suppliers, the pair is <strong>shipped directly to you</strong>.</p>',
      ),
    },
    {
      n: 4,
      title: t('Authenticity check'),
      slot: 'step-4-check',
      bodyHtml: t(
        '<p>When the pair arrives with us, the inspection takes on average <strong>1 to 2 working days</strong>. We take the time for each pair. Our experts check everything:</p><p>— material<br>— box<br>— labels &amp; tags<br>— details and finishing</p><p>Everything is carefully checked.</p>',
      ),
    },
    {
      n: 5,
      title: t('Shipping to you'),
      slot: 'step-5-shipping',
      flip: true,
      bodyHtml: t(
        '<p>After approval, your order is <strong>ready for shipment</strong>. You\'ll receive a track &amp; trace code from us and the package is delivered to your door — tracked, every time. See our <a href="{shippingHref}">shipping &amp; delivery rates</a>.</p>',
      ).replace('{shippingHref}', shippingHref),
    },
    {
      n: 6,
      title: t('Enjoy!'),
      slot: 'step-6-enjoy',
      bodyHtml: t(
        '<p>Time to enjoy your <strong>exclusive pair</strong> — verified, boxed and yours.</p>',
      ),
    },
  ];

  return (
    <div className="authn-page page-container">
      {/* Hero */}
      <div className="authn-hero">
        <span className="authn-eyebrow">{t('Authenticity')}</span>
        <div className="authn-hero-media" data-slot="hero">
          <img src="/authn-hero.jpg" alt="" loading="eager" />
        </div>
      </div>

      {/* Intro */}
      <div className="authn-intro">
        <span className="authn-eyebrow">{t('Every item has a story')}</span>
        <h1>{t('How it works — with confidence.')}</h1>
        <p className="authn-intro-sub">{t('Pair by pair checked')}</p>
      </div>

      <div className="authn-shoe-row" aria-hidden="true">
        {SHOE_ROW.map((src) => (
          <img key={src} src={src} alt="" loading="lazy" />
        ))}
      </div>

      {/* Steps */}
      <div className="authn-steps-head">
        <span className="authn-eyebrow">
          {t('Our procedure after your order:')}
        </span>
        <h2>{t('What your order goes through before it reaches you')}</h2>
      </div>

      <div className="authn-steps">
        {steps.map((step) => (
          <section
            key={step.n}
            className={`authn-step${step.flip ? ' is-flip' : ''}`}
          >
            <div className="authn-step-copy">
              <span className="authn-step-no">
                {t('Step')} {step.n}
              </span>
              <h3>{step.title}</h3>
              <div
                className="authn-step-body"
                dangerouslySetInnerHTML={{__html: step.bodyHtml}}
              />
            </div>
            <StepPhoto slot={step.slot} src={`/authn-step-${step.n}.jpg`} />
          </section>
        ))}
      </div>

      {/* Closing brand block */}
      <section className="authn-close">
        <div className="authn-close-media" aria-hidden="true">
          <img
            src={`${CDN}/NikeAirJordan1LowTravisScottMediumOlive.png?v=1786123445&width=520`}
            alt=""
            loading="lazy"
          />
          <img
            className="is-tile"
            src={`${CDN}/NikeAirMax1EssentialSummitWhiteBlack.png?v=1786124801&width=520`}
            alt=""
            loading="lazy"
          />
        </div>
        <div className="authn-close-copy">
          <h2>
            {t('At {name}, we take care of your ultimate pair!').replace(
              '{name}',
              SHOP.name,
            )}
          </h2>
          <p>
            {t(
              "We help you find the perfect piece. You tell us what you're looking for, and we search within our extensive network for exactly that item — whether it's a limited release or a hard-to-find size: we arrange it for you, safely and reliably.",
            )}
          </p>
          <p>{t('We sell only genuine products.')}</p>
          <p>{t('All items are carefully checked before shipping.')}</p>
          <p>
            {t(
              '{name} is an independent reseller and is not affiliated with or authorized by the brands we sell.',
            ).replace('{name}', SHOP.name)}
          </p>
          <Link
            className="btn btn-primary authn-close-cta"
            to={localize('/collections/all')}
          >
            {t('Shop the collection')}
          </Link>
        </div>
      </section>
    </div>
  );
}
