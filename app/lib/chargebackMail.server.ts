import {
  type AdminOrder,
  ORDER_FIELDS,
  adminQuery,
  buildEta,
  buildResult,
} from '~/lib/track.server';
import {SHOP} from '~/data/shop';

/**
 * The two chargeback-prevention emails (same rules as MeraFashion's
 * "mera-mail" worker, running inside our Oxygen deployment instead):
 *
 *   ON SCHEDULE — from day 10 after the order until the window has passed, parcel shipped
 *                 and not delivered: the 5-day arrival window + "Track my
 *                 order" + "if it's not there by <end>, contact us first".
 *   LATE        — once, when that window has passed (checked for 7 days after
 *                 the window end) and the parcel is still not delivered: sorry,
 *                 we are following it, next 5 delivery days, "nothing needed
 *                 from you, contact us if it's not there by <date>".
 *
 * Both are true no-reply. Nothing else is ever sent automatically.
 *
 * Skips: delivered (per the tracking data, not Shopify), cancelled, refunded,
 * not shipped yet, no email, test orders. Never the same email twice: sent
 * steps are remembered as order tags (`mail-onschedule`, `mail-late`), so the
 * admin shows them too. Tracking unavailable → never guess, retry tomorrow.
 * Max 15 parcels checked per run (BuckyDrop rate limit); the rest waits a day.
 *
 * Trigger: GET /api/chargeback-mail?key=<TRACK_ADMIN_KEY>[&dry=1] every
 * morning (a scheduled task does the call). MAIL_DRY_RUN=1 = report only.
 */

const DAY = 864e5;
const MAX_AGE_DAYS = 40;
const MAX_CHECKS = 15;
/** Extra parcel checks per run for the delivery-attempt email (separate budget). */
const MAX_ATTEMPT_CHECKS = 25;
const SITE = 'https://fastsneaker.com';
const CONTACT = `${SITE}/pages/contact`;

export interface MailEnv {
  RESEND_KEY?: string;
  NOREPLY_FROM?: string;
  MAIL_DRY_RUN?: string;
}

interface Window {
  days: number[];
  start: number;
  end: number;
  peak: number;
}

export interface RunReport {
  date: string;
  dryRun: boolean;
  sent: string[];
  skipped: string[];
  errors: string[];
}

// ------------------------------------------------------------ helpers ---

const utcDay = (ms: number) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

function fmt(ms: number, withMonth = true): string {
  const d = new Date(ms);
  const wd = d.toLocaleDateString('en-GB', {weekday: 'short', timeZone: 'UTC'});
  const mo = d.toLocaleDateString('en-GB', {month: 'short', timeZone: 'UTC'});
  return `${wd} ${d.getUTCDate()}${withMonth ? ' ' + mo : ''}`;
}

export function rangeText(w: Window): string {
  const sameMonth = new Date(w.start).getUTCMonth() === new Date(w.end).getUTCMonth();
  return `${fmt(w.start, !sameMonth)} – ${fmt(w.end)}`;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]!);

/**
 * The window we promised: from the dispatch date when shipped, else from the
 * order date. Same zones/numbers as the tracking page. May lie in the past —
 * that is how the job knows a parcel is late.
 */
export function windowFor(order: Pick<AdminOrder, 'createdAt' | 'fulfillments' | 'shippingAddress'>, now = Date.now()): Window {
  const country = order.shippingAddress?.countryCodeV2 ?? null;
  const shipped = order.fulfillments.find((f) => f.status === 'SUCCESS' && f.createdAt);
  // `now` far in the past keeps buildEta from bumping a passed window to "tomorrow".
  const eta = buildEta({
    country,
    landedAt: null,
    shippedAt: shipped ? Date.parse(shipped.createdAt) : null,
    placedAt: Date.parse(order.createdAt),
    now: 0,
  })!;
  return {days: eta.days, start: eta.days[0], end: eta.days[4], peak: eta.peak};
}

/** The next 5 delivery days — what a late customer is told. */
export function fallbackWindow(now = Date.now()): Window {
  const eta = buildEta({country: null, landedAt: null, shippedAt: null, placedAt: utcDay(now) - 30 * DAY, now})!;
  return {days: eta.days, start: eta.days[0], end: eta.days[4], peak: eta.peak};
}

// -------------------------------------------------------------- emails ---

