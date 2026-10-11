import {Link} from 'react-router';
import type {Route} from './+types/($locale).pages.size-guide';
import {useLocalizedHref} from '~/lib/localizedLink';
import {buildMeta} from '~/lib/seo';
import {SHOP} from '~/data/shop';
import {
  KIDS_SIZE_CHARTS,
  printSize,
  SIZE_CHARTS,
  type SizeChart,
} from '~/lib/sizes';
import {useTranslate} from '~/lib/useTranslate';

export const meta: Route.MetaFunction = ({matches, location}) => {
  return buildMeta(
    {matches, pathname: location.pathname},
    {
      title: 'Size guide',
      description:
        'Find your fit: apparel measurements, EU–US–UK sneaker conversions and what GS, PS and TD mean. Plus how to measure yourself at home.',
    },
  );
};

const APPAREL_SIZES = [
  {size: 'XS', chest: '96–100', length: '66', eu: '44'},
  {size: 'S', chest: '100–106', length: '69', eu: '46'},
  {size: 'M', chest: '106–112', length: '71', eu: '48'},
  {size: 'L', chest: '112–120', length: '73', eu: '50'},
  {size: 'XL', chest: '120–128', length: '75', eu: '52'},
  {size: 'XXL', chest: '128–136', length: '77', eu: '54'},
];

// The chart is shared with the size picker (app/lib/sizes.ts), so the page and
// the product options can never quote different numbers.

/**
 * One scale's table. Two of these sit side by side rather than one table with
 * seven columns: US, UK and foot length all differ between the men's and
 * women's charts, and interleaving them makes the reader check a header on
 * every cell.
 */
