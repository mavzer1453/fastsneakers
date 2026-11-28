import {useEffect, useRef, useState} from 'react';
import {useLocation} from 'react-router';
import type {Route} from './+types/($locale).pages.track-order';
import {useLocalizedHref} from '~/lib/localizedLink';
import {buildMeta} from '~/lib/seo';
import {SHOP} from '~/data/shop';
import {useTranslate} from '~/lib/useTranslate';
import trackStyles from '~/styles/track.css?url';
import type {
  TrackEta,
  TrackItem,
  TrackParcel,
  TrackResult,
  TrackView,
} from '~/lib/track.server';

/**
 * "Track your order" — a component-for-component port of the page that runs
 * at mera-fashion.com/pages/track (same rules, same warm copy, same layout),
 * in Fast Sneakers' colours, talking to the shared fastsneaker-track Cloudflare Worker.
 *
 * States:  A) the form (hero + card + trust row)
 *          B) the result (hello card → notice → per-parcel summary, estimated
 *             arrival, timeline, items → waiting card → family note → help)
 *
 * No cookies, no localStorage, no tracking scripts. Everything the API sends
 * is rendered through React (never innerHTML), so nothing needs escaping.
 */

// Same Cloudflare Worker as checkout.fastsneaker.com/pages/track, so both pages
// show identical, sanitised results (and the signed e-mail links work on both).
// The Worker allows this origin via ALLOWED_ORIGINS; the URL is also in the CSP
// connect-src list in entry.server.tsx.
const API = 'https://fastsneaker-track.mmavzer1453.workers.dev/api/track';
const FAMILY = SHOP.name;

export const links: Route.LinksFunction = () => [
  {rel: 'stylesheet', href: trackStyles},
];

export const meta: Route.MetaFunction = ({matches, location}) => {
  return buildMeta(
    {matches, pathname: location.pathname},
    {
      title: 'Track your order',
      description:
        'Enter your order number and the email you used at checkout and we will show you exactly where your order is.',
    },
  );
};

// ------------------------------------------------------------- helpers ---

function fmtDay(ms: number | null | undefined, withYear = false): string {
  if (ms == null) return '';
  try {
    return new Date(ms).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? {year: 'numeric'} : {}),
      timeZone: 'UTC',
    });
  } catch {
    return '';
  }
}

function fmtTime(ms: number | null | undefined): string {
  if (ms == null) return '';
  try {
    const d = new Date(ms);
    const day = d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});
    const t = d.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', timeZone: 'UTC'});
    return `${day} · ${t}`;
  } catch {
    return '';
  }
}

const dayName = (ms: number) => new Date(ms).toLocaleDateString('en-GB', {weekday: 'short', timeZone: 'UTC'});
const monName = (ms: number) => new Date(ms).toLocaleDateString('en-GB', {month: 'short', timeZone: 'UTC'});
const dayNo = (ms: number) => new Date(ms).getUTCDate();

function todayUtc(): number {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
}

const PILL: Record<TrackView['tone'], string> = {
  calm: 'In progress',
  delay: 'Taking a little longer',
  good: 'On schedule',
  action: 'Action needed',
  alert: 'Please contact us',
};

function tagline(v: TrackView): string {
  if (v.special === 'pickup') return 'Waiting for you nearby';
  if (v.tone === 'alert' || v.tone === 'action') return 'We’re here to help';
  if (v.delayed) return 'Hang in there, it’s coming';
  return (
    ['We’re getting it ready for you', 'Packed with love', 'Travelling to you', 'Almost home!', 'Home sweet home'][v.stage] ||
    'On its way'
  );
}

// --------------------------------------------------------------- icons ---

const Check = () => (
  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m2.5 6.3 2.3 2.2L9.5 3.8" />
  </svg>
);

const ICONS = {
  calm: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
    </svg>
  ),
  good: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.7 2.7L16.5 9.5" />
    </svg>
  ),
  action: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </svg>
  ),
  delay: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
};

