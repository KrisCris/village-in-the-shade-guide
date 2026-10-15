import type { ReactNode } from 'react';
import { CROP_FORMS, MAP_CROPS, MAP_DATA, mapBuildingFlags, mapChangeGroups, withoutMapChanges, type MapChangeGroup, type MapEdits } from '../../lib/saveMap';
import { describeGameTime, valueProblem, type SaveChange, type SaveModel, type SaveSectionId } from '../../lib/saveModel';
import type { SlotEdits } from '../../lib/saveItems';
import { lookupName, type SaveNameTables } from '../../lib/saveNames';
import { animalHouses, animalResidents, ANIMALS, type AnimalEdits } from '../../lib/saveAnimals';
import { deviceIdentity, machineSpec, specialSpec, MACHINES, type MachineEdits } from '../../lib/saveMachines';
import { PROGRESSION, type ProgressEdits } from '../../lib/saveProgress';
import { UNLOCKS } from '../../lib/saveDeliveries';
import { ITEM_RANKS } from '../../lib/saveRules';
import { itemLabel } from './ItemGrid';
import { specialTitle } from './DeviceBrowser';
import { rowSubject } from './SaveDataTable';
import quests from '../../../data/sources/game-save-quests.json';
import { gameText } from '../../lib/saveText';
import { readSigned } from '../../lib/ser';
import { tr } from '../../i18n/active';

interface Line { key: string; label: ReactNode; text: ReactNode; undo: () => void; weight?: number; problem?: string | null }
type GroupId = SaveSectionId | 'machines';

const rankName = (rank: string | number | undefined) => ITEM_RANKS.find(entry => String(entry.value) === String(rank))?.label ?? String(rank);

