import { GRID_COLUMNS, type SaveContainer, type SaveSlot } from '../../lib/saveItems';
import { lookupName, type SaveNameTables } from '../../lib/saveNames';
import SaveIcon from './SaveIcon';
import { useState } from 'react';
import { ITEM_RANKS } from '../../lib/saveRules';
import { tr } from '../../i18n/active';

/** What a slot currently shows, after drafts and pending assignments. */
export interface SlotView {
  itemId: string;
  count: string;
  rank: string;
  quality: string;
}

export type SlotState = 'clean' | 'edited' | 'added' | 'cleared';

export interface GridSlot {
  slot: SaveSlot;
  view: SlotView | null;
  state: SlotState;
}

interface ItemGridProps {
  container: SaveContainer;
  slots: GridSlot[];
  names: SaveNameTables;
  selected: number | null;
  onSelect: (pointer: number) => void;
  onTransfer?: (from: number, to: number) => void;
}

export function itemLabel(names: SaveNameTables, itemId: string): string {
  return lookupName(names, 'items', itemId) ?? `#${itemId}`;
}

export default function ItemGrid({ container, slots, names, selected, onSelect, onTransfer }: ItemGridProps) {
  const columns = Math.min(GRID_COLUMNS, Math.max(1, container.slots.length));
  const [focusIndex, setFocusIndex] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null), [dropTarget, setDropTarget] = useState<number | null>(null);
  return <div className="save-grid-scroll">
    <div className="save-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {slots.map(({ slot, view, state }) => {
        const classes = ['save-slot'];
        if (!view) classes.push('empty');
        if (state !== 'clean') classes.push(state);
        if (selected === slot.pointer) classes.push('selected');
        if (dragging === slot.pointer) classes.push('dragging');
        if (dropTarget === slot.pointer) classes.push('drop-target');
        const name = view ? itemLabel(names, view.itemId) : '';
        return <button
          type="button"
          key={slot.pointer}
          draggable={!!view && !!onTransfer}
          onDragStart={event => { event.dataTransfer.setData('application/x-village-slot', String(slot.pointer)); event.dataTransfer.effectAllowed = 'move'; setDragging(slot.pointer); }}
          onDragEnd={() => { setDragging(null); setDropTarget(null); }}
          onDragOver={event => { if (onTransfer && event.dataTransfer.types.includes('application/x-village-slot')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(slot.pointer); } }}
          onDragLeave={() => setDropTarget(current => current === slot.pointer ? null : current)}
          onDrop={event => { setDropTarget(null); const source = event.dataTransfer.getData('application/x-village-slot'); if (!onTransfer || !/^\d+$/.test(source)) return; event.preventDefault(); onTransfer(Number(source), slot.pointer); }}
          className={classes.join(' ')}
          tabIndex={slot.index === Math.min(focusIndex, slots.length - 1) ? 0 : -1}
          onFocus={() => setFocusIndex(slot.index)}
          onKeyDown={event => {
            const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns, Home: -slot.index, End: slots.length - 1 - slot.index };
            if (!(event.key in steps)) return;
            event.preventDefault();
            const next = Math.max(0, Math.min(slots.length - 1, slot.index + steps[event.key]));
            const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(':scope > button');
            buttons?.[next]?.focus();
          }}
          onClick={() => onSelect(slot.pointer)}
          aria-label={view ? tr('第 {number} 格：{name}，{quality} ×{count}', { number: slot.index + 1, name, quality: ITEM_RANKS.find(rank => rank.value === Number(view.rank))?.label ?? tr('未知品质'), count: view.count }) : tr('第 {number} 格：空', { number: slot.index + 1 })}
        >
          <span className="save-slot-index">{slot.index + 1}</span>
          {view
            ? <>
              <span className="save-slot-art">
                <SaveIcon names={names} kind="items" value={view.itemId} size={56} rank={Number(view.rank)} />
              </span>
              <span className="save-slot-name" title={name}>{name}</span>
              <span className="save-slot-count">{view.count}</span>
            </>
            : <span className="save-slot-plus" aria-hidden="true">＋</span>}
        </button>;
      })}
    </div>
  </div>;
}