/** The parcel-box mascot — its face follows the state of the parcel. */
function Mascot({v}: {v: TrackView}) {
  const st = v.stage;
  const dots = (
    <>
      <circle cx="25" cy="33" r="2.6" fill="#3c3e43" />
      <circle cx="39" cy="33" r="2.6" fill="#3c3e43" />
    </>
  );
  const happyEyes = (
    <path d="M22 33q3-3.5 6 0M36 33q3-3.5 6 0" stroke="#3c3e43" strokeWidth="2.2" fill="none" strokeLinecap="round" />
  );
  const smile = <path d="M27 39q5 4.5 10 0" stroke="#3c3e43" strokeWidth="2.2" fill="none" strokeLinecap="round" />;
  const big = <path d="M26 38.5q6 7 12 0z" fill="#3c3e43" />;
  const worried = <path d="M27 41q5-3 10 0" stroke="#3c3e43" strokeWidth="2.2" fill="none" strokeLinecap="round" />;
  const flat = <path d="M28 39.5q4 2.5 8 0" stroke="#3c3e43" strokeWidth="2.2" fill="none" strokeLinecap="round" />;

  let eyes = dots;
  let mouth = smile;
  let extra: React.ReactNode = null;
  if (v.tone === 'alert' || v.tone === 'action') mouth = worried;
  if (st >= 4) {
    eyes = happyEyes;
    mouth = big;
    extra = <path d="M50 9c-1.6-2.6-5.6-1.6-5.4 1.4.1 2.2 3.1 4 5.4 5.6 2.3-1.6 5.3-3.4 5.4-5.6.2-3-3.8-4-5.4-1.4z" fill="#d03c0a" />;
  } else if (st === 3) {
    mouth = big;
    extra = <path d="M52 12l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#f5b301" />;
  } else if (st === 2) {
    extra = <path d="M2 30h7M0 37h8M3 44h6" stroke="#fcd6c9" strokeWidth="2.4" strokeLinecap="round" />;
  } else {
    eyes = happyEyes;
  }
  if (v.delayed) {
    eyes = dots;
    mouth = flat;
    extra = (
      <>
        <circle cx="51" cy="13" r="6" fill="#fff" stroke="#fcd6c9" strokeWidth="1.8" />
        <path d="M51 10v3.4l2 1.3" stroke="#a83208" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </>
    );
  }
  return (
    <svg className="VtMascot" viewBox="0 0 60 60" aria-hidden="true">
      <rect x="12" y="18" width="40" height="34" rx="9" fill="#feeee9" />
      <path d="M12 27h40" stroke="#fcdbd0" strokeWidth="2" />
      <rect x="28" y="18" width="8" height="9" fill="#fcd4c7" />
      <rect x="12" y="18" width="40" height="34" rx="9" fill="none" stroke="#fbc4b1" strokeWidth="2" />
      <circle cx="20.5" cy="40" r="3" fill="#fde1d8" opacity=".9" />
      <circle cx="43.5" cy="40" r="3" fill="#fde1d8" opacity=".9" />
      {eyes}
      {mouth}
      {extra}
    </svg>
  );
}

// ----------------------------------------------------------- components ---

