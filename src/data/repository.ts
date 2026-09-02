import type { Catalog, Entity } from './types';
import { Converter } from 'opencc-js';

const toSimplified = Converter({ from: 'tw', to: 'cn' });

const modules = import.meta.glob('../../data/generated/build-24969282/entities/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

function kindFromPath(path: string) {
  return path.split('/').at(-1)!.replace('.json', '');
}

export function normalizeSearch(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function buildCatalog(input: Record<string, unknown> = modules): Catalog {
  const entities: Entity[] = [];
  const byId: Record<string, Entity> = {};
  const counts: Record<string, number> = {};
  for (const [path, raw] of Object.entries(input)) {
    const kind = kindFromPath(path);
    const rows = raw as Array<Record<string, unknown> & { id: string; name?: Entity['name'] }>;
    counts[kind] = rows.length;
    for (const row of rows) {
      const fallback = { zh_hans: row.id, zh_hant: '', ja: '', internal: row.id, aliases: [row.id], review_status: 'internal' };
      const rawName = row.name ?? fallback;
      const simplified = toSimplified(rawName.zh_hant || rawName.zh_hans);
      const name = { ...rawName, zh_hans: simplified, aliases: [...new Set([simplified, ...rawName.aliases])] };
      const entity: Entity = {
        ...row,
        kind,
        name,
        searchText: normalizeSearch([name.zh_hans, name.zh_hant, name.ja, name.internal, ...name.aliases].join(' ')),
      };
      entities.push(entity);
      byId[entity.id] ??= entity;
    }
  }
  for (const entity of entities) {
    if (entity.kind === 'store-offers' || entity.kind === 'hunt-rewards') {
      const targetId = String(entity.item_id ?? entity.certificate_item_id ?? '');
      const target = byId[targetId];
      if (target) {
        const prefix = entity.kind === 'store-offers' ? '商店出售' : '狩猎报酬';
        entity.name = { ...target.name, zh_hans: `${prefix}：${target.name.zh_hans}`, internal: entity.id, aliases: [...target.name.aliases, entity.id] };
        entity.searchText = normalizeSearch([entity.name.zh_hans, ...entity.name.aliases].join(' '));
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
  return { buildId: '24969282', generatedAt: new Date().toISOString(), entities, byId, counts };
}

let cached: Catalog | undefined;
export function getCatalog() {
  return cached ??= buildCatalog();
}

export function rankEntities(query: string, rows: Entity[]) {
  const q = normalizeSearch(query);
  if (!q) return rows;
  return rows
    .filter((entity) => entity.name && Array.isArray(entity.name.aliases))
    .map((entity) => {
      const names = [entity.name.zh_hans, ...entity.name.aliases].map(normalizeSearch);
      const haystack = entity.searchText || normalizeSearch([entity.name.zh_hans, entity.name.zh_hant, entity.name.ja, entity.id, ...entity.name.aliases].join(' '));
      const score = names.includes(q) ? 0 : names.some((n) => n.startsWith(q)) ? 1 : haystack.includes(q) ? 2 : 99;
      return { entity, score };
    })
    .filter(({ score }) => score < 99)
    .sort((a, b) => a.score - b.score || a.entity.name.zh_hans.localeCompare(b.entity.name.zh_hans, 'zh-CN'))
    .map(({ entity }) => entity);
}

export function entityUrl(entity: Pick<Entity, 'kind' | 'id'>) {
  return `/data/${encodeURIComponent(entity.kind)}/${encodeURIComponent(entity.id)}/`;
}