export default function SaveChangeList({ model, names, changes, slotEdits, machines, progress, animals, map, onUndoDraft, onUndoSlots, onUndoMachine, onUndoProgress, onAnimals, onMap }: {
  model: SaveModel; names: SaveNameTables; changes: SaveChange[]; slotEdits: SlotEdits; machines: MachineEdits; progress: ProgressEdits; animals: AnimalEdits; map: MapEdits;
  onUndoDraft: (offset: number) => void; onUndoSlots: (pointers: number[]) => void; onUndoMachine: (key: string) => void;
  onUndoProgress: (group: keyof ProgressEdits, id: string) => void; onAnimals: (edits: AnimalEdits) => void; onMap: (edits: MapEdits) => void;
}) {
  const groups = new Map<GroupId, Line[]>();
  const push = (group: GroupId, line: Line) => groups.set(group, [...(groups.get(group) ?? []), line]);
  const containerName = (container: SaveModel['containers'][number]) => specialSpec(container) ? `${specialTitle(container, names)} #${deviceIdentity(model.doc, container)}` : container.title;

  // Field drafts land in the tab that shows them; container slots are items.
  const sectionOf = new Map<number, SaveSectionId>(), rowOf = new Map<number, string>();
  for (const section of model.sections) {
    for (const group of section.groups) for (const field of group.fields) sectionOf.set(field.offset, section.id);
    // Table cells share labels across rows (every NPC has 好感), so the row names the subject.
    for (const table of section.tables) for (const row of table.rows) {
      const subject = rowSubject(row, names);
      for (const field of row.cells) if (field) { sectionOf.set(field.offset, section.id); if (field.value !== subject && !field.label.includes(subject)) rowOf.set(field.offset, subject); }
    }
  }
  const slotFields = new Map<number, { title: string; index: number; itemId: string; kind: 'item' | 'count' | 'rank' | 'quality' | 'name' }>();
  for (const container of model.containers) {
    if (container.nameOffset !== undefined) slotFields.set(container.nameOffset, { title: containerName(container), index: -1, itemId: '', kind: 'name' });
    for (const slot of container.slots) if (slot.item) {
      const base = { title: containerName(container), index: slot.index, itemId: slot.item.itemId };
      slotFields.set(slot.item.itemIdOffset, { ...base, kind: 'item' });
      slotFields.set(slot.item.countOffset, { ...base, kind: 'count' });
      slotFields.set(slot.item.rankOffset, { ...base, kind: 'rank' });
      slotFields.set(slot.item.qualityOffset, { ...base, kind: 'quality' });
    }
  }
  const clock = model.doc.resolve('gameTime_/second_')?.offset;
  // Current HP/stamina are checked against the pending maximum on export, not the stored one.
  const current = new Set(['hp_', 'st_'].map(key => model.doc.resolve(`pPlayerStatus_/p/${key}/this->value_`)?.offset));
  const show = (change: SaveChange, value: string) => change.field.offset === clock && /^\d+$/.test(value) ? describeGameTime(BigInt(value))
    : lookupName(names, change.field.lookup, value) ?? (value || tr('（空）'));
  // Quest records are raw state_/checkLevel_ leaves; name the quest and say what the numbers mean.
  const questFields = new Map<number, { label: string; text: (value: string) => string }>();
  const questMap = model.doc.resolve('questMap_');
  if (questMap) for (const pointer of model.doc.children(questMap).filter((_, index) => index % 2 === 1)) {
    const id = model.doc.resolve('p/dataID_', pointer), state = model.doc.resolve('p/state_', pointer), check = model.doc.resolve('p/checkLevel_', pointer);
    const info = id && quests.quests.find(quest => quest.id === Number(readSigned(model.doc, id)));
    if (!info || !state || !check) continue;
    const title = gameText(info.name, info.nameTranslations).replace(/<[^>]+>/g, '').trim() || info.code;
    questFields.set(state.offset, { label: tr('{title} · 任务记录', { title }), text: value => ({ '0': tr('隐藏'), '1': tr('显示'), '2': tr('显示'), '3': tr('已完成') } as Record<string, string>)[value] ?? value });
    if (info.steps.length) questFields.set(check.offset, { label: tr('{title} · 清单进度', { title }), text: value => Number(value) < 0 ? tr('尚未完成清单项目') : tr('已完成 {done} / {total} 项', { done: info.steps.filter(step => step.level < Number(value)).length, total: info.steps.length }) });
  }
  for (const change of changes) {
    const slot = slotFields.get(change.field.offset), undo = () => onUndoDraft(change.field.offset);
    const quest = questFields.get(change.field.offset);
    if (quest) {
      push('quests', { key: `field:${change.field.offset}`, undo, label: quest.label, text: quest.text(change.before) === quest.text(change.after) ? `${quest.text(change.after)}（${change.before} → ${change.after}）` : `${quest.text(change.before)} → ${quest.text(change.after)}` });
      continue;
    }
    const problem = change.field.offset === clock && !/^\d+$/.test(change.after) ? tr('请输入有效日期和时间。')
      : valueProblem(current.has(change.field.offset) ? { ...change.field, max: undefined } : change.field, change.after);
    if (slot && slot.kind !== 'name') {
      const what = { item: tr('物品'), count: tr('数量'), rank: tr('品质'), quality: tr('品质加成') }[slot.kind];
      const value = (v: string) => slot.kind === 'rank' ? rankName(v) : show(change, v);
      push('items', { key: `field:${change.field.offset}`, undo, problem,
        label: tr('{container} 第 {number} 格', { container: slot.title, number: slot.index + 1 }),
        text: <>{slot.kind === 'item' ? null : <>{itemLabel(names, slot.itemId)} · </>}{what}：{value(change.before)} → {value(change.after)}</> });
      continue;
    }
    const quests = model.doc.resolve('questMap_');
    const section = slot ? 'items' : sectionOf.get(change.field.offset) ?? (quests && change.field.offset >= quests.offset && change.field.offset < quests.end ? 'quests' : 'raw');
    push(section, { key: `field:${change.field.offset}`, undo, problem, label: change.field.offset === clock ? tr('游戏时间') : rowOf.has(change.field.offset) ? `${rowOf.get(change.field.offset)} · ${change.field.label}` : change.field.label, text: <>{show(change, change.before)} → {show(change, change.after)}</> });
  }

  const slotPlace = new Map(model.containers.flatMap(container => container.slots.map(slot => [slot.pointer, { container, slot }] as const)));
  const where = (pointer: number) => { const place = slotPlace.get(pointer); return place ? tr('{container} 第 {number} 格', { container: containerName(place.container), number: place.slot.index + 1 }) : String(pointer); };
  const describe = (itemId: string, count: string, rank: string) => `${itemLabel(names, itemId)} ×${count}${rank !== '0' ? ` · ${rankName(rank)}` : ''}`;
  // A move is stored as two edits: the item at its new slot, and its old slot emptied (or swapped).
  // Showing and undoing them as one line keeps a half-undo from duplicating or losing the item.
  const movedFrom = new Map<number, number>();
  for (const [key, value] of Object.entries(slotEdits)) if (value?.sourcePointer !== undefined && value.sourcePointer !== Number(key)) movedFrom.set(Number(key), value.sourcePointer);
  const paired = new Set([...movedFrom.values()].filter(source => slotEdits[source] === null));
  for (const [key, value] of Object.entries(slotEdits)) {
    const pointer = Number(key), place = slotPlace.get(pointer);
    if (!place || paired.has(pointer)) continue;
    const source = movedFrom.get(pointer);
    if (value && source !== undefined) {
      const swapped = slotEdits[source], swap = !!swapped && swapped.sourcePointer === pointer;
      if (swap && pointer > source) continue;
      push('items', { key: `slot:${pointer}`, undo: () => onUndoSlots([pointer, source]),
        label: <>{where(source)} → {where(pointer)}</>,
        text: <>{swap ? tr('交换：{a} ↔ {b}', { a: describe(value.itemId, value.count, value.rank), b: describe(swapped.itemId, swapped.count, swapped.rank) }) : tr('移动：{item}', { item: describe(value.itemId, value.count, value.rank) })}</> });
      continue;
    }
    const item = place.slot.item;
    push('items', { key: `slot:${pointer}`, undo: () => onUndoSlots([pointer]), label: where(pointer),
      text: <>{item ? describe(item.itemId, item.count, item.rank) : tr('空')} → {value ? describe(value.itemId, value.count, value.rank) : tr('清空')}</> });
  }

  for (const [key, edit] of Object.entries(machines)) {
    const [id, index] = key.split('/'), container = model.containers.find(entry => entry.id === id), spec = container && machineSpec(container);
    const recipe = edit.recipeId === undefined ? undefined : MACHINES.processes.find(entry => entry.id === edit.recipeId);
    const parts = [
      recipe ? tr('加入加工：{item} ×{count}', { item: itemLabel(names, String(recipe.output)), count: recipe.count }) : tr('现有任务'),
      edit.rank !== undefined ? tr('材料品质：{rank}', { rank: rankName(edit.rank) }) : '',
      edit.finish ? tr('立即完成') : recipe ? tr('从现在开始计时') : '',
    ].filter(Boolean);
    push('machines', { key: `machine:${key}`, undo: () => onUndoMachine(key),
      label: <>{spec ? itemLabel(names, String(spec.itemId)) : tr('加工设备')} · {tr('栏位 {number}', { number: Number(index) + 1 })} <small>#{container ? deviceIdentity(model.doc, container) : id}</small></>,
      text: parts.join('，') });
  }

  for (const [group, entries] of Object.entries(progress) as [keyof ProgressEdits, Record<string, boolean | number>][]) for (const [id, value] of Object.entries(entries ?? {})) {
    const bundle = group === 'deliveries' ? UNLOCKS.bundles.find(b => b.id === Number(id.split(':')[0])) : undefined;
    const subject = group === 'deliveries' ? `${bundle?.name} · ${itemLabel(names, String(bundle?.items[Number(id.split(':')[1])]?.itemId))}`
      : group === 'encyclopedia' ? itemLabel(names, id)
      : group === 'skills' ? PROGRESSION.skills.find(skill => String(skill.id) === id)?.name
      : Number(id) === UNLOCKS.catalogFlag ? tr('村长家的交付目录') : UNLOCKS.nodes.find(n => String(n.flag) === id)?.name ?? PROGRESSION.flags.find(flag => String(flag.id) === id)?.name;
    const kind = { encyclopedia: tr('图鉴'), skills: tr('技能'), deliveries: tr('交付'), flags: tr('解锁') }[group];
    push('progress', { key: `progress:${group}:${id}`, undo: () => onUndoProgress(group, id), label: kind,
      text: <>{subject ?? id} → {group === 'deliveries' ? tr('已交付 {enabled} 件', { enabled: value }) : value ? tr('已解锁') : tr('未解锁')}</> });
  }

  const residents = animalResidents(model.doc);
  const houses = animalHouses(model.doc, { ...progress, flags: { ...progress.flags, ...mapBuildingFlags(map, model.doc).flags } });
  const slotName = (id: number) => { const house = houses.find(h => h.slots.some(slot => slot.id === id)); return house ? `${house.title} · ${tr('位置')} ${house.slots.findIndex(slot => slot.id === id) + 1}` : String(id); };
  for (const [index, placement] of Object.entries(animals.moves ?? {})) {
    const resident = residents[Number(index)];
    push('barn', { key: `animal-move:${index}`, label: resident?.name ?? tr('动物'), text: tr('移到 {slot}', { slot: slotName(placement) }),
      undo: () => { const moves = { ...animals.moves }; delete moves[Number(index)]; onAnimals({ ...animals, moves }); } });
  }
  const breedName = (species: number, variant = 0) => {
    const animal = ANIMALS.find(a => a.id === species), itemId = animal?.variants.find(v => v.index === variant)?.itemId;
    return (itemId ? names.names?.items?.[itemId] : undefined) ?? animal?.name ?? String(species);
  };
  for (const [placement, addition] of Object.entries(animals.added ?? {})) {
    push('barn', { key: `animal-add:${placement}`, label: addition.name, text: tr('新增{species}，放入 {slot}', { species: breedName(addition.species, addition.variant), slot: slotName(Number(placement)) }),
      undo: () => { const added = { ...animals.added }; delete added[placement]; onAnimals({ ...animals, added }); } });
  }

  const cropName = (id?: number) => id === undefined ? tr('作物') : names.names?.crops?.[id] ?? MAP_CROPS.find(c => c.numeric_id === id)?.name.zh_hans ?? String(id);
  const objectName = (id?: number) => { const spec = MAP_DATA.objects.find(o => o.id === id); return !spec ? tr('设施') : spec.itemId ? itemLabel(names, String(spec.itemId)) : spec.name; };
  const soilName = (soil?: number) => [tr('平地'), tr('耕地'), tr('田垄'), tr('水田')][soil ?? 0];
  const mapText = (group: MapChangeGroup): [string, string] => {
    switch (group.kind) {
      case 'place': return [tr('放置'), objectName(group.template)];
      case 'move': return [tr('移动'), objectName(group.template)];
      case 'upgrade': return [tr('升级'), `${objectName(group.from)} → ${objectName(group.template)}`];
      case 'remove': return [tr('拆除'), objectName(group.template)];
      case 'plant': return [tr('种植'), cropName(group.crop)];
      case 'growth': return [tr('调整生长'), !group.growth ? cropName(group.crop) : `${cropName(group.crop)} → ${group.growth.mature ? tr('已成熟') : `${CROP_FORMS[group.growth.form] ?? tr('未知状态')} · ${tr('阶段 {stage}', { stage: group.growth.stage + 1 })}`}`];
      case 'clearCrop': return [tr('清除作物'), group.crop ? cropName(group.crop) : ''];
      case 'clearSoil': return [tr('恢复平地'), ''];
      case 'soil': return [tr('改为{soil}', { soil: soilName(group.soil) }), ''];
      case 'water': return [group.watered ? tr('浇水') : tr('取消浇水'), ''];
    }
  };
  for (const group of mapChangeGroups(model.doc, map)) {
    const [action, subject] = mapText(group), unit = ['place', 'move', 'upgrade', 'remove'].includes(group.kind) ? tr('个') : tr('格');
    push('map', { key: `map:${group.key}`, label: action, weight: group.count, text: `${subject ? `${subject} · ` : ''}${group.count} ${unit}`, undo: () => onMap(withoutMapChanges(map, group)) });
  }

  const order: [GroupId, string][] = [['basic', tr('基础信息')], ['player', tr('玩家')], ['items', tr('物品')], ['machines', tr('加工设备')], ['barn', tr('畜牧')], ['npc', 'NPC'], ['quests', tr('任务')], ['progress', tr('收集与解锁')], ['brand', tr('品牌名')], ['map', tr('地图')], ['raw', tr('完整字段树')]];
  return <>{order.filter(([id]) => groups.get(id)?.length).map(([id, title]) => {
    const lines = groups.get(id)!, count = lines.reduce((sum, line) => sum + (line.weight ?? 1), 0);
    return <section key={id} className="save-change-group" aria-label={title}>
      <h4>{title} <span>{count}</span>
        {id === 'map' && lines.length > 1 && <button type="button" onClick={() => onMap({})}>{tr('撤销全部地图修改')}</button>}
        {id === 'barn' && lines.length > 1 && <button type="button" onClick={() => onAnimals({})}>{tr('撤销全部安置修改')}</button>}
      </h4>
      <ul>{lines.map(line => <li key={line.key} className={line.problem ? 'invalid' : undefined}>
        <b>{line.label}</b>
        <span className="save-change-arrow">{line.text}{line.problem && <small className="save-change-problem">{line.problem}</small>}</span>
        <button type="button" onClick={line.undo}>{tr('撤销')}</button>
      </li>)}</ul>
    </section>;
  })}</>;
}
