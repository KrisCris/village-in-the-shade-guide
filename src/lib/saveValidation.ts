import type { SaveChange, SaveModel } from './saveModel';
import type { SlotEdits } from './saveItems';
import { readSigned } from './ser';
import { SAVE_RULES } from './saveRules';
import { APPEARANCE, APPEARANCE_FIELDS } from './saveAppearance';
import quests from '../../data/sources/game-save-quests.json';
import catalog from '../../data/sources/game-save-tools.json';
const itemIds = new Set(catalog.itemIds.map(String));

export function validateCuratedChanges(model: SaveModel, changes: SaveChange[], slots: SlotEdits): void {
  const byOffset = new Map(changes.map(change => [change.field.offset, change.after]));
  const value = (path: string): number => {
    const node = model.doc.resolve(path);
    if (!node) throw new Error(`存档缺少 ${path}`);
    return Number(byOffset.get(node.offset) ?? readSigned(model.doc, node));
  };
  const touched = (path: string) => { const node = model.doc.resolve(path); return !!node && byOffset.has(node.offset); };
  const questMap = model.doc.resolve('questMap_');
  if (questMap) for (const pointer of model.doc.children(questMap).filter((_, index) => index % 2 === 1)) {
    const id = model.doc.resolve('p/dataID_', pointer), state = model.doc.resolve('p/state_', pointer), check = model.doc.resolve('p/checkLevel_', pointer);
    const quest = id && quests.quests.find(quest => quest.id === Number(readSigned(model.doc, id)));
    if (!quest || !state || !check) continue;
    if (byOffset.has(state.offset) && !['0', '1', '2', '3'].includes(byOffset.get(state.offset)!)) throw new Error('任务记录状态无效。');
    if (byOffset.has(check.offset) && ![-1, 0, ...quest.steps.map(step => step.level + 1)].includes(Number(byOffset.get(check.offset)))) throw new Error('任务清单进度不在游戏定义内。');
  }
  for (const [key, rule] of [['hp_', SAVE_RULES.hp], ['st_', SAVE_RULES.stamina]] as const) {
    const path = `pPlayerStatus_/p/${key}`;
    if (!touched(`${path}/max_`) && !touched(`${path}/this->value_`)) continue;
    const max = value(`${path}/max_`), current = value(`${path}/this->value_`);
    if (touched(`${path}/max_`) && (max < rule.initial || max > rule.max || max % rule.unit !== 0)) throw new Error(`${key === 'hp_' ? '生命' : '体力'}上限必须按完整${key === 'hp_' ? '心' : '体力段'}设置。`);
    if (!Number.isInteger(current) || current < 0 || current > max) throw new Error('当前生命或体力不能超过修改后的上限。');
  }
  for (const spec of APPEARANCE_FIELDS) {
    const prefix = 'pPlayerStatus_/p/';
    if (!touched(prefix + spec.idPath) && !(spec.colorPath && touched(prefix + spec.colorPath))) continue;
    const row = APPEARANCE[spec.kind].find(row => row.id === value(prefix + spec.idPath));
    if (!row) throw new Error(`${spec.label}不在游戏资料表内。`);
    if (spec.colorPath && row.variants.length && !row.variants.some(variant => variant.color === value(prefix + spec.colorPath))) throw new Error(`${spec.label}没有这个配色。`);
  }
  const validateItem = (count: string, rank: string) => {
    if (!/^\d+$/.test(count) || Number(count) < 1 || Number(count) > SAVE_RULES.stackMax) throw new Error(`物品数量必须在 1 到 ${SAVE_RULES.stackMax} 之间。`);
    if (!/^\d+$/.test(rank) || Number(rank) > 4) throw new Error('物品等级不在游戏定义内。');
  };
  for (const [offset, assignment] of Object.entries(slots)) {
    const container = model.containers.find(container => container.slots.some(slot => slot.pointer === Number(offset)));
    if (!container) throw new Error('物品栏位无效。');
    if (container.kind === 'tool') throw new Error('工具栏只能更换同类工具的升级版本。');
    if (assignment) { validateItem(assignment.count, assignment.rank); if (!itemIds.has(assignment.itemId)) throw new Error('物品不在游戏资料表内。'); }
  }
  for (const container of model.containers) for (const slot of container.slots) {
    const item = slot.item;
    if (!item || Object.hasOwn(slots, slot.pointer)) continue;
    if ([item.countOffset, item.rankOffset, item.itemIdOffset].some(offset => byOffset.has(offset))) {
      validateItem(byOffset.get(item.countOffset) ?? item.count, byOffset.get(item.rankOffset) ?? item.rank);
      if (byOffset.has(item.itemIdOffset) && !itemIds.has(byOffset.get(item.itemIdOffset)!)) throw new Error('物品不在游戏资料表内。');
    }
  }
}

/** Warnings are about edits, not unverifiable achievement thresholds. */
export function achievementWarnings(model: SaveModel, changes: SaveChange[], slots: SlotEdits): string[] {
  const warnings = new Set<string>();
  const money = model.doc.resolve('money_/this->value_');
  for (const change of changes) {
    const quests = model.doc.resolve('questMap_');
    if (quests && change.field.offset >= quests.offset && change.field.offset < quests.end) warnings.add('任务清单与剧情标记彼此独立，修改记录不会补发奖励或执行剧情事件。');
    if (change.field.offset === money?.offset && /^\d+$/.test(change.after) && BigInt(change.after) > BigInt(change.before)) warnings.add('增加持有金钱可能影响累计金钱与成就条件。');
    if (change.field.label === '好感' && change.field.max === String(SAVE_RULES.npcHearts.at(-1)) && Number(change.after) >= SAVE_RULES.npcHearts.at(-1)!) warnings.add('满级村民好感可能触发关系或成就进度。');
  }
  if (Object.values(slots).some(slot => slot?.rank === '4') || changes.some(change => change.field.label.endsWith('rank_') && change.after === '4')) warnings.add('品牌物品可能影响图鉴或成就进度。');
  return [...warnings];
}
