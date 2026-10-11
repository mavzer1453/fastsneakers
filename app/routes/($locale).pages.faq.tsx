import {Link} from 'react-router';
import type {Route} from './+types/($locale).pages.faq';
import {useLocalizedHref} from '~/lib/localizedLink';
import {buildMeta} from '~/lib/seo';
import {SHOP} from '~/data/shop';
import {useTranslate} from '~/lib/useTranslate';
import {
  FAQ_ENTRIES,
  resolveEnglishAnswer,
  resolveTranslatedAnswer,
} from '~/data/faq';

export const meta: Route.MetaFunction = ({matches, location}) => {
  const jsonLd = {
    '@context': 'https://schema.org' as const,
    '@type': 'FAQPage' as const,
    mainEntity: FAQ_ENTRIES.map((entry) => ({
      '@type': 'Question' as const,
      name: entry.question,
      acceptedAnswer: {
        '@type': 'Answer' as const,
        text: resolveEnglishAnswer(entry.answer),
      },
    })),
  };

  return buildMeta(
    {matches, pathname: location.pathname},
    {
      title: 'FAQ',
      description:
        'Answers about authenticity, sizing, shipping, returns and payments at Vespera Collectives.',
      jsonLd: jsonLd as never,
    },
  );
};

export default function FaqPage() {
  const localize = useLocalizedHref();
  const t = useTranslate();
  return (
    <div className="faq-page page-container">
      <div className="page-header">
        <span className="eyebrow">{t('Help center')}</span>
        <h1>{t('Frequently asked questions')}</h1>
        <p>
          {t(
            'Everything about authenticity, sizing, shipping, payments and returns. Not finding your answer?',
          )}{' '}
          <Link to={localize('/pages/contact')}>{t('Contact us')}</Link> —{' '}
          {t(SHOP.responseTime)}.
        </p>
      </div>

      <div className="faq-list">
        {FAQ_ENTRIES.map((entry) => (
          <details className="faq-item" key={entry.question}>
            <summary>{t(entry.question)}</summary>
            <p>{resolveTranslatedAnswer(entry.answer, t)}</p>
          </details>
        ))}
      </div>

      <div className="faq-footer">
        <p className="faq-disclaimer">{t(SHOP.disclaimer)}</p>
        <div className="faq-footer-actions">
          <Link className="btn btn-primary" to={localize('/collections/all')}>
            {t('Shop all products')}
          </Link>
          <Link className="btn btn-ghost" to={localize('/pages/size-guide')}>
            {t('Size guide')}
          </Link>
          <Link className="btn btn-ghost" to={localize('/pages/contact')}>
            {t('Contact support')}
          </Link>
        </div>
      </div>
    </div>
  );
}
