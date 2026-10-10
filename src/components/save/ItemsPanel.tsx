import { useMemo, useState } from 'react';
import { SHIPPING_BOX_ID, type SaveContainer, type SaveSlot, type SlotAssignment, type SlotEdits } from '../../lib/saveItems';
import type { SaveModel } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import ItemGrid, { itemLabel, type GridSlot, type SlotView } from './ItemGrid';
import SlotEditor from './SlotEditor';
import ToolsPanel from './ToolsPanel';
import BatchMachines from './BatchMachines';
import MachinePanel from './MachinePanel';
import DeviceBrowser, { SpecialContents, specialTitle } from './DeviceBrowser';
import { specialSpec, type MachineEdit, type MachineEdits } from '../../lib/saveMachines';
import { tr } from '../../i18n/active';

interface ItemsPanelProps {
  model: SaveModel;
  machines: MachineEdits;
  onTransfer: (from: number, to: number) => void;
  onMachine: (key: string, value?: MachineEdit) => void;
  drafts: Record<number, string>;
  slotEdits: SlotEdits;
  names: SaveNameTables;
  onSlotEdit: (slot: SaveSlot, value: SlotAssignment | null | undefined) => void;
  onDraft: (offset: number, value: string) => void;
}

/** Pinned below the container view, exactly like the game's own screen. */
const PINNED = new Set(['inventoryItemList_', 'toolItemList_']);

function resolve(slot: SaveSlot, drafts: Record<number, string>, slotEdits: SlotEdits): GridSlot {
  if (Object.prototype.hasOwnProperty.call(slotEdits, slot.pointer)) {
    const assignment = slotEdits[slot.pointer];
    if (!assignment) return { slot, view: null, state: 'cleared' };
    return { slot, view: { ...assignment }, state: slot.item ? 'edited' : 'added' };
  }
  const item = slot.item;
  if (!item) return { slot, view: null, state: 'clean' };
  const view: SlotView = {
    itemId: drafts[item.itemIdOffset] ?? item.itemId,
    count: drafts[item.countOffset] ?? item.count,
    rank: drafts[item.rankOffset] ?? item.rank,
    quality: drafts[item.qualityOffset] ?? item.quality,
  };
  const dirty = view.itemId !== item.itemId || view.count !== item.count
    || view.rank !== item.rank || view.quality !== item.quality;
  return { slot, view, state: dirty ? 'edited' : 'clean' };
}

function describe(container: SaveContainer, names: SaveNameTables, drafts: Record<number, string>, slotEdits: SlotEdits): string {
  const occupied = container.slots.map(slot => resolve(slot, drafts, slotEdits).view).filter(view => view !== null);
  const parts = [tr('{used}/{total} 格', { used: occupied.length, total: container.slots.length })];
  if (occupied[0]) parts.push(tr('内有 {itemLabel}', { itemLabel: itemLabel(names, occupied[0].itemId) }));
  return parts.join(' · ');
}

function ContainerView({
  container, drafts, slotEdits, names, selected, onSelect, onTransfer,
}: {
  container: SaveContainer;
  drafts: Record<number, string>;
  slotEdits: SlotEdits;
  names: SaveNameTables;
  selected: number | null;
  onSelect: (pointer: number) => void;
  onTransfer?: (from: number, to: number) => void;
}) {
  const slots = useMemo(
    () => container.slots.map((slot) => resolve(slot, drafts, slotEdits)),
    [container, drafts, slotEdits],
  );
  return <ItemGrid container={container} slots={slots} names={names} selected={selected} onSelect={onSelect} onTransfer={onTransfer} />;
}

