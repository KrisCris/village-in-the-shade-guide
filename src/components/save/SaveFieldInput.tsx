import type { SaveField } from '../../lib/saveModel';
import { lookupName, type SaveNameTables } from '../../lib/saveNames';
import SaveIcon from './SaveIcon';
import { useState } from 'react';
import EntityPicker from './EntityPicker';
import SaveDialog from './SaveDialog';
import FriendshipInput from './FriendshipInput';

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
  const dirty = value !== field.value;
  const resolved = lookupName(names, field.lookup, value);

  if (field.readOnly) {
    return <span className="save-cell readonly" title={field.note}>
      <SaveIcon names={names} kind={field.lookup} value={value} size={22} />
      <span className="save-cell-value">{resolved || value || '—'}</span>
      {resolved && <small className="save-cell-name">ID {value}</small>}
    </span>;
  }

  if (field.control === 'npc-friendship') return <FriendshipInput value={Number(value)} label={field.label} onChange={next => onChange(field, next)} />;
  if (field.control === 'animal-friendship') return <FriendshipInput value={Number(value)} thresholds={Array.from({ length: 5 }, (_, index) => (index + 1) * Number(field.max) / 5)} label={field.label} onChange={next => onChange(field, next)} />;
  if (field.control === 'slider') return <label className="save-bounded-slider"><input type="range" min={field.min} max={field.max} step={1} value={value} aria-label={field.label} onChange={event => onChange(field, event.target.value)} /><small>{Math.round(Number(value) / Number(field.max) * 100)}%</small></label>;

  if (field.type === 'bool') {
    return <span className={`save-cell${dirty ? ' dirty' : ''}`}>
      <select value={value === '0' ? '0' : '1'} onChange={(event) => onChange(field, event.target.value)} aria-label={field.label}>
        <option value="0">否</option>
        <option value="1">是</option>
      </select>
    </span>;
  }

  if (field.lookup) return <div className={`save-cell${dirty ? ' dirty' : ''}`}>
    <button className="save-select-trigger" type="button" aria-label={field.label} aria-expanded={picking} onClick={() => setPicking(open => !open)}>
      <SaveIcon names={names} kind={field.lookup} value={value} size={22} />{resolved || `未知值 ${value}`} ▾
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
      spellCheck={false}
    />
    {resolved && <small className="save-cell-name">
      <SaveIcon names={names} kind={field.lookup} value={value} size={18} />
      {resolved}
    </small>}
  </span>;
}