function Items({list, title}: {list: TrackItem[]; title: string}) {
  if (!list.length) return null;
  return (
    <div className="VtCard">
      <p className="VtCard__Title">{title}</p>
      {list.map((it, i) => (
        <div className="VtItem" key={i}>
          <div className="VtItem__Img">{it.image ? <img src={it.image} alt="" loading="lazy" /> : null}</div>
          <div>
            <div className="VtItem__Title">{it.title}</div>
            {it.variant || it.qty > 1 ? (
              <span className="VtItem__Sub">
                {it.variant ? (/\//.test(it.variant) ? '' : 'Size ') + it.variant : ''}
                {it.qty > 1 ? `${it.variant ? ' · ' : ''}${it.qty}×` : ''}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function HeroCard({tone, kicker, headline, message}: {tone: TrackView['tone']; kicker?: string; headline: string; message: string}) {
  return (
    <div className={`VtHeroCard VtHeroCard--${tone}`}>
      <div className="VtHeroCard__Top">
        <div className="VtHeroCard__Icon">{ICONS[tone] ?? ICONS.calm}</div>
        <div>
          <span className="VtHeroCard__Label">{kicker || 'Status'}</span>
        </div>
      </div>
      <h2 className="VtHeroCard__Head">{headline}</h2>
      <p className="VtHeroCard__Msg">{message}</p>
    </div>
  );
}

/**
 * Estimated arrival. Before the parcel is in the customer's country only a
 * from–to range is shown; once it has landed, 5 delivery-day tiles with the
 * most likely day highlighted; "Today" when it is out for delivery.
 */
function Eta({eta}: {eta: TrackEta}) {
  const today = todayUtc();
  const days = eta.days ?? [];
  const from = eta.from ?? days[0];
  const to = eta.to ?? days[days.length - 1];
  if (from == null || to == null) return null;
  const mode = eta.mode ?? 'days';
  const sameMonth = monName(from) === monName(to);
  const showTiles = mode === 'days' && days.length > 1;
  return (
    <div className="VtEta">
      <div className="VtEta__Top">
        <div className="VtEta__Icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="3" />
            <path d="M3 10h18M8 3v4M16 3v4" />
            <path d="m9 15.5 2 2 4-4" />
          </svg>
        </div>
        <div>
          <span className="VtEta__Kicker">Estimated arrival</span>
          <span className="VtEta__Range">
            {mode === 'today' ? (
              <em>Today</em>
            ) : from === to ? (
              <em>
                {dayName(from)} {dayNo(from)} {monName(from)}
              </em>
            ) : (
              <>
                <em>
                  {dayName(from)} {dayNo(from)}
                  {sameMonth ? '' : ` ${monName(from)}`}
                </em>
                {' – '}
                <em>
                  {dayName(to)} {dayNo(to)} {monName(to)}
                </em>
              </>
            )}
          </span>
          {mode === 'range' ? (
            <span className="VtEta__Note">We’ll show you a more exact day as soon as your parcel arrives in your country.</span>
          ) : mode === 'today' ? (
            <span className="VtEta__Note">Your parcel is out for delivery.</span>
          ) : null}
        </div>
      </div>
      {showTiles ? (
        <div className="VtEta__Days" aria-hidden="true">
          {days.map((t) => (
            <div
              key={t}
              className={
                'VtEta__Day' + (t === today ? ' is-today' : '') + (t < today ? ' is-past' : '') + (t === eta.peak ? ' is-peak' : '')
              }
            >
              <span>{dayName(t)}</span>
              <b>{dayNo(t)}</b>
              <small>{t === eta.peak ? 'Likely' : t === today ? 'Today' : monName(t)}</small>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Timeline({details}: {details: TrackView['details']}) {
  const [open, setOpen] = useState(false);
  if (!details.length) return null;
  const more = details.length - 5;
  return (
    <div className="VtCard VtTimeline">
      <p className="VtCard__Title">Latest updates</p>
      <ol className={open ? 'is-open' : undefined}>
        {details.map((d, i) => (
          <li key={i} className={(i === 0 ? 'is-latest' : '') + (i >= 5 ? ' is-more' : '')} hidden={i >= 5 && !open}>
            <span className="VtTimeline__Dot" />
            <div>
              <div className="VtTimeline__Text">{d.text}</div>
              <time className="VtTimeline__Time">{fmtTime(d.at)}</time>
            </div>
          </li>
        ))}
      </ol>
      {more > 0 ? (
        <button type="button" className="VtTimeline__Toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Show less' : <>Show full history <span>({more} more)</span></>}
        </button>
      ) : null}
    </div>
  );
}

function Parcel({p, orderName}: {p: TrackParcel; orderName: string}) {
  const v = p.view;
  const pill = v.stage === 4 ? 'Delivered' : v.stage === 3 && !v.special ? 'Out for delivery' : PILL[v.tone] || 'In progress';
  return (
    <>
      <div className={`VtSum VtSum--${v.tone || 'calm'}`}>
        <div className="VtSum__Top">
          <div>
            <div className="VtSum__Kicker">{p.label || 'Order'}</div>
            <div className="VtSum__No">{orderName}</div>
          </div>
          <span className="VtSum__Pill">
            <i />
            {pill}
          </span>
        </div>
        <div className="VtSum__Hero">
          <Mascot v={v} />
          <div>
            <span className="VtSum__Tag">{tagline(v)}</span>
            <h2 className="VtSum__Head">{v.headline}</h2>
          </div>
        </div>
        <p className="VtSum__Msg">{v.message}</p>
        <ol className="VtStepper">
          {v.steps.map((s, i) => (
            <li
              key={s.key ?? i}
              className={
                'VtStepper__Step' +
                (s.done ? ' is-done' : '') +
                (s.current ? ' is-current' : '') +
                (i < v.steps.length - 1 && v.steps[i + 1].done ? ' is-linked' : '')
              }
            >
              <span className="VtStepper__Dot">{s.done ? <Check /> : null}</span>
              <span className="VtStepper__Label">{s.title}</span>
            </li>
          ))}
        </ol>
        {v.eta ? <Eta eta={v.eta} /> : null}
        {v.localCarrier ? (
          <p className="VtSum__Carrier">
            Local delivery partner: <b>{v.localCarrier}</b>
          </p>
        ) : null}
        {p.liveUpdatesPaused ? (
          <p className="VtSum__Carrier">Live updates are refreshing at the moment. Please check back in a little while.</p>
        ) : null}
      </div>
      <Timeline details={v.details} />
      <Items list={p.items} title={p.label ? `In ${p.label.toLowerCase()}` : 'Packed with care for you'} />
    </>
  );
}

function Result({d, onAgain, contactHref}: {d: TrackResult; onAgain: () => void; contactHref: string}) {
  return (
    <div className="VtResult" aria-live="polite">
      <div className="VtHello">
        <div>
          <div className="VtHello__Hi">
            Hi {d.firstName || 'there'}{' '}
            <span className="VtWave" aria-hidden="true">
              👋
            </span>
          </div>
          <p className="VtHello__Sub">Thank you for being part of the {FAMILY} family. Here’s exactly where your order is right now.</p>
          <div className="VtHello__Meta">
            {d.firstName || d.placedAt ? 'Order ' : ''}
            {d.order}
            {d.placedAt ? ` · Placed ${fmtDay(d.placedAt)}` : ''}
          </div>
        </div>
        <button type="button" className="VtOrderHead__Again" onClick={onAgain}>
          Track another
        </button>
      </div>

      {d.notice ? <HeroCard tone={d.notice.tone} headline={d.notice.headline} message={d.notice.message} /> : null}

      {d.parcels.map((p, i) => (
        <Parcel key={i} p={p} orderName={d.order} />
      ))}

      {d.waiting ? (
        <>
          <HeroCard tone="calm" kicker="Still being prepared" headline={d.waiting.headline} message={d.waiting.message} />
          <Items list={d.waiting.items} title="Coming in a separate parcel" />
        </>
      ) : null}

      <div className="VtCard VtNote">
        <div className="VtNote__Icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" fill="#d03c0a" />
          </svg>
        </div>
        <div>
          <p className="VtNote__Title">A little note from our family</p>
          <p className="VtNote__Body">
            Every order is checked by hand and packed with care by our small team. We hope it makes you smile. And if anything
            isn’t perfect, just tell us. We’ll make it right, the way family does.
          </p>
          <p className="VtNote__Sign">With love, the {FAMILY} family</p>
        </div>
      </div>

      <p className="VtAgainLink">
        <button type="button" onClick={onAgain}>
          Track another order
        </button>
      </p>

      <div className="VtCard VtHelp">
        <p>
          <b>Questions? We’re here for you</b>
          <br />A real person from our team reads and answers every message.
        </p>
        <a href={contactHref}>Talk to us</a>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- page ---

export default function TrackOrderPage() {
  const localize = useLocalizedHref();
  const t = useTranslate();
  const location = useLocation();
  const rootRef = useRef<HTMLElement>(null);
  const orderRef = useRef<HTMLInputElement>(null);

  const [order, setOrder] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<{order: boolean; email: boolean}>({order: false, email: false});
  const [result, setResult] = useState<TrackResult | null>(null);

  async function call(opts: {query?: string; body?: {order: string; email: string}}) {
    setBusy(true);
    setError(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch(API + (opts.query || ''), {
        method: opts.body ? 'POST' : 'GET',
        headers: opts.body ? {'content-type': 'application/json'} : {},
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
      });
      const j = (await r.json().catch(() => ({}))) as Partial<TrackResult> & {message?: string};
      if (r.ok && j && j.order) {
        setResult(j as TrackResult);
        try {
          rootRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
        } catch {
          /* ignore */
        }
      } else {
        setError(j?.message || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('We could not reach the tracking service. Please check your connection and try again.');
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const o = order.trim();
    const m = email.trim();
    const okO = /\d{3,}/.test(o);
    const okM = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m);
    setInvalid({order: !okO, email: !okM});
    if (!okO) return setError('Please enter your order number, for example #1234.');
    if (!okM) return setError('Please enter the email address you used at checkout.');
    void call({body: {order: o, email: m}});
  }

  function again() {
    setResult(null);
    setError(null);
    try {
      history.replaceState(null, '', location.pathname);
    } catch {
      /* ignore */
    }
    setTimeout(() => orderRef.current?.focus(), 0);
  }

  // ?o=…&t=… (signed link) → auto lookup; ?nums=… → parcel lookup; ?order= → prefill.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('o') && q.get('t')) {
      void call({query: `?o=${encodeURIComponent(q.get('o')!)}&t=${encodeURIComponent(q.get('t')!)}`});
    } else if (q.get('nums')) {
      void call({query: `?nums=${encodeURIComponent(q.get('nums')!)}`});
    } else if (q.get('order')) {
      setOrder(q.get('order')!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="VtTrack" ref={rootRef}>
      <div className="VtTrack__Glow" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="VtTrack__Wrap">
        <header className="VtTrack__Hero" hidden={!!result}>
          <span className="VtTrack__Eyebrow">
            <i />
            {t('Live order status')}
          </span>
          <h1 className="VtTrack__Title">
            {t('Track your')} <em>{t('order')}</em>
          </h1>
          <p className="VtTrack__Sub">
            {t(
              'Can’t wait for your order? Neither can we! Enter your order number and the email you used at checkout, and we’ll show you exactly where it is.',
            )}
          </p>
        </header>

        <form className="VtTrack__Form" onSubmit={submit} noValidate hidden={!!result}>
          <label className="VtField">
            <span className="VtField__Label">{t('Order number')}</span>
            <span className="VtField__Box">
              <svg className="VtField__Icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M9 3 7 21M17 3l-2 18M4 8.5h16M3.5 15.5h16" />
              </svg>
              <input
                ref={orderRef}
                className="VtField__Input"
                name="order"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="1234"
                maxLength={20}
                value={order}
                aria-invalid={invalid.order}
                onChange={(e) => setOrder(e.target.value)}
              />
            </span>
          </label>
          <label className="VtField">
            <span className="VtField__Label">{t('Email address')}</span>
            <span className="VtField__Box">
              <svg className="VtField__Icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <path d="m4 7 8 6 8-6" />
              </svg>
              <input
                className="VtField__Input"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                maxLength={254}
                value={email}
                aria-invalid={invalid.email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </span>
          </label>
          <button className={'VtTrack__Btn' + (busy ? ' is-loading' : '')} type="submit" disabled={busy}>
            <span className="VtTrack__BtnText">{busy ? t('Looking up your order…') : t('Track my order')}</span>
            <span className="VtTrack__Spinner" aria-hidden="true" />
          </button>
          <p className="VtTrack__Hint">
            {t('You can find your order number in your confirmation email, for example')} <b>#1234</b>.
          </p>
          <p className="VtTrack__Error" role="alert" hidden={!error}>
            {error}
          </p>
        </form>

        {result ? <Result d={result} onAgain={again} contactHref={localize('/pages/contact')} /> : null}

        <ul className="VtTrust" hidden={!!result}>
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
              <path d="M3 7.5 12 12l9-4.5M12 12v9" />
            </svg>
            {t('Free tracked shipping')}
          </li>
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z" />
              <path d="m9 12 2.2 2.2L15.5 10" />
            </svg>
            {t('100% authentic')}
          </li>
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
            </svg>
            {t('Personal help')}
          </li>
        </ul>
      </div>
    </section>
  );
}