function shell(o: {preheader: string; title: string; body: string; button?: {href: string; label: string}}): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:#fbf5f3;font-family:Helvetica,Arial,sans-serif;color:#111111">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fbf5f3"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:24px;overflow:hidden;border:1px solid #f4eae7">
  <tr><td style="height:6px;background:linear-gradient(90deg,#e56e46,#d03c0a);font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td align="center" style="padding:30px 28px 6px">
    <div style="font-size:22px;letter-spacing:.34em;font-weight:700;color:#111111">FAST</div>
    <div style="font-size:9px;letter-spacing:.42em;color:#80706b;margin-top:2px">SNEAKERS</div>
  </td></tr>
  <tr><td style="padding:18px 28px 0">
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:700;color:#111111">${o.title}</h1>
    ${o.body}
  </td></tr>
  ${o.button ? `<tr><td align="center" style="padding:22px 28px 6px"><a href="${esc(o.button.href)}" style="display:inline-block;padding:15px 34px;border-radius:999px;background:linear-gradient(87deg,#ca5d38,#d03c0a);color:#fff;font-weight:700;font-size:15px;text-decoration:none">${esc(o.button.label)}</a></td></tr>` : ''}
  <tr><td style="padding:22px 28px 28px;font-size:13px;line-height:1.6;color:#80706b">
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid #f4eae7">This is an automatic message from a no-reply address — replies are not read. Questions? Use our <a href="${CONTACT}" style="color:#a83208">contact page</a>; a person from our team answers within 1–5 business days.<br>With love, the ${esc(SHOP.name)} family · <a href="${SITE}" style="color:#a83208">fastsneaker.com</a></div>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

function etaCard(w: Window): string {
  const days = w.days
    .map((t) => {
      const peak = t === w.peak;
      const d = new Date(t);
      const wd = d.toLocaleDateString('en-GB', {weekday: 'short', timeZone: 'UTC'}).toUpperCase();
      const mo = d.toLocaleDateString('en-GB', {month: 'short', timeZone: 'UTC'});
      return `<td align="center" style="padding:0 3px"><div style="border-radius:14px;padding:10px 4px 9px;${peak ? 'background:#d03c0a;color:#fff' : 'background:#fff;border:1px solid #fbe8e2;color:#80706b'}"><div style="font-size:10px;letter-spacing:.06em;font-weight:600">${wd}</div><div style="font-size:19px;font-weight:700;line-height:1.2;${peak ? '' : 'color:#111111'}">${d.getUTCDate()}</div><div style="font-size:10px;${peak ? 'color:#fde9e2' : 'color:#b8a8a3'}">${mo}</div></div></td>`;
    })
    .join('');
  return `<div style="margin:16px 0 0;padding:16px;border-radius:18px;background:#fef6f3">
    <div style="font-size:11px;letter-spacing:.18em;font-weight:700;color:#a83208">ESTIMATED ARRIVAL</div>
    <div style="font-size:20px;font-weight:700;color:#111111;margin:4px 0 10px">${esc(rangeText(w))}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${days}</tr></table>
  </div>`;
}

const p = (t: string) => `<p style="margin:0 0 12px;font-size:15.5px;line-height:1.6;color:#404349">${t}</p>`;

interface MailInput {
  orderName: string;
  firstName: string | null;
  w: Window;
  trackUrl: string;
  now?: number;
}

export function onScheduleEmail({orderName, firstName, w, trackUrl}: MailInput) {
  const name = firstName ? esc(firstName) : 'there';
  const title = `Your order ${esc(orderName)} is on schedule`;
  const body =
    p(`Hi ${name}, your parcel is on its way and on schedule. Here is when to expect it:`) +
    etaCard(w) +
    p(`<span style="display:block;margin-top:14px">Delivery is tracked all the way to your door. If anything looks off, or it is not there by <b>${esc(fmt(w.end))}</b>, <a href="${CONTACT}" style="color:#a83208;font-weight:600">contact us here</a> first — we sort it out straight away.</span>`);
  return {
    subject: `Your order ${orderName} is on schedule — arriving ${rangeText(w)}`,
    html: shell({preheader: `Estimated arrival ${rangeText(w)}`, title, body, button: {href: trackUrl, label: 'Track my order'}}),
  };
}

