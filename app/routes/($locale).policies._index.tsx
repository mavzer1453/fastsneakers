import {Link} from 'react-router';
import type {Route} from './+types/($locale).policies._index';
import {POLICIES, localizePolicySummary} from '~/data/policies';
import {useLocalizedHref} from '~/lib/localizedLink';
import {buildMeta} from '~/lib/seo';
import {useTranslate, useLanguage} from '~/lib/useTranslate';

export const meta: Route.MetaFunction = ({matches, location}) => {
  return buildMeta(
    {matches, pathname: location.pathname},
    {
      title: 'Policies',
      description:
        'Privacy, refunds, shipping, terms of service and contact information — everything about shopping with us.',
    },
  );
};

export default function Policies() {
  const localize = useLocalizedHref();
  const t = useTranslate();
  const language = useLanguage();

  return (
    <div className="policy-index section">
      <div className="policy-page-header">
        <span className="eyebrow">{t('Legal')}</span>
        <h1>{t('Our policies')}</h1>
        <p>
          {t(
            'Everything about shopping with us — privacy, returns, shipping and terms.',
          )}
        </p>
      </div>
      <div className="policy-index-grid">
        {POLICIES.map((policy) => {
          const {title, intro} = localizePolicySummary(policy, language);
          return (
            <Link
              key={policy.handle}
              className="policy-index-card"
              to={localize(`/policies/${policy.handle}`)}
            >
              <h2>{title}</h2>
              <p>{intro}</p>
              <span className="policy-index-cta">{t('Read policy →')}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
