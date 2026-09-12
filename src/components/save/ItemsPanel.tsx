import { useMemo, useState } from 'react';
import type { SaveContainer, SaveSlot, SlotAssignment, SlotEdits } from '../../lib/saveItems';
import type { SaveModel } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import ItemGrid, { itemLabel, type GridSlot, type SlotView } from './ItemGrid';
import SlotEditor from './SlotEditor';
import ToolsPanel from './ToolsPanel';
import MachinePanel from './MachinePanel';
import { machineSpec, type MachineEdit, type MachineEdits } from '../../lib/saveMachines';

interface ItemsPanelProps {
  model: SaveModel;
  machines: MachineEdits;
  onMachine: (key: string, value?: MachineEdit) => void;
  drafts: Record<number, string>;
  slotEdits: SlotEdits;
  names: SaveNameTables;
  onSlotEdit: (slot: SaveSlot, value: SlotAssignment | null | undefined) => void;
  onDraft: (offset: number, value: string) => void;
}

/** Pinned below the container view, exactly like the game's own screen. */
const PINNED = new Set(['inventoryItemList_', 'toolItemList_']);

const KIND_LABELS: Record<SaveContainer['kind'], string> = {
  backpack: '背包',
  tool: '工具栏',
  storage: '收纳箱',
  machine: '设备',
  system: '系统箱',
};

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

function describe(container: SaveContainer, names: SaveNameTables): string {
  const machine = machineSpec(container);
  if (machine) return `${itemLabel(names, String(machine.itemId))} · ${machine.capacity} 个加工栏位`;
  const parts = [`${container.used}/${container.slots.length} 格`];
  if (container.previewItemId) parts.push(`内有 ${itemLabel(names, container.previewItemId)}`);
  return parts.join(' · ');
}

function ContainerView({
  container, drafts, slotEdits, names, selected, onSelect,
}: {
  container: SaveContainer;
  drafts: Record<number, string>;
  slotEdits: SlotEdits;
  names: SaveNameTables;
  selected: number | null;
  onSelect: (pointer: number) => void;
}) {
  const slots = useMemo(
    () => container.slots.map((slot) => resolve(slot, drafts, slotEdits)),
    [container, drafts, slotEdits],
  );
  return <ItemGrid container={container} slots={slots} names={names} selected={selected} onSelect={onSelect} />;
}

export default function ItemsPanel({ model, drafts, slotEdits, names, onSlotEdit, onDraft, machines, onMachine }: ItemsPanelProps) {
  const containers = model.containers;
  const pinned = containers.filter((container) => PINNED.has(container.id));
  const switchable = containers.filter((container) => !PINNED.has(container.id));
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

  const grouped = useMemo(() => {
    const groups: { label: string; items: SaveContainer[] }[] = [];
    for (const kind of ['storage', 'machine', 'system'] as const) {
      const items = switchable.filter((container) => container.kind === kind);
      if (items.length) groups.push({ label: KIND_LABELS[kind], items });
    }
    return groups;
  }, [switchable]);

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
        container={container}
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

  return <div className="save-items">
    {open && <section className="save-container-panel">
      <header className="save-container-head">
        <label className="save-container-switch">
          <span>容器</span>
          <select value={open.id} onChange={(event) => { setOpenId(event.target.value); setSelected(null); }}>
            {grouped.map((group) => <optgroup key={group.label} label={group.label}>
              {group.items.map((container) => <option key={container.id} value={container.id}>
                {(container.nameOffset !== undefined && drafts[container.nameOffset]) || container.title}（{describe(container, names)}）
              </option>)}
            </optgroup>)}
          </select>
        </label>
        {open.kind === 'storage' && open.nameOffset !== undefined && <label className="save-container-name">
          <span>箱子名称</span><input aria-label="箱子名称" value={drafts[open.nameOffset] ?? open.customName} placeholder={open.title}
            onChange={event => onDraft(open.nameOffset!, event.target.value)} />
        </label>}
        {open.kind !== 'machine' && <p className="save-container-meta">{open.slots.filter(slot => resolve(slot, drafts, slotEdits).view).length} / {open.slots.length} 格已占用</p>}
      </header>
      {open.kind === 'machine' ? <MachinePanel key={open.id} model={model} container={open} edits={machines} names={names} onChange={onMachine} /> : <ContainerView
        container={open}
        drafts={drafts}
        slotEdits={slotEdits}
        names={names}
        selected={selected}
        onSelect={setSelected}
      />}
      {open.kind !== 'machine' && editor(open)}
    </section>}

    {pinned.map((container) => container.kind === 'tool' ? <ToolsPanel key={container.id} container={container} drafts={drafts} names={names} onDraft={onDraft} /> : <section className="save-container-panel pinned" key={container.id}>
      <header className="save-container-head">
        <h3>{container.title}</h3>
        <p className="save-container-meta">{container.slots.filter(slot => resolve(slot, drafts, slotEdits).view).length} / {container.slots.length} 格已占用</p>
      </header>
      <ContainerView
        container={container}
        drafts={drafts}
        slotEdits={slotEdits}
        names={names}
        selected={selected}
        onSelect={setSelected}
      />
      {editor(container)}
    </section>)}
  </div>;
}
