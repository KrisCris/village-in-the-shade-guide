import type {APIRoute} from 'astro';
import {explorerData} from '../../data/quarry';
import {localeFromPath} from '../../i18n/locales';

// The quarry floor explorer loads this on demand. Mirrored under each language prefix; the URL decides the language.
export const GET:APIRoute=({url})=>new Response(JSON.stringify(explorerData(localeFromPath(url.pathname))),{headers:{'Content-Type':'application/json; charset=utf-8'}});
