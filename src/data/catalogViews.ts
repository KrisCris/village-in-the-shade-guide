import type { Catalog, Entity } from './types';

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
  for (const crop of crops) for (const stage of (crop.harvest_stages ?? []) as Array<{ item_id: string; state: number }>) {
    if (![1, 4, 9].includes(stage.state) || primary.has(stage.item_id)) continue;
    const item = catalog.entities.find(e => e.kind === 'items' && e.id === stage.item_id);
    if (item) products.set(item.id, { ...item, seasons: stage.state === 9 ? ['autumn'] : crop.seasons,
      cultivation_method: `${crop.name.zh_hans} · ${stage.state === 9 ? '留株过季' : '生长途中采收'}` });
  }
  return [...crops, ...products.values()];
}
