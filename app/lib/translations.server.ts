/**
 * Server half of `~/lib/translations`: every language, registered up front.
 *
 * A server render cannot pause to fetch a language file, and the worker
 * serves all six languages from one process, so it simply holds them all.
 * The `.server` suffix keeps this file — and with it the static imports of
 * all six maps — out of the browser bundle, which is the entire point: the
 * browser loads one language on demand instead.
 *
 * Imported for its side effect by `entry.server.tsx`. Nothing else needs it.
 */
import {registerLanguage} from '~/lib/translations';
import {DE} from './translations/de';
import {FR} from './translations/fr';
import {ES} from './translations/es';
import {IT} from './translations/it';
import {SV} from './translations/sv';
import {TR} from './translations/tr';

registerLanguage('DE', DE);
registerLanguage('FR', FR);
registerLanguage('ES', ES);
registerLanguage('IT', IT);
registerLanguage('SV', SV);
registerLanguage('TR', TR);