function SneakerTable({chart}: {chart: SizeChart}) {
  // Every adult chart shows UK Men's and UK Women's (owner request, 24 Sep
  // 2026), matching the UK Men / UK Women choice in the size picker. Nike and
  // ASICS publish their own women's UK column; adidas, New Balance, UGG and
  // the rest print one UK column for everyone, so there the women's UK IS the
  // men's figure — the same rule `convertedSize` uses.
  //
  // A kids chart has no split at all: children's lasts are not sized by
  // gender, so one US and one UK column serve the whole table.
  const kids = chart.audience === 'kids';
  const hasWomensDetail = !kids;
  const hasCm = chart.rows.some((row) => row.men.cm !== undefined);
  const t = useTranslate();

  // Five columns is where a table stops fitting a phone; four (the kids
  // charts) still do. Only promise a sideways swipe where there is one.
  const columns =
    2 + (kids ? 1 : 2) + (hasWomensDetail ? 1 : 0) + (hasCm ? 1 : 0);

  return (
    <div className="size-chart-block" id={`size-${chart.key}`}>
      <h3>{chart.label}</h3>
      <div className="size-table-wrap">
        <table className="size-table size-table-sneakers">
          <thead>
            <tr>
              <th scope="col">EU</th>
              {kids ? (
                <th scope="col">US</th>
              ) : (
                <>
                  <th scope="col">
                    US <span>{t('Men’s')}</span>
                  </th>
                  <th scope="col">
                    US <span>{t('Women’s')}</span>
                  </th>
                </>
              )}
              <th scope="col">
                UK {hasWomensDetail ? <span>{t('Men’s')}</span> : null}
              </th>
              {hasWomensDetail ? (
                <th scope="col">
                  UK <span>{t('Women’s')}</span>
                </th>
              ) : null}
              {hasCm ? (
                <th scope="col">
                  {t('Foot length')} <span>cm</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((row) => (
              <tr key={row.eu}>
                <th scope="row">{row.eu}</th>
                {kids ? (
                  <td>{row.kidsUs}</td>
                ) : (
                  <>
                    <td>{printSize(row.men.us)}</td>
                    <td>{row.women ? printSize(row.women.us) : '—'}</td>
                  </>
                )}
                <td>{printSize(row.men.uk)}</td>
                {hasWomensDetail ? (
                  <td>
                    {row.women
                      ? printSize(row.women.uk ?? row.men.uk)
                      : '—'}
                  </td>
                ) : null}
                {hasCm ? (
                  <td>
                    {row.men.cm === undefined ? '—' : printSize(row.men.cm)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {columns >= 5 ? (
        <p className="size-table-hint">
          {t('Swipe the table sideways for US, UK and foot length.')}
        </p>
      ) : null}
      <p className="size-guide-note size-chart-source">
        {t(chart.sources.length > 1 ? 'Sources: ' : 'Source: ')}
        {chart.sources.map((source, index) => (
          <span key={source.url}>
            {index > 0 ? ', ' : null}
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {source.label}
            </a>
          </span>
        ))}
      </p>
    </div>
  );
}

export default function SizeGuidePage() {
  const localize = useLocalizedHref();
  const t = useTranslate();
  return (
    <div className="size-guide-page page-container">
      <div className="page-header">
        <span className="eyebrow">{t('Find your fit')}</span>
        <h1>{t('Size guide')}</h1>
        <p>
          {t(
            'Most of our apparel has a relaxed streetwear cut and runs true to size — size down if you prefer a slimmer fit. Sneakers are listed in EU sizing. When in doubt, measure a piece you already own and compare it to the tables below.',
          )}
        </p>
      </div>

      <section className="size-guide-section">
        <h2>{t('Apparel — tees, hoodies & outerwear')}</h2>
        <p className="size-guide-note">
          {t(
            'Garment measurements in centimeters, laid flat. Chest is measured armpit to armpit ×2, length from the highest point of the shoulder to the hem.',
          )}
        </p>
        <div className="size-table-wrap">
          <table className="size-table">
            <thead>
              <tr>
                <th scope="col">{t('Size')}</th>
                <th scope="col">{t('Chest (cm)')}</th>
                <th scope="col">{t('Length (cm)')}</th>
                <th scope="col">EU</th>
              </tr>
            </thead>
            <tbody>
              {APPAREL_SIZES.map((row) => (
                <tr key={row.size}>
                  <th scope="row">{row.size}</th>
                  <td>{row.chest}</td>
                  <td>{row.length}</td>
                  <td>{row.eu}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="size-table-hint">
          {t('Swipe the table sideways to see every column.')}
        </p>
      </section>

      <section className="size-guide-section">
        <h2>{t('Sneakers — EU, US & UK')}</h2>
        <p className="size-guide-note">
          {t(
            'Every sneaker on the site is listed and shipped in EU sizing — that is the number on the box, in your cart and on your confirmation email. Use this table to find the EU size that matches the number you already know. The size picker on each product can show US men’s or US women’s alongside the EU size, and remembers your choice for the visit.',
          )}
        </p>
        <p className="size-guide-note">
          <strong>{t('Read the table for the brand you are buying.')}</strong>{' '}
          {t(
            'These are not the same numbers rearranged. The brands step the EU scale differently — a New Balance EU 41.5 and a Nike EU 41 are both a US 8, while a Vans EU 41 is a US 8.5 — and they do not even agree on the gap between men’s and women’s: Nike and Vans put it at one and a half sizes, adidas and New Balance at one, Converse at two. Carrying a number across from another brand is the most common way to order the wrong size.',
          )}
        </p>

        <nav className="size-chart-nav" aria-label={t('Jump to a brand')}>
          {SIZE_CHARTS.map((chart) => (
            <a key={chart.key} href={`#size-${chart.key}`}>
              {chart.label}
            </a>
          ))}
          <a href="#size-kids">{t('Kids')}</a>
        </nav>

        <div className="size-chart-stack">
          {SIZE_CHARTS.map((chart) => (
            <SneakerTable key={chart.key} chart={chart} />
          ))}
        </div>

        <p className="size-guide-note">
          {t(
            'Salomon, HOKA and Yeezy read off the adidas table and Onitsuka Tiger off the ASICS one, because they are built on those grids. Only Reebok, Under Armour and a handful of one-off labels fall through to the standard table, which is close but approximate. Lean on foot length if you are between sizes — and between two sizes, or buying a slim silhouette like a Samba or a Gazelle, take the larger one.',
          )}
        </p>
      </section>

      <section className="size-guide-section">
        <h2>{t('Measure your foot')}</h2>
        <p className="size-guide-note">
          {t(
            'Two minutes with a sheet of paper beats guessing — and the foot length column above turns the result straight into a size.',
          )}
        </p>
        <ol className="size-guide-steps">
          <li>
            {t(
              'Tape a sheet of paper to a hard floor so it cannot slide, and stand on it with your weight evenly on both feet.',
            )}
          </li>
          <li>
            {t(
              'Holding a pen straight up, mark the tip of your longest toe and the back of your heel.',
            )}
          </li>
          <li>
            {t(
              'Step off and measure between the marks in centimetres. Do the other foot too — one is almost always slightly longer.',
            )}
          </li>
          <li>
            {t(
              'Take the longer measurement to the table above. If it falls between two rows, choose the larger size.',
            )}
          </li>
        </ol>
        <p className="size-guide-note">
          {t(
            'Measure at the end of the day, when your feet are at their largest, and wear the socks you would wear with the shoes.',
          )}
        </p>
      </section>

      <section className="size-guide-section" id="size-kids">
        <h2>{t('Kids’ sneakers — EU & US')}</h2>
        <p className="size-guide-note">
          {t(
            'Children’s sizes are one number for everyone, and the letter after it is the important part: C is the small scale and Y the big one, so a 13C is a pre-schooler and 1Y is the very next size up. 7Y is where the kids scale ends and the adult tables above take over.',
          )}
        </p>
        <div className="size-chart-stack">
          {KIDS_SIZE_CHARTS.map((chart) => (
            <SneakerTable key={chart.key} chart={chart} />
          ))}
        </div>

        <h3 className="size-guide-subhead">{t('What GS, PS and TD mean')}</h3>
        <div className="size-guide-cards">
          <div className="size-guide-card">
            <h3>{t('GS — Grade School')}</h3>
            <p>
              {t(
                'Big-kid sizing, roughly EU 35.5–40. Popular with adults with smaller feet too — same silhouettes, often a lower price.',
              )}
            </p>
          </div>
          <div className="size-guide-card">
            <h3>{t('PS — Pre-School')}</h3>
            <p>
              {t(
                'Little-kid sizing, roughly EU 27.5–35. Marked “Enfant” on some listings.',
              )}
            </p>
          </div>
          <div className="size-guide-card">
            <h3>{t('TD — Toddler')}</h3>
            <p>
              {t(
                'Baby and toddler sizing, roughly EU 17–27. Marked “Bébé” on some listings.',
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="size-guide-section">
        <h2>{t('How to measure')}</h2>
        <div className="prose">
          <p>
            <strong>{t('Feet:')}</strong>{' '}
            {t(
              'stand on a sheet of paper, mark your longest toe and the back of your heel, and measure the distance in centimeters. Do it in the evening (feet expand during the day) and add ~0.5 cm of comfort room, then use the foot length column above.',
            )}
          </p>
          <p>
            <strong>{t('Apparel:')}</strong>{' '}
            {t(
              'take a tee or hoodie that fits the way you like, lay it flat, and measure chest width and length. Match those numbers to the table — that beats guessing between two sizes every time.',
            )}
          </p>
          <p>
            {t('Still not sure?')}{' '}
            <Link to={localize('/pages/contact')}>{t('Ask us')}</Link>{' '}
            {t(
              'before you order — {time}, and you’re covered by {days}-day returns on unworn items either way.',
            )
              .replace('{time}', t(SHOP.responseTime))
              .replace('{days}', String(SHOP.returnDays))}
          </p>
        </div>
      </section>

      <div className="how-cta">
        <Link className="btn btn-primary" to={localize('/collections/all')}>
          {t('Shop the collection')}
        </Link>
        <Link className="btn btn-ghost" to={localize('/pages/faq')}>
          {t('Read the FAQ')}
        </Link>
      </div>
    </div>
  );
}