export function lateEmail({orderName, firstName, w, trackUrl, now = Date.now()}: MailInput) {
  const name = firstName ? esc(firstName) : 'there';
  const nw = fallbackWindow(now);
  const title = `Your order ${esc(orderName)} is running late — we are on it`;
  const body =
    p(`Hi ${name}, we expected your parcel by ${esc(fmt(w.end))} and it has not been delivered yet. We are sorry about that — this can happen with a busy sorting centre, and we are following it closely.`) +
    etaCard(nw) +
    p(`<span style="display:block;margin-top:14px">Nothing is needed from you. If it is not there by <b>${esc(fmt(nw.end))}</b>, <a href="${CONTACT}" style="color:#a83208;font-weight:600">contact us here</a> and we will make it right.</span>`);
  return {
    subject: `Order ${orderName}: running late — we are on it`,
    html: shell({preheader: 'We are following your parcel closely', title, body, button: {href: trackUrl, label: 'Track my order'}}),
  };
}

/**
 * DELIVERY ATTEMPT FAILED (owner, 17 Nov 2026): sent once, as soon as the
 * tracking shows the courier tried to deliver and could not. Tells the
 * customer to contact the delivery company to arrange a new delivery or
 * pickup — parcels left unclaimed go back and are not refunded (return policy).
 */
export function attemptEmail({
  orderName,
  firstName,
  trackUrl,
  carrier,
  trackingNumber,
}: MailInput & {carrier?: string | null; trackingNumber?: string | null}) {
  const name = firstName ? esc(firstName) : 'there';
  const who = carrier ? esc(carrier) : 'the delivery company';
  const title = `We tried to deliver your order ${esc(orderName)}`;
  const body =
    p(`Hi ${name}, the courier tried to deliver your parcel but could not hand it over — usually because nobody was home or the address could not be reached.`) +
    p(`<b>Please contact ${who} as soon as possible</b> to arrange a new delivery or to pick the parcel up. Have your tracking number ready${
      trackingNumber ? `: <b style="font-family:ui-monospace,Menlo,monospace">${esc(trackingNumber)}</b>` : ''
    }. You will often find a card or text message from the courier with the details.`) +
    p(`Parcels that are not collected are sent back after a short time, so please do not wait. If you need help, <a href="${CONTACT}" style="color:#a83208;font-weight:600">contact us here</a>.`);
  return {
    subject: `Order ${orderName}: delivery attempt failed — please contact ${carrier ?? 'the courier'}`,
    html: shell({preheader: 'The courier could not deliver your parcel', title, body, button: {href: trackUrl, label: 'Track my order'}}),
  };
}

export function toText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/(p|div|h1|tr)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ----------------------------------------------------------------- run ---

type StepKey = 'onschedule' | 'late' | 'attempt';
const STEPS: Array<{key: Exclude<StepKey, 'attempt'>; build: typeof onScheduleEmail; due: (age: number, w: Window, today: number) => boolean}> = [
  // From day 10 until the promised window has passed (not just days 10-12), so a missed
  // run, a full queue or an order older than the job itself still gets its email.
  {key: 'onschedule', build: onScheduleEmail, due: (age, w, today) => age >= 10 && w.end >= today && age <= MAX_AGE_DAYS},
  {key: 'late', build: lateEmail, due: (age, w, today) => age >= 12 && w.end < today && today - w.end <= 7 * DAY && age <= MAX_AGE_DAYS},
];
const tagFor = (key: StepKey) => `mail-${key}`;

const ORDERS_QUERY = `
  query ChargebackMailOrders($query: String!, $after: String) {
    orders(first: 50, after: $after, query: $query, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes { ${ORDER_FIELDS} test }
    }
  }
`;

const TAG_MUTATION = `
  mutation ChargebackMailTag($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) { userErrors { message } }
  }
`;

async function candidateOrders(env: Env, now: number, minAgeDays = 9): Promise<Array<AdminOrder & {test?: boolean}>> {
  const from = new Date(now - (MAX_AGE_DAYS + 1) * DAY).toISOString().slice(0, 10);
  const to = new Date(now - minAgeDays * DAY).toISOString().slice(0, 10);
  // No "status:open": Shopify auto-archives fulfilled orders, exactly the ones in transit.
  const query = `created_at:>=${from} created_at:<=${to}`;
  const out: Array<AdminOrder & {test?: boolean}> = [];
  let after: string | null = null;
  for (let i = 0; i < 10; i++) {
    const d: {orders: {pageInfo: {hasNextPage: boolean; endCursor: string}; nodes: Array<AdminOrder & {test?: boolean}>}} =
      await adminQuery(env, ORDERS_QUERY, {query, after});
    out.push(...d.orders.nodes);
    if (!d.orders.pageInfo.hasNextPage) break;
    after = d.orders.pageInfo.endCursor;
  }
  return out;
}

