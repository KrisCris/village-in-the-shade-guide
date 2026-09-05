import type { Catalog, Entity } from '../data/types';
import { findCatalogEntity } from '../data/entityLookup';
import type { Quality } from './quality';
import { formatQualityPrice, qualityLabel, qualityPrice } from './quality';
import { calculateEntityCropProfit, calculateEntityProcessProfit } from './profit';

export type RelationGroupKey = 'acquisition' | 'materials' | 'outputs' | 'machines' | 'used-in' | 'requirements' | 'unlocks' | 'other' | 'likes' | 'dislikes' | 'gift-recipients';

export type RelationRowModel = {
  key: string;
  entity: Entity;
  quantity?: number;
  buyPrice?: string;
  sellPrice?: string;
  buyLabel?: string;
  sellLabel?: string;
  fixedPrice: boolean;
  chips: string[];
  note?: string;
};

export type RelationGroup = {
  key: RelationGroupKey;
  label: string;
  rows: RelationRowModel[];
};

export type EntityFact = { label: string; value: string; price?: boolean };
export type EntityProfitModel = { inputCost: string; outputValue: string; net: string; perDay: string; harvests?: number };
export type EntityDetailModel = {
  entity: Entity;
  quality: Quality;
  qualityName: string;
  facts: EntityFact[];
  profit: EntityProfitModel | null;
  groups: RelationGroup[];
  locations: Array<{ id: string; name: string; secondary: string }>;
  processingPlans: EntityDetailModel[];
};

const groupLabels: Record<RelationGroupKey, string> = {
  acquisition: '获取方式',
  materials: '制作材料',
  outputs: '产出物',
  machines: '加工机械',
  'used-in': '用于制作 / 加工',
  other: '其他关系',
  requirements: '建筑、供奉与交付用途',
  unlocks: '解锁条件与能力',
  likes: '喜爱的物品',
  dislikes: '讨厌的物品',
  'gift-recipients': '送礼喜好',
};
const groupOrder: RelationGroupKey[] = ['likes', 'dislikes', 'acquisition', 'materials', 'outputs', 'machines', 'unlocks', 'used-in', 'requirements', 'gift-recipients', 'other'];
const seasons: Record<string, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

