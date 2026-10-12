import type {APIRoute} from 'astro';
import {getCatalog} from '../../data/repository';
import {explorerPayload} from '../../data/explorerPayload';
import {localeFromPath} from '../../i18n/locales';

export function getStaticPaths() {
  const catalog=getCatalog();
  return [
    ...Object.keys(catalog.counts).map(kind=>({params:{list:`kind-${kind}`},props:{kind}})),
    ...[...new Set(catalog.entities.filter(e=>e.kind==='items'&&e.category_id).map(e=>e.category_id!))].map(category=>({params:{list:`category-${category}`},props:{kind:'items',category}})),
  ];
}
// Mirrored under each language prefix; the URL decides the language.
export const GET:APIRoute=({props,url})=>new Response(JSON.stringify(explorerPayload(getCatalog(localeFromPath(url.pathname)),props.kind,props.category)),{headers:{'Content-Type':'application/json; charset=utf-8'}});
