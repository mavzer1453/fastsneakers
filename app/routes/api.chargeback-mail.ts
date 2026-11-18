import type {Route} from './+types/api.chargeback-mail';
import {previewMail, runChargebackMail, type MailEnv} from '~/lib/chargebackMail.server';

/**
 * Manual / scheduled entry point for the two chargeback-prevention emails.
 *
 *   GET /api/chargeback-mail?key=<TRACK_ADMIN_KEY>            run (MAIL_DRY_RUN decides)
 *   GET /api/chargeback-mail?key=…&dry=1                      report only, nothing sent
 *   GET /api/chargeback-mail?key=…&preview=onschedule&cc=US   see the email in the browser
 *   GET /api/chargeback-mail?key=…&preview=late&cc=NL
 *   GET /api/chargeback-mail?key=…&preview=attempt     the delivery-attempt-failed email
 *
 * A scheduled task calls the first URL every morning. Without TRACK_ADMIN_KEY
 * set, everything here answers 403.
 */
export async function loader({request, context}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const env = context.env as Env & MailEnv & {TRACK_ADMIN_KEY?: string};
  const key = url.searchParams.get('key') ?? '';
  if (!env.TRACK_ADMIN_KEY || key !== env.TRACK_ADMIN_KEY) {
    return new Response('forbidden', {status: 403, headers: {'cache-control': 'no-store'}});
  }

  const preview = url.searchParams.get('preview');
  if (preview) {
    const html = previewMail(preview === 'late' ? 'late' : preview === 'attempt' ? 'attempt' : 'onschedule', (url.searchParams.get('cc') ?? 'NL').toUpperCase());
    return new Response(html, {headers: {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}});
  }

  try {
    const report = await runChargebackMail(env, {
      dryRun: url.searchParams.get('dry') === '1' ? true : undefined,
    });
    console.log('chargeback-mail', JSON.stringify({sent: report.sent.length, skipped: report.skipped.length, errors: report.errors.length, dryRun: report.dryRun}));
    return new Response(JSON.stringify(report, null, 1), {
      headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'},
    });
  } catch (e) {
    return new Response(JSON.stringify({error: e instanceof Error ? e.message : String(e)}), {
      status: 500,
      headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'},
    });
  }
}