function numberText(value: number, approximate = false): string {
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${approximate ? '≈' : ''}${shown}`;
}

function durationChip(minutes: unknown): string | null {
  if (typeof minutes !== 'number') return null;
  return minutes % 1440 === 0 ? `${minutes / 1440} 日` : `${minutes} 分钟`;
}

function priceText(entity: Entity, field: 'buy_price' | 'sell_price', quality: Quality, quantity = 1): string | undefined {
  const base = entity[field];
  if (typeof base !== 'number') return undefined;
  const selectedQuality = field === 'buy_price' ? 'normal' : quality;
  const result = qualityPrice(base * quantity, field === 'sell_price' && entity.quality_eligible === true, selectedQuality);
  if (!result) return undefined;
  return `${formatQualityPrice(result)} · ${result.fixed ? '固定' : qualityLabel(selectedQuality)}`;
}

function itemQuantity(value: unknown): { item_id?: string; quantity?: number } {
  return value && typeof value === 'object' ? value as { item_id?: string; quantity?: number } : {};
}

function relationQuantity(candidate: Entity, targetIds: Set<string>): number | undefined {
  const input = ((candidate.inputs ?? []) as Array<{ item_id?: string; quantity?: number }>).find((row) => row.item_id && targetIds.has(row.item_id));
  return input ? Number(input.quantity ?? 1) : undefined;
}

function recipeInputs(recipe: Entity): Array<{ item_id?: string; quantity?: number }> {
  return (recipe.inputs ?? []) as Array<{ item_id?: string; quantity?: number }>;
}

function recipeMachineIds(recipe: Entity): string[] {
  return (recipe.machine_ids as string[] | undefined) ?? (recipe.machine_id ? [String(recipe.machine_id)] : []);
}

export function buildRelationGroups(entity: Entity, catalog: Catalog, quality: Quality): RelationGroup[] {
  const groups = new Map<RelationGroupKey, RelationRowModel[]>();
  const seen = new Set<string>();
  const add = (group: RelationGroupKey, target: Entity | undefined, options: {
    quantity?: number;
    chips?: Array<string | null | undefined>;
    note?: string;
    buyPrice?: string;
    sellPrice?: string;
    buyLabel?: string;
    sellLabel?: string;
    key?: string;
  } = {}) => {
    if (!target) return;
    const key = `${group}:${options.key ?? target.id}:${options.quantity ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    const rows = groups.get(group) ?? [];
    rows.push({
      key,
      entity: target,
      quantity: options.quantity,
      buyPrice: options.buyPrice ?? (target.kind === 'processes' ? undefined : priceText(target, 'buy_price', quality)),
      sellPrice: options.sellPrice ?? priceText(target, 'sell_price', quality),
      buyLabel: options.buyLabel,
      sellLabel: options.sellLabel,
      fixedPrice: target.quality_eligible !== true,
      chips: [...new Set((options.chips ?? []).filter((chip): chip is string => Boolean(chip)))],
      note: options.note,
    });
    groups.set(group, rows);
  };

  const addInputs = (source: Entity, group: RelationGroupKey, context: string) => {
    for (const input of recipeInputs(source)) {
      if (!input.item_id) continue;
      add(group, findCatalogEntity(catalog, input.item_id, 'items'), { quantity: Number(input.quantity ?? 1), chips: [context] });
    }
  };
  const addOutput = (source: Entity, group: RelationGroupKey, context?: string) => {
    const output = itemQuantity(source.output);
    if (!output.item_id) return;
    const outputEntity = findCatalogEntity(catalog, output.item_id, 'items');
    const profit = source.kind === 'processes' ? calculateEntityProcessProfit(source, catalog, quality) : null;
    add(group, outputEntity, {
      quantity: Number(output.quantity ?? 1),
      chips: [context ?? source.name.zh_hans, durationChip(source.duration_minutes), profit ? `净增值 ${profit.net >= 0 ? '+' : ''}${numberText(profit.net)}` : null],
      sellPrice: outputEntity ? priceText(outputEntity, 'sell_price', quality, Number(output.quantity ?? 1)) : undefined,
      key: `${source.id}:${output.item_id}`,
    });
  };

  if (entity.kind === 'crops') {
    for (const seedId of entity.seed_item_ids as string[] | undefined ?? []) {
      add('acquisition', catalog.byId[seedId], { quantity: 1, chips: ['种子 / 树苗'] });
    }
    const stages = (entity.harvest_stages ?? []) as Array<{state:number;growth_points:number;item_id:string;quantity:number}>;
    if (stages.length) {
      for (const stage of stages.filter(s=>[1,4,9].includes(s.state))) add('outputs',catalog.byId[stage.item_id],{
        quantity:stage.quantity,key:`${stage.state}:${stage.growth_points}:${stage.item_id}`,
        chips:[stage.state===9 ? '入秋转化' : stage.state===4 ? '再次收获' : '初次生长',stage.state===9 ? '留株过季' : `成长点 ${stage.growth_points}`],
      });
    } else for (const harvestId of entity.harvest_item_ids as string[] | undefined ?? []) {
      add('outputs', catalog.byId[harvestId], { quantity: Number(entity.harvest_quantity ?? 1), chips: ['收获物'] });
    }
  }

  if (entity.kind === 'machines') {
    for (const recipe of catalog.entities.filter((row) => row.kind === 'craft-recipes' && itemQuantity(row.output).item_id === entity.id)) {
      addInputs(recipe, 'materials', recipe.name.zh_hans);
    }
    for (const process of catalog.entities.filter((row) => row.kind === 'processes' && ((row.machine_ids as string[] | undefined) ?? []).includes(entity.id))) {
      addOutput(process, 'outputs', process.name.zh_hans);
    }
  }

  if (['processes', 'craft-recipes', 'cooking-recipes'].includes(entity.kind)) {
    addInputs(entity, 'materials', entity.kind === 'processes' ? '加工原料' : '配方材料');
    addOutput(entity, 'outputs');
    for (const machineId of recipeMachineIds(entity)) {
      add('machines', findCatalogEntity(catalog, machineId, 'machines'), { chips: [entity.kind === 'processes' ? '加工机械' : '制作工具'] });
    }
  }

  if (entity.kind === 'characters') {
    for (const gift of (entity.gift_items ?? []) as Array<{ item_id?: string; preference?: number }>) {
      if (gift.item_id && (gift.preference === 1 || gift.preference === -1)) add(gift.preference === 1 ? 'likes' : 'dislikes', findCatalogEntity(catalog, gift.item_id, 'items'));
    }
  }

  if (entity.related_item_id) add('other', catalog.byId[String(entity.related_item_id)], { chips: ['关联物品'] });
  if (entity.kind === 'activities') {
    addInputs(entity, 'materials', String(entity.activity_type));
    for (const reward of (entity.rewards ?? []) as Array<{item_id: string; quantity: number}>) add('outputs', catalog.byId[reward.item_id], {quantity: reward.quantity});
    for (const id of (entity.prerequisites ?? []) as string[]) add('unlocks', catalog.byId[id], {chips:['前置能力']});
  }

  const subjectIds = new Set<string>([entity.id]);
  if (entity.kind === 'crops') for (const id of entity.harvest_item_ids as string[] | undefined ?? []) subjectIds.add(id);

  for (const source of catalog.entities) {
    if (source.id === entity.id) continue;
    if (source.kind === 'characters') {
      for (const gift of (source.gift_items ?? []) as Array<{item_id:string;preference:number}>) {
        if (subjectIds.has(gift.item_id) && [1,-1].includes(gift.preference)) add('gift-recipients',source,{chips:[gift.preference === 1 ? '喜爱' : '讨厌']});
      }
    }
    if (source.kind === 'activities') {
      const quantity = relationQuantity(source, subjectIds);
      if (quantity != null) add(source.activity_type === '祠堂能力 / 配方解锁' ? 'unlocks' : 'requirements', source, {quantity, chips:[String(source.activity_type), String(source.location || ''), ...(source.conditions as string[] ?? [])]});
      if (entity.unlock_flag && source.unlock_flag === entity.unlock_flag) add('unlocks', source, {chips:['解锁此配方', String(source.location || '')]});
      const reward = ((source.rewards ?? []) as Array<{item_id: string; quantity: number}>).find((reward) => subjectIds.has(reward.item_id));
      if (reward) add('acquisition', source, {quantity:reward.quantity, chips:['完成后获得',String(source.location || '')]});
    }
    if (source.kind === 'store-offers' && source.item_id && subjectIds.has(String(source.item_id))) {
      const saleSeasons = ((source.seasons ?? []) as string[]).map(s=>seasons[s] ?? s).join('、');
      add('acquisition', source, { buyPrice: priceText(catalog.byId[String(source.item_id)], 'buy_price', quality), chips: [String(source.location || '商店'), ...(saleSeasons ? [`${saleSeasons}季出售`] : []), ...(source.conditions as string[] ?? [])] });
    }
    if (source.kind === 'crops' && ((source.harvest_item_ids as string[] | undefined) ?? []).some((id) => subjectIds.has(id))) {
      add('acquisition', source, { chips: [((source.seasons as string[] | undefined) ?? []).map((season) => seasons[season] ?? season).join('、'), '种植收获'] });
    }
    if (source.kind === 'hunt-rewards') {
      const reward = ((source.rewards ?? []) as Array<{ item_id?: string; quantity?: number }>).find((row) => row.item_id && subjectIds.has(row.item_id));
      if (reward) add('acquisition', source, { quantity: Number(reward.quantity ?? 1), chips: ['狩猎报酬'] });
    }
    if (['processes', 'craft-recipes', 'cooking-recipes'].includes(source.kind)) {
      const output = itemQuantity(source.output);
      if (output.item_id && subjectIds.has(output.item_id)) {
        if (source.unlock_flag) {
          for (const condition of catalog.entities.filter((candidate) => candidate.kind === 'activities' && candidate.unlock_flag === source.unlock_flag)) {
            add('unlocks', condition, {chips:['解锁制作配方', String(condition.location || ''), ...(condition.conditions as string[] ?? [])]});
          }
        }
        const sourceType = source.kind === 'processes' ? '机械加工' : source.kind === 'cooking-recipes' ? '料理' : '制作';
        const profit = source.kind === 'processes' ? calculateEntityProcessProfit(source, catalog, quality) : null;
        const inputEntities = recipeInputs(source).flatMap((input) => {
          const item = input.item_id ? findCatalogEntity(catalog, input.item_id, 'items') : undefined;
          return item ? [{ item, quantity: Number(input.quantity ?? 1) }] : [];
        });
        const outputEntity = findCatalogEntity(catalog, output.item_id, 'items');
        const inputQuality = inputEntities.some(({ item }) => item.quality_eligible === true);
        add('acquisition', source, {
          quantity: Number(output.quantity ?? 1),
          chips: [
            sourceType,
            ...(source.conditions as string[] ?? []),
            durationChip(source.duration_minutes),
            profit ? `净收益 ${profit.net >= 0 ? '+' : ''}${numberText(profit.net, !Number.isInteger(profit.net))}` : null,
            profit?.perDay != null ? `日净收益 ${profit.perDay >= 0 ? '+' : ''}${numberText(profit.perDay, !Number.isInteger(profit.perDay))}` : null,
          ],
          note: inputEntities.length ? `原料：${inputEntities.map(({ item, quantity }) => `${item.name.zh_hans} ×${quantity}`).join(' + ')}` : undefined,
          buyPrice: profit ? `${numberText(profit.inputCost, !Number.isInteger(profit.inputCost))} · ${inputQuality ? qualityLabel(quality) : '固定'}` : undefined,
          sellPrice: profit ? `${numberText(profit.outputValue, !Number.isInteger(profit.outputValue))} · ${outputEntity?.quality_eligible ? qualityLabel(quality) : '固定'}` : undefined,
          buyLabel: profit ? '成本' : undefined,
          sellLabel: profit ? '产值' : undefined,
          key: source.id,
        });
        for (const machineId of recipeMachineIds(source)) {
          add('machines', findCatalogEntity(catalog, machineId, 'machines'), { chips: [source.kind === 'processes' ? '加工机械' : '制作工具'] });
        }
      }
      const quantity = relationQuantity(source, subjectIds);
      if (quantity != null) add('used-in', source, { quantity, chips: [source.kind === 'processes' ? '机械加工' : source.kind === 'cooking-recipes' ? '料理' : '制作', durationChip(source.duration_minutes)] });
    }
  }

  return groupOrder.flatMap((key) => {
    const rows = groups.get(key);
    return rows?.length ? [{ key, label: groupLabels[key], rows }] : [];
  });
}

