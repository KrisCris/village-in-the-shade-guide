import { Converter } from 'opencc-js';
import { normalizeSearch } from './clientSearch';
import { buildPinyinAliases } from './serverSearchAliases';
import type { Catalog, Entity, Name } from './types';
import { calculateCropProfit } from '../domain/profit';
import type { CropGrowthSource } from '../domain/cropGrowth';
import mapMarkers from '../../data/sources/game-map-markers.json';
import characterPortraits from '../../data/sources/official-character-portraits.json';
import livestockProducts from '../../data/sources/game-livestock-products.json';
import machineCapacities from '../../data/sources/game-machine-capacities.json';
import cropGrowth from '../../data/sources/game-crop-growth.json';
import { defaultLocale, type Locale } from '../i18n/locales';
import { translatorFor } from '../i18n/server';
import type { Translate } from '../i18n/translate';

const toSimplified = Converter({ from: 'tw', to: 'cn' });
const buildId = '25311578';

function kindFromPath(path: string) {
  return path.split('/').at(-1)!.replace('.json', '');
}

function withSearchAliases(name: Name): Name {
  const readable=(text:string)=>text.replace(/<cmd\b[^>]*>/g,'').replace(/^\s*[＋+]\s*/,'').trim();
  // Official Simplified Chinese ships since build 25311578; OpenCC only fills
  // authored overrides and names the game leaves untranslated.
  const simplified = readable(name.translations?.['zh-CN'] || toSimplified(name.zh_hant || name.zh_hans));
  const aliases = [...new Set([simplified, ...name.aliases, ...buildPinyinAliases(simplified), ...buildPinyinAliases(name.zh_hant)])];
  return { ...name, zh_hans: simplified, zh_hant: readable(name.zh_hant), ja: readable(name.ja), aliases };
}

/**
 * Display name for a page language: official game text first, then the
 * authored catalog. The localized Name keeps every original in aliases and
 * translations; only zh_hans (the primary display field) changes.
 */
function localizeName(name: Name, locale: Locale, t: Translate): Name {
  if (locale === defaultLocale || name.review_status === 'internal') return name;
  const official = locale === 'ja' ? name.translations?.ja || name.ja : name.translations?.['zh-TW'] || name.zh_hant;
  const readable = official?.replace(/<cmd\b[^>]*>/g, '').trim();
  // Keep the Simplified Chinese name reachable for cross-language labels.
  return { ...name, zh_hans: readable || translateLabel(name.zh_hans, t), translations: { ...name.translations, 'zh-CN': name.zh_hans } };
}

const isName = (value: unknown): value is Name =>
  !!value && typeof value === 'object' && 'zh_hans' in value && 'review_status' in value;

/** Localize every nested Name (category, locations, ...) in a raw row. */
function localizeNames<T>(value: T, locale: Locale, t: Translate): T {
  if (locale === defaultLocale) return value;
  if (isName(value)) return localizeName(value, locale, t) as T;
  if (Array.isArray(value)) return value.map(v => localizeNames(v, locale, t)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k.endsWith('translations') ? v : localizeNames(v, locale, t)])) as T;
  return value;
}

const hasCjk = (value: string) => /[぀-ヿ㐀-鿿]/.test(value); // i18n-ignore

/**
 * Translate an authored data label. Generated conditions share a prefix with
 * a flag or event name, so the prefix is one key and the subject another.
 * Bare identifiers (flags, unnamed IDs) are not prose and stay as they are.
 */
export function translateLabel(value: string, t: Translate): string {
  if (!hasCjk(value)) return value;
  // i18n-ignore-start — source-language prefixes written by the extractor.
  const match = value.match(/^(不满足|需满足条件|需未满足条件|怪异事件开始)：(.+)$/);
  if (!match) return t(value);
  const subject = translateLabel(match[2], t);
  switch (match[1]) {
    case '不满足': return t('不满足：{condition}', { condition: subject });
    case '需满足条件': return t('需满足条件：{condition}', { condition: subject });
    case '需未满足条件': return t('需未满足条件：{condition}', { condition: subject });
    default: return t('怪异事件开始：{name}', { name: subject });
  }
  // i18n-ignore-end
}

