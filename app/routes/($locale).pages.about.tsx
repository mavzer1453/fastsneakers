import {Link} from 'react-router';
import type {Route} from './+types/($locale).pages.about';
import {useLocalizedHref} from '~/lib/localizedLink';
import {buildMeta} from '~/lib/seo';
import {SHOP} from '~/data/shop';
import {useTranslate} from '~/lib/useTranslate';

export const meta: Route.MetaFunction = ({matches, location}) => {
  return buildMeta(
    {matches, pathname: location.pathname},
    {
      title: 'About us',
      description: `The story behind ${SHOP.name}: sneakers, streetwear and accessories from an independent Belgian retailer.`,
    },
  );
};

export default function AboutPage() {
  const localize = useLocalizedHref();
  const t = useTranslate();
  return (
    <div className="about-page page-container">
      <div className="page-header">
        <span className="eyebrow">
          {t('About')} {SHOP.name}
        </span>
        <h1>{t('The pieces worth chasing, without the chase.')}</h1>
        <p>
          {t(
            "Fast Sneakers is built around one simple idea: finding the pair you want shouldn't be a chore. Everything we stock has to earn its place, from limited sneakers to heavyweight everyday staples.",
          )}
        </p>
      </div>

      <section className="about-section">
        <h2>{t('Why we started')}</h2>
        <div className="prose">
          <p>
            {t(
              "{name} started the way most collectors' projects do: with frustration. Raffles you never win, resale prices that double overnight, listings you can't trust, and \"limited\" drops that sell out in seconds to bots. If you just want to wear the pieces you love, the sneaker and streetwear world can feel rigged against you.",
            ).replace('{name}', SHOP.name)}
          </p>
          <p>
            {t(
              "So we built the store we wanted to shop at ourselves: a curated selection of sneakers, tees, hoodies and outerwear from the brands that matter — sourced through partners we know, checked piece by piece, and priced so you don't need a bidding war to get dressed.",
            )}
          </p>
          <p>
            {t(
              'What started with grails has grown into a full wardrobe — from Travis Scott Jordans and SB Dunks to Stussy, Corteiz, Essentials and everyday staples — all chosen with exactly the same standard.',
            )}
          </p>
        </div>
      </section>

      <section className="about-section">
        <h2>{t('What we stand for')}</h2>
        <div className="about-values">
          <div className="about-value-card">
            <h3>{t('100% authentic')}</h3>
            <p>
              {t(SHOP.disclaimer)}{' '}
              {t(
                "If we wouldn't wear it ourselves, it doesn't go on the site — no matter how well it would sell.",
              )}
            </p>
          </div>
          <div className="about-value-card">
            <h3>{t('A wide range, checked')}</h3>
            <p>
              {t(
                'Thousands of sneakers, clothing and accessories from the brands that matter, from limited collabs to everyday staples. Every order is checked before it ships.',
              )}
            </p>
          </div>
          <div className="about-value-card">
            <h3>{t('Fair & upfront')}</h3>
            <p>
              {t(
                'Clear prices in euros, tracked shipping on every order and {days}-day returns on unworn items.',
              ).replace('{days}', String(SHOP.returnDays))}{' '}
              {t('When you have a question, you talk to a real person — {time}.').replace(
                '{time}',
                t(SHOP.responseTime),
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="about-section">
        <h2>{t('How we choose what we sell')}</h2>
        <div className="prose">
          <p>
            {t(
              'Every piece has to pass three questions. Is it real — sourced from partners we trust and verified before it ships? Is it wanted — a piece people actually chase, or a staple they wear on repeat? And would we wear it ourselves? If the answer to any of them is no, we pass.',
            )}
          </p>
        </div>
      </section>

      <section className="about-section">
        <h2>{t('How your order reaches you')}</h2>
        <div className="prose">
          <p>
            {t(
              'Some items ship from our own stock in Belgium. The rest are held by our trusted European sourcing partners and ship once your order is confirmed. Either way, we handle your order, your questions and your return ourselves, and the same shipping and return policies apply.',
            )}
          </p>
          <p>
            {t(
              '{name} is an independent retailer. We are not affiliated with, sponsored by or authorised by the brands we sell; brand names and trademarks belong to their owners.',
            ).replace('{name}', SHOP.name)}
          </p>
        </div>
      </section>

      <section className="about-section">
        <h2>{t('Who we are')}</h2>
        <div className="prose">
          <p>
            {t('{name} is run by {legal}, a registered Belgian business.')
              .replace('{name}', SHOP.name)
              .replace('{legal}', SHOP.legalName)}
          </p>
          <ul>
            {SHOP.address ? <li>{SHOP.address.join(', ')}</li> : null}
            {SHOP.vatId ? (
              <li>
                {t('VAT number')}: {SHOP.vatId}
              </li>
            ) : null}
            <li>
              <a href={`mailto:${SHOP.email}`}>{SHOP.email}</a>
            </li>
            {SHOP.phone ? (
              <li>
                <a href={SHOP.phone.href}>{SHOP.phone.display}</a>
              </li>
            ) : null}
          </ul>
          <p>
            <Link to={localize('/policies/legal-notice')}>
              {t('Legal notice')}
            </Link>
          </p>
        </div>
      </section>

      <section className="about-section about-promise">
        <h2>{t('Our promise')}</h2>
        <ul className="about-promise-list">
          <li>
            {t('Every item 100% authentic, sourced from trusted partners')}
          </li>
          <li>{t('Free shipping on every order')}</li>
          <li>
            {t('Orders ship within {x}, tracked').replace(
              '{x}',
              t(SHOP.shipsWithin),
            )}
          </li>
          <li>
            {t('{days}-day returns on unworn items with tags').replace(
              '{days}',
              String(SHOP.returnDays),
            )}
          </li>
        </ul>
        <div className="about-cta">
          <Link className="btn btn-primary" to={localize('/collections/all')}>
            {t('Shop the collection')}
          </Link>
          <Link className="btn btn-ghost" to={localize('/pages/size-guide')}>
            {t('Size guide')}
          </Link>
          <Link className="btn btn-ghost" to={localize('/pages/contact')}>
            {t('Talk to us')}
          </Link>
        </div>
      </section>
    </div>
  );
}
