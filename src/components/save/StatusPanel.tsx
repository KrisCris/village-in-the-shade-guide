import SearchableSelect from '../controls/SearchableSelect';
import { collectFields, type SaveField, type SaveModel } from '../../lib/saveModel';
import { SAVE_RULES } from '../../lib/saveRules';
import { withBase } from '../../lib/sitePath';
import { tr } from '../../i18n/active';

export default function StatusPanel({ model, drafts, onChange }: { model: SaveModel; drafts: Record<number, string>; onChange: (field: SaveField, value: string) => void }) {
  const fields = collectFields(model);
  return <section className="save-group"><h3>{tr('生命与体力')}</h3><div className="save-field-table">
    {(['hp_', 'st_'] as const).map(key => {
      const currentNode = model.doc.resolve(`pPlayerStatus_/p/${key}/this->value_`), maxNode = model.doc.resolve(`pPlayerStatus_/p/${key}/max_`);
      const currentField = currentNode && fields.get(currentNode.offset), maxField = maxNode && fields.get(maxNode.offset);
      if (!currentField || !maxField) return null;
      const rule = key === 'hp_' ? SAVE_RULES.hp : SAVE_RULES.stamina;
      const title = key === 'hp_' ? tr('生命') : tr('体力');
      const unitLabel = key === 'hp_' ? tr('颗心') : tr('段体力');
      const max = Number(drafts[maxField.offset] ?? maxField.value), current = Number(drafts[currentField.offset] ?? currentField.value);
      const options = Array.from({ length: (rule.max - rule.initial) / rule.unit + 1 }, (_, index) => rule.initial + index * rule.unit);
      return <div className="save-status-control" key={key}>
        <div className={`save-status-symbols ${key === 'hp_' ? 'health' : 'stamina'}`} aria-label={`${current} / ${max}`}>
          {Array.from({ length: Math.ceil(max / rule.unit) }, (_, index) => <span key={index} className="save-status-unit" style={key === 'hp_' ? { maskImage: `url(${withBase('/icons/generated/ui/health.webp')})` } : undefined}><i style={{ width: `${Math.max(0, Math.min(1, (current - index * rule.unit) / rule.unit)) * 100}%` }} /></span>)}
        </div>
        <label>{title}{tr('上限')} <SearchableSelect aria-label={tr('{title}上限', { title })} value={max} onChange={event => {
          const next = Number(event.target.value);
          onChange(maxField, String(next));
          if (current > next) onChange(currentField, String(next));
        }}>
          {!options.includes(max) && <option value={max}>{tr('存档原值')} {max}</option>}
          {options.map(value => <option key={value} value={value}>{value / rule.unit} {unitLabel}</option>)}
        </SearchableSelect></label>
        <label>{tr('当前')}{title} <input type="range" aria-label={tr('当前{title}', { title })} min={0} max={max} step={1} value={current}
          onChange={event => onChange(currentField, event.target.value)} /></label>
        <small>{tr('{current} / {max} · 每{unit} {points} 点', { current, max, unit: unitLabel, points: rule.unit })}</small>
        <button type="button" onClick={() => onChange(currentField, String(max))}>{tr('恢复至上限')}</button>
      </div>;
    })}
  </div></section>;
}
