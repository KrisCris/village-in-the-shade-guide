import type { Catalog, Entity } from './types';
import { translatorFor } from '../i18n/server';

export function isPlantableCrop(entity: Entity) {
  return entity.kind === 'crops'
    && ((entity.seed_item_ids as string[] | undefined)?.length ?? 0) > 0
    && ((entity.harvest_item_ids as string[] | undefined)?.length ?? 0) > 0;
}

export function visibleRowsForKind(catalog: Catalog, kind: string) {
  const rows = catalog.entities.filter((entity) => entity.kind === kind);
  if (kind !== 'crops') return rows;
  const crops = rows.filter(isPlantableCrop);
  const primary = new Set(crops.map(c => (c.harvest_item_ids as string[])[0]));
  const products = new Map<string, Entity>();
  const t = translatorFor(catalog.locale ?? 'zh-CN');
  for (const crop of crops) for (const stage of (crop.harvest_stages ?? []) as Array<{ item_id: string; state: number }>) {
    if (![1, 4, 9].includes(stage.state) || primary.has(stage.item_id)) continue;
    const item = catalog.entities.find(e => e.kind === 'items' && e.id === stage.item_id);
    if (item) products.set(item.id, { ...item, seasons: stage.state === 9 ? ['autumn'] : crop.seasons,
      cultivation_method: stage.state === 9 ? t('{crop} · 留株过季', { crop: crop.name.zh_hans }) : t('{crop} · 生长途中采收', { crop: crop.name.zh_hans }) });
  }
  return [...crops, ...products.values()];
}
