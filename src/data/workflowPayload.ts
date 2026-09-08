import type {Catalog,Entity} from './types';
import {compactItemRow} from './itemList';

/** Keep complete process chains and the same demand groups as the seasonal guide. */
export function workflowPayload(catalog:Catalog):Entity[] {
 const operations=catalog.entities.filter(e=>['crops','processes','machines'].includes(e.kind)||e.kind==='activities'&&e.id.startsWith('BUNDLE_ID_'));
 return [...operations,...catalog.entities.filter(e=>e.kind==='items'||e.kind==='store-offers')].map(e=>({
  ...compactItemRow(e),...(e.kind==='machines'?{description:e.description}:{}),
 }));
}