function skipReason(o: AdminOrder & {test?: boolean}): string | null {
  if (o.test) return 'test order';
  if (!o.email) return 'no email';
  if (o.cancelledAt) return 'cancelled';
  if (/REFUNDED/.test(o.displayFinancialStatus ?? '')) return 'refunded';
  if ((o.sourceName ?? '').toLowerCase() === 'etsy') return 'etsy';
  if (!o.fulfillments.some((f) => f.status === 'SUCCESS' && f.trackingInfo.some((t) => t.number))) return 'not shipped yet';
  return null;
}

function trackUrlFor(o: AdminOrder): string {
  const num = o.fulfillments.flatMap((f) => f.trackingInfo).find((t) => t.number)?.number;
  const base = `${SITE}/pages/track-order`;
  return num ? `${base}?nums=${encodeURIComponent(num)}` : `${base}?order=${encodeURIComponent(o.name.replace('#', ''))}`;
}

async function sendResend(env: Env & MailEnv, mail: {to: string; subject: string; html: string}): Promise<string> {
  if (!env.RESEND_KEY || !env.NOREPLY_FROM) throw new Error('RESEND_KEY / NOREPLY_FROM not set');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {authorization: `Bearer ${env.RESEND_KEY}`, 'content-type': 'application/json'},
    body: JSON.stringify({from: env.NOREPLY_FROM, to: [mail.to], subject: mail.subject, html: mail.html, text: toText(mail.html)}),
  });
  const j = (await r.json().catch(() => ({}))) as {id?: string};
  if (!r.ok || !j.id) throw new Error(`Resend ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j.id;
}

async function tagOrder(env: Env, id: string, tag: string) {
  const d = await adminQuery<{tagsAdd: {userErrors: Array<{message: string}>}}>(env, TAG_MUTATION, {id, tags: [tag]});
  if (d.tagsAdd.userErrors.length) throw new Error('tagsAdd: ' + d.tagsAdd.userErrors[0].message);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runChargebackMail(
  env: Env & MailEnv,
  opts: {now?: number; dryRun?: boolean} = {},
): Promise<RunReport> {
  const now = opts.now ?? Date.now();
  const dryRun = opts.dryRun ?? env.MAIL_DRY_RUN !== '0';
  const today = utcDay(now);
  const report: RunReport = {date: new Date(now).toISOString().slice(0, 10), dryRun, sent: [], skipped: [], errors: []};

  const orders = await candidateOrders(env, now);
  const todo: Array<{o: AdminOrder; age: number; w: Window; due: typeof STEPS}> = [];
  for (const o of orders) {
    const age = Math.floor((today - utcDay(Date.parse(o.createdAt))) / DAY);
    const reason = skipReason(o);
    if (reason) {
      report.skipped.push(`${o.name}: ${reason}`);
      continue;
    }
    const w = windowFor(o, now);
    const tags = new Set(o.tags ?? []);
    // Never send "on schedule" after "running late" went out.
    const due = STEPS.filter(
      (s) => s.due(age, w, today) && !tags.has(tagFor(s.key)) && !(s.key === 'onschedule' && tags.has(tagFor('late'))),
    );
    for (const s of STEPS) if (s.due(age, w, today) && tags.has(tagFor(s.key))) report.skipped.push(`${o.name}: ${s.key} already sent`);
    if (due.length) todo.push({o, age, w, due});
  }
  // Most urgent first: day-10 email (3-day window) before late (7-day window); youngest first.
  const prio = (x: {due: typeof STEPS}) => (x.due[0].key === 'onschedule' ? 0 : 1);
  todo.sort((a, b) => prio(a) - prio(b) || a.age - b.age);

  const tracked = new Map<string, Awaited<ReturnType<typeof buildResult>>>();
  let checks = 0;
  for (const {o, age, w, due} of todo) {
    if (checks >= MAX_CHECKS) {
      report.skipped.push(`${o.name}: queue full, retry tomorrow`);
      continue;
    }
    checks++;
    // Delivery status from the tracking data (Shopify almost never knows), same module the page uses.
    let delivered = false;
    let known = false;
    try {
      const result = await buildResult(o);
      tracked.set(o.name, result);
      const parcels = result.parcels;
      if (parcels.length && !parcels.some((pc) => pc.liveUpdatesPaused)) {
        known = true;
        delivered = parcels.every((pc) => pc.view.stage >= 4);
      }
    } catch {
      known = false;
    }
    await sleep(600);
    if (delivered) {
      report.skipped.push(`${o.name}: delivered (tracking)`);
      continue;
    }
    if (!known) {
      report.skipped.push(`${o.name}: tracking unavailable, retry tomorrow`);
      continue;
    }
    for (const step of due) {
      const mail = step.build({orderName: o.name, firstName: o.customer?.firstName ?? o.shippingAddress?.firstName ?? null, w, trackUrl: trackUrlFor(o), now});
      try {
        if (!dryRun) {
          await sendResend(env, {to: o.email!, subject: mail.subject, html: mail.html});
          if (o.id) await tagOrder(env, o.id, tagFor(step.key));
        }
        report.sent.push(`${o.name} ${step.key} (day ${age}) → ${o.email!.replace(/(.).+(@.+)/, '$1***$2')}`);
      } catch (e) {
        report.errors.push(`${o.name} ${step.key}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  await runAttemptMail(env, {now, dryRun, today, report, tracked});
  return report;
}

