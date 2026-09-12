import { GRID_COLUMNS, type SaveContainer, type SaveSlot } from '../../lib/saveItems';
import { lookupName, type SaveNameTables } from '../../lib/saveNames';
import SaveIcon from './SaveIcon';
import { useState } from 'react';
import { withBase } from '../../lib/sitePath';

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
}

export function itemLabel(names: SaveNameTables, itemId: string): string {
  return lookupName(names, 'items', itemId) ?? `#${itemId}`;
}

export default function ItemGrid({ container, slots, names, selected, onSelect }: ItemGridProps) {
  const columns = Math.min(GRID_COLUMNS, Math.max(1, container.slots.length));
  const [focusIndex, setFocusIndex] = useState(0);
  return <div className="save-grid-scroll">
    <div className="save-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {slots.map(({ slot, view, state }) => {
        const classes = ['save-slot'];
        if (!view) classes.push('empty');
        if (state !== 'clean') classes.push(state);
        if (selected === slot.pointer) classes.push('selected');
        const name = view ? itemLabel(names, view.itemId) : '';
        return <button
          type="button"
          key={slot.pointer}
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
          aria-label={view ? `第 ${slot.index + 1} 格：${name} ×${view.count}` : `第 ${slot.index + 1} 格：空`}
        >
          <span className="save-slot-index">{slot.index + 1}</span>
          {view
            ? <>
              <span className="save-slot-art">
                <SaveIcon names={names} kind="items" value={view.itemId} size={38} />
                <span className="save-slot-count">{view.count}</span>
              </span>
              <span className="save-slot-name" title={name}>{name}</span>
              {Number(view.rank) > 0 && Number(view.rank) <= 4 && <img className="save-slot-quality" src={withBase(`/icons/generated/ui/rank-${view.rank}.webp`)} width={18} height={18} alt="物品等级" />}
            </>
            : <span className="save-slot-plus" aria-hidden="true">＋</span>}
        </button>;
      })}
    </div>
  </div>;
}