export default function ItemsPanel({ model, drafts, slotEdits, names, onSlotEdit, onDraft, machines, onMachine, onTransfer }: ItemsPanelProps) {
  const containers = model.containers;
  const pinned = containers.filter((container) => PINNED.has(container.id));
  const switchable = containers.filter((container) => container.kind === 'storage' || container.id === SHIPPING_BOX_ID)
    .sort((a, b) => Number(b.id === SHIPPING_BOX_ID) - Number(a.id === SHIPPING_BOX_ID));
  const [tab, setTab] = useState('storage');
  const [openId, setOpenId] = useState(switchable[0]?.id ?? '');
  const [selected, setSelected] = useState<number | null>(null);

  const open = switchable.find((container) => container.id === openId) ?? switchable[0];
  const byPointer = useMemo(() => {
    const map = new Map<number, SaveContainer>();
    for (const container of containers) for (const slot of container.slots) map.set(slot.pointer, container);
    return map;
  }, [containers]);

  const active = selected === null ? null : byPointer.get(selected);
  const activeSlot = active?.slots.find((slot) => slot.pointer === selected) ?? null;
  const activeView = activeSlot ? resolve(activeSlot, drafts, slotEdits) : null;

  function applyToSlot(value: SlotAssignment | null | undefined): void {
    if (!activeSlot) return;
    onSlotEdit(activeSlot, value);
  }

  /**
   * A slot that already holds an item keeps using the ordinary draft map — the
   * four fields are plain leaves, so no node has to be rebuilt and the change
   * list stays readable. Only empty slots need a synthesized item object.
   */
  function apply(value: SlotAssignment): void {
    if (!activeSlot) return;
    const item = activeSlot.item;
    const assigned = Object.prototype.hasOwnProperty.call(slotEdits, activeSlot.pointer);
    if (!item || assigned) {
      applyToSlot(value);
      return;
    }
    onDraft(item.itemIdOffset, value.itemId);
    onDraft(item.countOffset, value.count);
    onDraft(item.rankOffset, value.rank);
    onDraft(item.qualityOffset, value.quality);
  }

  const editor = (container: SaveContainer) =>
    active === container && activeSlot && activeView
      ? <SlotEditor
        container={specialSpec(container) ? { ...container, title: specialTitle(container, names) } : container}
        slot={activeSlot}
        view={activeView.view}
        state={activeView.state}
        names={names}
        onApply={apply}
        onClear={() => applyToSlot(null)}
        onRevert={() => applyToSlot(undefined)}
        onClose={() => setSelected(null)}
      />
      : null;

  return <div className="save-items" data-view={tab}>
    <div className="save-device-tabs" aria-label={tr('物品分类')}>{[['storage', tr('物品容器')], ['machines', tr('加工设备')], ['special', tr('特殊容器')]].map(([id, title]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => { setTab(id); setSelected(null); }}>{title}</button>)}</div>
    {tab === 'machines' && <DeviceBrowser model={model} names={names} edits={machines} renderBatch={family => <BatchMachines family={family} model={model} edits={machines} names={names} onChange={onMachine} drafts={drafts} onDraft={onDraft} />}>{container => <MachinePanel drafts={drafts} onDraft={onDraft} key={container.id} model={model} container={container} edits={machines} names={names} onChange={onMachine} />}</DeviceBrowser>}
    {tab === 'special' && <DeviceBrowser model={model} names={names} edits={machines} special occupancy={container => container.slots.filter(slot => resolve(slot, drafts, slotEdits).view).length}>{container => container.kind === 'system' || specialSpec(container)?.kind === 'shared' ? <>
      <ContainerView container={container} drafts={drafts} slotEdits={slotEdits} names={names} selected={selected} onSelect={setSelected} />{editor(container)}
    </> : <SpecialContents model={model} container={container} names={names} />}</DeviceBrowser>}
    {tab === 'storage' && activeView?.view && <div className="save-progress-bulk"><span>{tr('移动所选物品到：')}</span>{[...switchable, ...pinned.filter(c => c.kind === 'backpack')].filter(c => c !== active).map(c => { const target = c.slots.find(s => !resolve(s, drafts, slotEdits).view); return <button type="button" key={c.id} disabled={!target} onClick={() => { if (target && selected !== null) { onTransfer(selected, target.pointer); setSelected(null); } }}>{c.title}{!target ? tr('（已满）') : ''}</button>; })}</div>}
    {tab === 'storage' && !open && <p className="save-device-hint">{tr('存档中没有收纳箱。')}</p>}
    {tab === 'storage' && open && <section className="save-container-panel">
      <header className="save-container-head">
        <label className="save-container-switch">
          <span>{tr('容器')}</span>
          <select value={open.id} onChange={(event) => { setOpenId(event.target.value); setSelected(null); }}>
            {switchable.map((container) => <option key={container.id} value={container.id}>
                {(container.nameOffset !== undefined && drafts[container.nameOffset]) || container.title}（{describe(container, names, drafts, slotEdits)}）
              </option>)}
          </select>
        </label>
        {open.kind === 'storage' && open.nameOffset !== undefined && <label className="save-container-name">
          <span>{tr('箱子名称')}</span><input aria-label={tr('箱子名称')} value={drafts[open.nameOffset] ?? open.customName} placeholder={open.title}
            onChange={event => onDraft(open.nameOffset!, event.target.value)} />
        </label>}
        <p className="save-container-meta">{open.slots.filter(slot => resolve(slot, drafts, slotEdits).view).length} / {open.slots.length} {tr('格已占用')}</p>
      </header>
      <ContainerView
        container={open}
        drafts={drafts}
        slotEdits={slotEdits}
        names={names}
        selected={selected}
        onSelect={setSelected}
        onTransfer={onTransfer}
      />
      {editor(open)}
    </section>}

    {tab === 'storage' && <div className="save-carried-items">{pinned.filter(container => container.kind !== 'tool').map((container) => <section className="save-container-panel pinned" key={container.id}>
      <header className="save-container-head">
        <h3>{container.title}</h3>
        <p className="save-container-meta">{container.slots.filter(slot => resolve(slot, drafts, slotEdits).view).length} / {container.slots.length} {tr('格已占用')}</p>
      </header>
      <ContainerView
        container={container}
        drafts={drafts}
        slotEdits={slotEdits}
        names={names}
        selected={selected}
        onSelect={setSelected}
        onTransfer={onTransfer}
      />
      {editor(container)}
    </section>)}</div>}
    {tab === 'storage' && <div className="save-equipment-tools">{pinned.filter(container => container.kind === 'tool').map(container => <ToolsPanel key={container.id} container={container} drafts={drafts} names={names} onDraft={onDraft} />)}</div>}
  </div>;
}