/**
 * Delivery-attempt pass: every shipped, undelivered order from day 3 on whose
 * tracking shows a failed delivery attempt gets the attempt email once (tag
 * `mail-attempt`). Results from the main pass are reused; the rest are checked
 * in a shuffled order so successive runs cover all orders.
 */
async function runAttemptMail(
  env: Env & MailEnv,
  ctx: {now: number; dryRun: boolean; today: number; report: RunReport; tracked: Map<string, Awaited<ReturnType<typeof buildResult>>>},
) {
  const {now, dryRun, today, report, tracked} = ctx;
  const orders = (await candidateOrders(env, now, 3)).filter(
    (o) => !skipReason(o) && !(o.tags ?? []).includes(tagFor('attempt')),
  );
  for (let i = orders.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [orders[i], orders[j]] = [orders[j], orders[i]];
  }
  let checks = 0;
  for (const o of orders) {
    let result = tracked.get(o.name);
    if (!result) {
      if (checks >= MAX_ATTEMPT_CHECKS) break;
      checks++;
      try {
        result = await buildResult(o);
      } catch {
        continue;
      }
      await sleep(600);
    }
    const parcel = result.parcels.find((pc) => !pc.liveUpdatesPaused && pc.view.attempt && pc.view.stage < 4);
    if (!parcel) continue;
    const age = Math.floor((today - utcDay(Date.parse(o.createdAt))) / DAY);
    const trackingNumber = o.fulfillments.flatMap((f) => f.trackingInfo).find((t) => t.number)?.number ?? null;
    const mail = attemptEmail({
      orderName: o.name,
      firstName: o.customer?.firstName ?? o.shippingAddress?.firstName ?? null,
      w: windowFor(o, now),
      trackUrl: trackUrlFor(o),
      now,
      carrier: parcel.view.localCarrier,
      trackingNumber,
    });
    try {
      if (!dryRun) {
        await sendResend(env, {to: o.email!, subject: mail.subject, html: mail.html});
        if (o.id) await tagOrder(env, o.id, tagFor('attempt'));
      }
      report.sent.push(`${o.name} attempt (day ${age}${parcel.view.localCarrier ? ', ' + parcel.view.localCarrier : ''}) → ${o.email!.replace(/(.).+(@.+)/, '$1***$2')}`);
    } catch (e) {
      report.errors.push(`${o.name} attempt: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/** Sample emails for /api/chargeback-mail?preview=onschedule|late&cc=US */
export function previewMail(step: StepKey, cc: string, now = Date.now()): string {
  const late = step === 'late';
  const sample = {
    createdAt: new Date(now - (late ? 24 : 10) * DAY).toISOString(),
    shippingAddress: {firstName: 'Sarah', countryCodeV2: cc || 'NL'},
    fulfillments: [{createdAt: new Date(now - (late ? 18 : 4) * DAY).toISOString(), status: 'SUCCESS', trackingInfo: [{number: 'QP262974325GB', company: null}], fulfillmentLineItems: {nodes: []}}],
  } as unknown as AdminOrder;
  const w = windowFor(sample, now);
  if (step === 'attempt')
    return attemptEmail({orderName: '#1040', firstName: 'Sarah', w, trackUrl: `${SITE}/pages/track-order?nums=QP262974325GB`, now, carrier: 'PostNL', trackingNumber: 'QP262974325GB'}).html;
  const build = late ? lateEmail : onScheduleEmail;
  return build({orderName: '#1040', firstName: 'Sarah', w, trackUrl: `${SITE}/pages/track-order?nums=QP262974325GB`, now}).html;
}
