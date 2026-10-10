import { useEffect, useState } from 'react';
import type { SaveContainer, SaveSlot, SlotAssignment } from '../../lib/saveItems';
import type { SaveNameTables } from '../../lib/saveNames';
import { ITEM_RANKS, SAVE_RULES } from '../../lib/saveRules';
import RankPicker from './RankPicker';
import { itemLabel, type SlotState, type SlotView } from './ItemGrid';
import EntityPicker from './EntityPicker';
import SaveDialog from './SaveDialog';
import SaveIcon from './SaveIcon';
import { tr } from '../../i18n/active';

interface SlotEditorProps {
  container: SaveContainer; slot: SaveSlot; view: SlotView | null; state: SlotState;
  names: SaveNameTables; onApply: (value: SlotAssignment) => void;
  onClear: () => void; onRevert: () => void; onClose: () => void;
}
const BLANK: SlotView = { itemId: '', count: '1', rank: '0', quality: '0' };

export default function SlotEditor({ container, slot, view, state, names, onApply, onClear, onRevert, onClose }: SlotEditorProps) {
  const [value, setValue] = useState<SlotView>(view ?? BLANK);
  const [picking, setPicking] = useState(view === null);
  useEffect(() => { setValue(view ?? BLANK); }, [slot.pointer, view?.itemId, view?.count, view?.rank, view?.quality]);
  useEffect(() => { setPicking(view === null); }, [slot.pointer]);
  const valid = !!names.names?.items?.[value.itemId] && /^\d+$/.test(value.count)
    && Number(value.count) >= 1 && Number(value.count) <= SAVE_RULES.stackMax
    && ITEM_RANKS.some(rank => String(rank.value) === value.rank);
  const patch = (next: Partial<SlotView>) => setValue(current => ({ ...current, ...next }));
  const title = tr('{title} · 第 {number} 格', { title: container.title, number: slot.index + 1 });
  return <div className="save-slot-editor" role="group" aria-label={title} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <div className="save-slot-editor-head"><strong>{title}</strong><button type="button" className="save-slot-close" onClick={onClose} aria-label={tr('关闭')}>×</button></div>
    <div className="save-slot-editor-body">
      <div className="save-slot-field save-slot-item">
        <label htmlFor="slot-item">{tr('物品')}</label>
        <button type="button" id="slot-item" className="save-slot-chosen" onClick={() => setPicking(open => !open)} aria-expanded={picking}>
          <SaveIcon names={names} kind="items" value={value.itemId} size={48} rank={Number(value.rank)} />
          <span>{value.itemId ? itemLabel(names, value.itemId) : tr('选择物品')}<small>{value.itemId}</small></span>
        </button>
      </div>
      <div className="save-slot-field"><label htmlFor="slot-count">{tr('数量')}</label>
        <input id="slot-count" type="number" min={1} max={SAVE_RULES.stackMax} step={1} value={value.count} onChange={event => patch({ count: event.target.value })} />
        <small>{tr('每叠最多')} {SAVE_RULES.stackMax}</small>
      </div>
      <RankPicker label={tr('物品等级')} value={Number(value.rank)} onChange={rank => patch({ rank: String(rank) })} />
    </div>
    {picking && <SaveDialog title={tr('选择物品')} onClose={() => setPicking(false)}><EntityPicker names={names} kind="items" value={value.itemId} onChange={itemId => { patch({ itemId }); setPicking(false); }} /></SaveDialog>}
    <div className="save-slot-actions">
      <button type="button" className="save-slot-primary" disabled={!valid} onClick={() => onApply(value)}>{view ? tr('应用到这一格') : tr('放入这一格')}</button>
      {view && <button type="button" className="save-slot-danger" onClick={onClear}>{tr('清空这一格')}</button>}
      {state !== 'clean' && <button type="button" onClick={onRevert}>{tr('撤销改动')}</button>}
    </div>
  </div>;
}
