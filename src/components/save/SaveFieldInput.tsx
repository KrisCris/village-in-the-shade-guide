import SearchableSelect from '../controls/SearchableSelect';
import type { SaveField } from '../../lib/saveModel';
import { lookupName, type SaveNameTables } from '../../lib/saveNames';
import SaveIcon from './SaveIcon';
import { useState } from 'react';
import EntityPicker from './EntityPicker';
import SaveDialog from './SaveDialog';
import FriendshipInput from './FriendshipInput';
import { tr } from '../../i18n/active';

interface SaveFieldInputProps {
  field: SaveField;
  draft: string | undefined;
  names: SaveNameTables;
  onChange: (field: SaveField, value: string) => void;
  compact?: boolean;
}

/** One editable cell. The byte count is informational, not a constraint: the
 *  encoder re-lays out the whole tree, so a string may change length freely. */
export default function SaveFieldInput({ field, draft, names, onChange, compact }: SaveFieldInputProps) {
  const value = draft ?? field.value;
  const [picking, setPicking] = useState(false);
  const nameField = field.type === 'string' && (field.nameLimit || /name_|dogName_/i.test(field.label));
  const dirty = value !== field.value;
  const resolved = lookupName(names, field.lookup, value);

  if (field.readOnly) {
    return <span className="save-cell readonly" title={field.note}>
      <SaveIcon names={names} kind={field.lookup} value={value} size={22} />
      <span className="save-cell-value">{resolved || value || '—'}</span>
      {nameField && <NameCount value={value} />}
    {resolved && <small className="save-cell-name">ID {value}</small>}
    </span>;
  }

  if (field.control === 'npc-friendship') return <FriendshipInput value={Number(value)} label={field.label} onChange={next => onChange(field, next)} />;
  if (field.control === 'animal-friendship') return <FriendshipInput value={Number(value)} thresholds={Array.from({ length: 5 }, (_, index) => (index + 1) * Number(field.max) / 5)} label={field.label} onChange={next => onChange(field, next)} />;
  if (field.control === 'slider') return <label className="save-bounded-slider"><input type="range" min={field.min} max={field.max} step={1} value={value} aria-label={field.label} onChange={event => onChange(field, event.target.value)} /><small>{Math.round(Number(value) / Number(field.max) * 100)}%</small></label>;

  if (field.type === 'bool') {
    return <span className={`save-cell${dirty ? ' dirty' : ''}`}>
      <SearchableSelect value={value === '0' ? '0' : '1'} onChange={(event) => onChange(field, event.target.value)} aria-label={field.label}>
        <option value="0">{tr('否')}</option>
        <option value="1">{tr('是')}</option>
      </SearchableSelect>
    </span>;
  }

  if (field.lookup) return <div className={`save-cell${dirty ? ' dirty' : ''}`}>
    <button className="save-select-trigger" type="button" aria-label={field.label} aria-expanded={picking} onClick={() => setPicking(open => !open)}>
      <SaveIcon names={names} kind={field.lookup} value={value} size={22} />{resolved || tr('未知值 {value}', { value })} ▾
    </button>
    {picking && <SaveDialog title={field.label} compact onClose={() => setPicking(false)}><EntityPicker names={names} kind={field.lookup} value={value} label={field.label} onChange={id => { onChange(field, id); setPicking(false); }} /></SaveDialog>}
  </div>;

  return <span className={`save-cell${dirty ? ' dirty' : ''}`}>
    <input
      className={field.type === 'bytes' ? 'save-hex-input' : undefined}
      type={field.type === 'int' || field.type === 'float' ? 'number' : 'text'}
      inputMode={field.type === 'int' ? 'numeric' : undefined}
      step={field.type === 'float' ? 'any' : undefined}
      min={field.type === 'int' ? field.min : undefined}
      max={field.type === 'int' ? field.max : undefined}
      value={value}
      size={compact ? 10 : undefined}
      onChange={(event) => onChange(field, event.target.value)}
      aria-label={field.label}
      maxLength={nameField ? NAME_LIMIT : undefined}
      aria-description={nameField ? tr('游戏内名称最多 5 个字符。') : undefined}
      aria-invalid={nameField && Array.from(value).length > NAME_LIMIT || undefined}
      spellCheck={false}
    />
    {nameField && <NameCount value={value} />}
    {resolved && <small className="save-cell-name">
      <SaveIcon names={names} kind={field.lookup} value={value} size={18} />
      {resolved}
    </small>}
  </span>;
}

/** The game caps player, pet, animal and brand names at five characters in every language. */
export const NAME_LIMIT = 5;

export function NameCount({ value }: { value: string }) {
  const length = Array.from(value).length;
  return <small className={length > NAME_LIMIT ? 'save-status error' : 'save-cell-name'}>{tr('{length}/{limit} 字符', { length, limit: NAME_LIMIT })}</small>;
}