function setSearchText(entity: Entity) {
  // Activities are found by what they are and where they happen (建筑, 村长家交付委托目录).
  const context = entity.kind === 'activities' ? [entity.activity_type, entity.location].filter((value): value is string => typeof value === 'string') : [];
  entity.searchText = normalizeSearch([entity.name.zh_hans, entity.name.zh_hant, entity.name.ja, entity.name.internal, ...entity.name.aliases, ...(entity.category_name?.aliases ?? []), ...context].join(' '));
}

export function iconItemIdFor(entity: Entity) {
  if(entity.kind==='livestock') return livestockProducts.animals.find(a=>a.livestock_id===entity.id)?.variant_item_ids[0];
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

export function buildCatalog(input: Record<string, unknown>, generatedAt = new Date().toISOString(), locale: Locale = defaultLocale, translate?: Translate): Catalog {
  const t = translate ?? translatorFor(locale);
  // Official game text for this language, else the authored catalog.
  const text = (value: string, translations?: Record<string, string>) =>
    locale === defaultLocale ? value : translations?.[locale] || translateLabel(value, t);
  const localized = (name: Name) => localizeName(name, locale, t);
  const entities: Entity[] = [];
  const byId: Record<string, Entity> = {};
  const counts: Record<string, number> = {};
  for (const [path, raw] of Object.entries(input)) {
    const kind = kindFromPath(path);
    const rows = raw as Array<Record<string, unknown> & { id: string; name?: Name }>;
    counts[kind] = rows.length;
    for (const row of rows) {
      const fallback: Name = { zh_hans: row.id, zh_hant: '', ja: '', internal: row.id, aliases: [row.id], review_status: 'internal' };
      const entity = { ...localizeNames(row, locale, t), kind, name: localized(withSearchAliases(row.name ?? fallback)), searchText: '' } as Entity;
      if (kind === 'machines') {
        entity.capacity = machineCapacities.machines.find(machine => machine.item_id === entity.id)?.capacity;
      }
      if (kind === 'crops') entity.growth = (cropGrowth.crops as unknown as Record<string, CropGrowthSource>)[entity.id] ?? null;
      if(kind==='characters') {
        const portrait=characterPortraits.portraits.find(p=>p.character_id===entity.id);
        if(portrait){entity.icon_path=portrait.path;entity.portrait_source=portrait.source;}
      }
      if(kind==='livestock') entity.icon_path=livestockProducts.animals.find(a=>a.livestock_id===entity.id)?.icon_path;
      if (row.category_name) entity.category_name = localized(withSearchAliases(row.category_name as Name));
      // Authored labels from the extractor (shop, conditions, activity types).
      if (typeof entity.location === 'string') entity.location = text(toSimplified(entity.location));
      if (typeof entity.activity_type === 'string') entity.activity_type = text(entity.activity_type);
      if (typeof entity.cultivation_method === 'string') entity.cultivation_method = text(entity.cultivation_method);
      if (Array.isArray(entity.ingredient_options)) entity.ingredient_options = (entity.ingredient_options as Array<Record<string, unknown>>).map(option => typeof option.feature_name === 'string' ? { ...option, feature_name: text(option.feature_name) } : option);
      // i18n-ignore-next-line — rewrites extractor wording before translation.
      if (Array.isArray(entity.conditions)) entity.conditions = entity.conditions.map((condition) => typeof condition === 'string' ? text(toSimplified(condition).replace('尚未解锁此款外观', '仅在尚未拥有此款外观时出售，购买后解锁').replace('尚未解锁此制作配方', '仅在尚未学会此配方时出售')) : condition);
      const translations = (field: string) => entity[`${field}_translations`] as Record<string, string> | undefined;
      for (const field of ['description','objective']) if(typeof entity[field]==='string') {
        const value = translations(field)?.['zh-CN'] ? entity[field] as string : toSimplified(entity[field] as string);
        entity[field] = text(value, translations(field));
      }
      const stepTranslations = entity.step_translations as Array<Record<string, string>> | undefined;
      if(Array.isArray(entity.steps))entity.steps=entity.steps.map((step,index)=>typeof step==='string'?text(stepTranslations?.[index]?.['zh-CN']?step:toSimplified(step),stepTranslations?.[index]):step);
      setSearchText(entity);
      entities.push(entity);
      byId[entity.id] ??= entity;
    }
  }

  const itemIds = new Set(entities.filter((entity) => entity.kind === 'items').map((entity) => entity.id));
  for(const entity of entities.filter(e=>e.kind==='items')) {
    const markers=mapMarkers.markers.filter(m=>'item_numeric_id' in m&&m.item_numeric_id===entity.numeric_id);
    if(markers.length)entity.map_locations=markers.map(m=>({
      label:m.map.includes('0000')?t('村庄'):m.map.includes('2160')?t('附身草丛'):t('隘口'),
      x:m.x,y:m.y,anchor:m.anchor,
      progress:'progress_label' in m&&m.progress_label?text(toSimplified(m.progress_label)):'',
    }));
  }
  for (const fish of entities.filter((entity) => entity.kind === 'fish')) {
    const item = entities.find((entity) => entity.kind === 'items' && entity.id === fish.id);
    if (item) {
      item.locations = fish.locations;
      item.appearances = fish.appearances;
      item.seasons = fish.seasons;
      item.time_periods = fish.time_periods;
    }
  }
  for (const entity of entities) {
    const itemId = iconItemIdFor(entity);
    if (itemId && itemIds.has(itemId)) entity.icon_path = `/icons/generated/items/${itemId}.webp`;
  }

  for (const entity of entities) {
    if (entity.kind === 'store-offers' || entity.kind === 'hunt-rewards') {
      const target = byId[String(entity.item_id ?? entity.certificate_item_id ?? '')];
      if (target) {
        const label = entity.kind === 'store-offers' ? t('商店出售：{name}', { name: target.name.zh_hans }) : t('狩猎报酬：{name}', { name: target.name.zh_hans });
        // i18n-ignore-start — zh_hant is a search alias, not page text.
        const traditionalPrefix = entity.kind === 'store-offers' ? '商店出售' : '狩獵報酬';
        entity.name = {
          ...withSearchAliases({
            ...target.name,
            zh_hans: label,
            zh_hant: `${traditionalPrefix}：${target.name.zh_hant || target.name.zh_hans}`,
            // i18n-ignore-end
            internal: entity.id,
            aliases: [...target.name.aliases, entity.id],
            // The target's official names lack the listing prefix.
            translations: undefined,
          }),
          zh_hans: label,
        };
        setSearchText(entity);
      }
    }
    if (entity.kind === 'crops') {
      const seed = byId[(entity.seed_item_ids as string[] | undefined)?.[0] ?? ''];
      const harvest = byId[(entity.harvest_item_ids as string[] | undefined)?.[0] ?? ''];
      entity.description = seed?.description ?? harvest?.description ?? '';
      entity.harvest_names = ((entity.harvest_item_ids ?? []) as string[]).map(id=>byId[id]?.name.zh_hans).filter(Boolean).join(' / ');
      entity.searchText += ' ' + ((entity.harvest_item_ids ?? []) as string[]).map(id=>byId[id]?.searchText ?? '').join(' ');
      entity.buy_price = seed?.buy_price ?? null;
      entity.sell_price = harvest?.sell_price ?? null;
      const growthDays = Number(entity.growth_days ?? 0);
      const regrowDays = Number(entity.regrow_days ?? 0);
      const profit = entity.perennial == null && growthDays > 0 && entity.buy_price != null && entity.sell_price != null
        ? calculateCropProfit({seedCost: Number(entity.buy_price), harvestValue: Number(entity.sell_price) * Number(entity.harvest_quantity ?? 1), growthDays, regrowDays})
        : null;
      entity.harvests_per_season = profit?.harvests ?? null;
      entity.season_profit = profit?.net ?? null;
      entity.profit_per_day = profit?.perDay ?? null;
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
  return { buildId, generatedAt, locale, entities, byId, counts };
}