function entitySellPrice(entity: Entity, catalog: Catalog, quality: Quality): string | undefined {
  if (typeof entity.sell_price === 'number') return priceText(entity, 'sell_price', quality);
  if (entity.kind === 'crops') {
    const harvest = catalog.byId[(entity.harvest_item_ids as string[] | undefined)?.[0] ?? ''];
    return harvest ? priceText(harvest, 'sell_price', quality) : undefined;
  }
  const output = itemQuantity(entity.output);
  const outputEntity = output.item_id ? catalog.byId[output.item_id] : undefined;
  return outputEntity ? priceText(outputEntity, 'sell_price', quality, Number(output.quantity ?? 1)) : undefined;
}

export function buildEntityDetailModel(entity: Entity, catalog: Catalog, quality: Quality): EntityDetailModel {
  const facts: EntityFact[] = [];
  const addFact = (label: string, value: string | number | null | undefined, price = false) => {
    if (value != null && value !== '') facts.push({ label, value: String(value), ...(price ? { price: true } : {}) });
  };
  if (entity.kind === 'characters') addFact('生日', entity.birthday_season && entity.birthday_day ? `${seasons[String(entity.birthday_season)]} ${entity.birthday_day} 日` : '无生日数据');
  if (!['processes','activities'].includes(entity.kind)) addFact('买入价', priceText(entity, 'buy_price', quality), true);
  addFact('地点', entity.location as string | undefined);
  addFact('栽培方式', entity.cultivation_method as string | undefined);
  addFact('所需金额', entity.money_cost as number | undefined, true);
  addFact('条件', ((entity.conditions ?? []) as string[]).join('；'));
  addFact('卖出价', entitySellPrice(entity, catalog, quality), true);
  addFact(entity.kind === 'store-offers' ? '出售季节' : entity.kind === 'fish' ? '出现季节' : '生长季节', ((entity.seasons as string[] | undefined) ?? []).map((season) => seasons[season] ?? season).join('、'));
  addFact('首次成熟', typeof entity.growth_days === 'number' ? `${entity.growth_days} 日` : null);
  addFact('每次收获', typeof entity.harvest_quantity === 'number' ? `${entity.harvest_quantity} 个` : null);
  addFact('再次收获', typeof entity.regrow_days === 'number' ? `${entity.regrow_days} 日` : null);
  addFact('成熟所需成长点', entity.growth_points as number | null);
  addFact('再生所需成长点', entity.regrow_points as number | null);
  addFact('加工时间', typeof entity.duration_minutes === 'number' ? `${entity.duration_minutes} 分钟（${durationChip(entity.duration_minutes)}）` : null);
  addFact('身份（日文）', entity.role_ja as string | null);
  addFact('数据编号', entity.numeric_id as number | null);
  addFact('内部 ID', entity.id);

  const result = calculateEntityProcessProfit(entity, catalog, quality) ?? calculateEntityCropProfit(entity, catalog, quality);
  let inputEstimated = false;
  let outputEstimated = false;
  if (entity.kind === 'crops') {
    const harvest = catalog.byId[(entity.harvest_item_ids as string[] | undefined)?.[0] ?? ''];
    outputEstimated = Boolean(harvest && qualityPrice(harvest.sell_price, harvest.quality_eligible === true, quality)?.exact === false);
  } else if (entity.kind === 'processes') {
    inputEstimated = ((entity.inputs ?? []) as Array<{ item_id?: string }>).some(({ item_id }) => {
      const input = item_id ? catalog.byId[item_id] : undefined;
      return Boolean(input && qualityPrice(input.sell_price, input.quality_eligible === true, quality)?.exact === false);
    });
    const output = itemQuantity(entity.output);
    const outputEntity = output.item_id ? catalog.byId[output.item_id] : undefined;
    outputEstimated = Boolean(outputEntity && qualityPrice(outputEntity.sell_price, outputEntity.quality_eligible === true, quality)?.exact === false);
  }
  const profit = result ? {
    inputCost: numberText(result.inputCost, inputEstimated),
    outputValue: numberText(result.outputValue, outputEstimated),
    net: numberText(result.net, inputEstimated || outputEstimated),
    perDay: result.perDay == null ? '数据不足' : numberText(result.perDay, inputEstimated || outputEstimated),
    ...(result.harvests ? { harvests: result.harvests } : {}),
  } : null;
  const places = (entity.locations ?? []) as Array<{ location_id: string; name: { zh_hans: string; ja?: string } }>;
  const seasonNames: Record<string, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
  const locations = places.flatMap((location) => {
    const appearances = entity.appearances?.filter((entry) => entry.location_id === location.location_id) ?? [];
    if (!appearances.length) return [{id: location.location_id, name: location.name.zh_hans, secondary: location.name.ja || location.location_id}];
    return Object.entries(seasonNames).flatMap(([season, label]) => {
      const times = [...new Set(appearances.filter((entry) => entry.season === season).map((entry) => entry.time_range))].filter(Boolean);
      return times.length ? [{id: `${location.location_id}-${season}`, name: `${location.name.zh_hans} · ${label}`, secondary: times.join(' / ')}] : [];
    });
  });
  const processingPlans = ['items','crops','machines'].includes(entity.kind) ? catalog.entities.filter((source) => source.kind === 'processes' && (itemQuantity(source.output).item_id === entity.id || (entity.harvest_item_ids as string[] | undefined)?.includes(itemQuantity(source.output).item_id ?? ''))).map((source) => buildEntityDetailModel(source, catalog, quality)) : [];
  const embeddedIds = new Set(processingPlans.map((plan) => plan.entity.id));
  const groups = buildRelationGroups(entity, catalog, quality).flatMap((group) => {
    const rows = group.key === 'acquisition' ? group.rows.filter((row) => !embeddedIds.has(row.entity.id)) : group.rows;
    return rows.length ? [{ ...group, rows }] : [];
  });
  return { entity, quality, qualityName: qualityLabel(quality), facts, profit, groups, locations, processingPlans };
}
