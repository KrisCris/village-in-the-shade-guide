import { Converter } from 'opencc-js';
import { normalizeSearch } from './clientSearch';
import { buildPinyinAliases } from './serverSearchAliases';
import type { Catalog, Entity, Name } from './types';

const toSimplified = Converter({ from: 'tw', to: 'cn' });
const buildId = '24969282';

function kindFromPath(path: string) {
  return path.split('/').at(-1)!.replace('.json', '');
}

function withSearchAliases(name: Name): Name {
  const simplified = toSimplified(name.zh_hant || name.zh_hans);
  const aliases = [...new Set([simplified, ...name.aliases, ...buildPinyinAliases(simplified), ...buildPinyinAliases(name.zh_hant)])];
  return { ...name, zh_hans: simplified, aliases };
}

function setSearchText(entity: Entity) {
  entity.searchText = normalizeSearch([entity.name.zh_hans, entity.name.zh_hant, entity.name.ja, entity.name.internal, ...entity.name.aliases].join(' '));
}

export function iconItemIdFor(entity: Entity) {
  const outputItemId = (entity.output as { item_id?: string } | undefined)?.item_id;
  return entity.kind === 'crops'
    ? (entity.harvest_item_ids as string[] | undefined)?.[0]
      ?? (entity.id.startsWith('CROPS_ID_OBJECT_') ? entity.id.replace(/^CROPS_ID_OBJECT_/, 'ITEM_ID_OBJECT_') : undefined)
    : ['processes', 'craft-recipes', 'cooking-recipes'].includes(entity.kind)
      ? outputItemId
      : entity.kind === 'store-offers'
        ? String(entity.item_id ?? '') || undefined
        : entity.kind === 'hunt-rewards'
          ? String(entity.certificate_item_id ?? entity.item_id ?? '') || undefined
          : ['items', 'machines', 'fish'].includes(entity.kind) ? entity.id : undefined;
}

export function buildCatalog(input: Record<string, unknown>, generatedAt = new Date().toISOString()): Catalog {
  const entities: Entity[] = [];
  const byId: Record<string, Entity> = {};
  const counts: Record<string, number> = {};
  for (const [path, raw] of Object.entries(input)) {
    const kind = kindFromPath(path);
    const rows = raw as Array<Record<string, unknown> & { id: string; name?: Name }>;
    counts[kind] = rows.length;
    for (const row of rows) {
      const fallback: Name = { zh_hans: row.id, zh_hant: '', ja: '', internal: row.id, aliases: [row.id], review_status: 'internal' };
      const entity = { ...row, kind, name: withSearchAliases(row.name ?? fallback), searchText: '' } as Entity;
      setSearchText(entity);
      entities.push(entity);
      byId[entity.id] ??= entity;
    }
  }

  const itemIds = new Set(entities.filter((entity) => entity.kind === 'items').map((entity) => entity.id));
  for (const entity of entities) {
    const itemId = iconItemIdFor(entity);
    if (itemId && itemIds.has(itemId)) entity.icon_path = `/icons/generated/items/${itemId}.webp`;
  }

  for (const entity of entities) {
    if (entity.kind === 'store-offers' || entity.kind === 'hunt-rewards') {
      const target = byId[String(entity.item_id ?? entity.certificate_item_id ?? '')];
      if (target) {
        const prefix = entity.kind === 'store-offers' ? '商店出售' : '狩猎报酬';
        const traditionalPrefix = entity.kind === 'store-offers' ? '商店出售' : '狩獵報酬';
        entity.name = withSearchAliases({
          ...target.name,
          zh_hans: `${prefix}：${target.name.zh_hans}`,
          zh_hant: `${traditionalPrefix}：${target.name.zh_hant || target.name.zh_hans}`,
          internal: entity.id,
          aliases: [...target.name.aliases, entity.id],
        });
        setSearchText(entity);
      }
    }
    if (entity.kind === 'crops') {
      const seed = byId[(entity.seed_item_ids as string[] | undefined)?.[0] ?? ''];
      const harvest = byId[(entity.harvest_item_ids as string[] | undefined)?.[0] ?? ''];
      entity.buy_price = seed?.buy_price ?? null;
      entity.sell_price = harvest?.sell_price ?? null;
      const growthDays = Number(entity.growth_days ?? 0);
      const regrowDays = Number(entity.regrow_days ?? 0);
      const harvests = growthDays > 0 ? (regrowDays > 0 ? 1 + Math.max(0, Math.floor((28 - growthDays) / regrowDays)) : Math.max(1, Math.floor(28 / growthDays))) : 0;
      const totalSeedCost = Number(entity.buy_price ?? 0) * (regrowDays > 0 ? 1 : harvests);
      entity.harvests_per_season = harvests || null;
      entity.season_profit = harvests ? Number(entity.sell_price ?? 0) * harvests - totalSeedCost : null;
      entity.profit_per_day = harvests ? Number(entity.season_profit) / 28 : null;
      for (const target of [entity, ...(entity.harvest_item_ids as string[] | undefined ?? []).map((id) => byId[id])]) {
        if (target) {
          target.quality_eligible = true;
          target.quality_source = entity.id;
        }
      }
      for (const seedId of entity.seed_item_ids as string[] | undefined ?? []) {
        if (byId[seedId]) byId[seedId].quality_eligible = false;
      }
    }
    if (entity.kind === 'processes') {
      const output = entity.output as { item_id?: string; quantity?: number } | undefined;
      const outputItem = byId[output?.item_id ?? ''];
      entity.sell_price = outputItem ? Number(outputItem.sell_price ?? 0) * Number(output?.quantity ?? 1) : null;
      const inputs = (entity.inputs ?? []) as Array<{ item_id: string; quantity: number }>;
      entity.buy_price = inputs.reduce((sum, input) => sum + Number(byId[input.item_id]?.sell_price ?? 0) * input.quantity, 0);
      const days = Number(entity.duration_minutes ?? 0) / 1440;
      entity.profit_per_day = days > 0 ? (Number(entity.sell_price ?? 0) - Number(entity.buy_price ?? 0)) / days : null;
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const process of entities.filter((row) => row.kind === 'processes')) {
      const inputs = process.inputs as Array<{ item_id: string; quantity: number }>;
      const output = process.output as { item_id: string; quantity: number } | undefined;
      if (!output || !inputs.some((input) => byId[input.item_id]?.quality_eligible)) continue;
      for (const target of [process, byId[output.item_id]]) {
        if (target && !target.quality_eligible) {
          target.quality_eligible = true;
          target.quality_source = process.id;
          changed = true;
        }
      }
    }
  }
  return { buildId, generatedAt, entities, byId, counts };
}
