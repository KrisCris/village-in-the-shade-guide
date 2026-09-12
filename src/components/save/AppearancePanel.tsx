import { APPEARANCE, APPEARANCE_FIELDS } from '../../lib/saveAppearance';
import { collectFields, type SaveField, type SaveModel } from '../../lib/saveModel';
import { lookupName, type SaveNameTables } from '../../lib/saveNames';
import SaveIcon from './SaveIcon';
import HairColorPicker from './HairColorPicker';
import { flagEnabled, type ProgressEdits } from '../../lib/saveProgress';

export default function AppearancePanel({ model, drafts, names, onChange, progress, onUnlock }: {
  progress: ProgressEdits; onUnlock: (flag: number) => void;
  model: SaveModel; drafts: Record<number, string>; names: SaveNameTables; onChange: (field: SaveField, value: string) => void;
}) {
  const fields = collectFields(model);
  const field = (path: string) => { const node = model.doc.resolve(`pPlayerStatus_/p/${path}`); return node ? fields.get(node.offset) : undefined; };
  const axes = ['x', 'y', 'z'].map(axis => field(`hairColorHsv_/${axis}`));
  const color = axes.map(axis => Number(axis ? drafts[axis.offset] ?? axis.value : 0));
  return <section className="save-group"><h3>外观</h3>
    {axes.every(Boolean) && <HairColorPicker value={color} onChange={(axis, value) => onChange(axes[axis]!, String(value))} />}
    {APPEARANCE_FIELDS.map(spec => {
      const id = field(spec.idPath), colorField = spec.colorPath ? field(spec.colorPath) : undefined;
      if (!id) return null;
      const selectedId = Number(drafts[id.offset] ?? id.value);
      const selectedColor = colorField ? Number(drafts[colorField.offset] ?? colorField.value) : 0;
      const rows = APPEARANCE[spec.kind];
      const current = rows.find(row => row.id === selectedId);
      return <fieldset className="save-appearance" key={spec.kind}><legend>{spec.label}</legend>
        <h4 className="save-appearance-heading" id={`appearance-${spec.kind}-styles`}>款式</h4>
        <div className="save-appearance-options" role="group" aria-labelledby={`appearance-${spec.kind}-styles`}>
          {rows.map(row => {
            const first = row.variants[0]?.itemId;
            const name = first ? lookupName(names, 'items', String(first))?.split('／')[0] : '无';
            const locked = row.unlockFlag > 0 && !flagEnabled(model.doc, row.unlockFlag, progress);
            return <button type="button" key={row.id} className={`save-appearance-style${locked ? ' is-locked' : ''}`} aria-pressed={selectedId === row.id} title={locked ? '点击解锁并使用' : undefined}
              onClick={() => {
                if (locked) onUnlock(row.unlockFlag);
                onChange(id, String(row.id));
                if (colorField) onChange(colorField, String(row.variants.find(variant => variant.color === selectedColor)?.color ?? row.variants[0]?.color ?? 0));
              }}>
              <span className="save-appearance-art">{first && <SaveIcon names={names} kind="items" value={String(first)} size={40} />}</span>
              <span className="save-appearance-option-name">{name || row.name_ja}</span>
              <small className="save-appearance-lock">{locked && <><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="2" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></svg>未解锁</>}</small>
            </button>;
          })}
        </div>
        {colorField && !!current?.variants.length && <div className="save-appearance-colors">
          <h4 className="save-appearance-heading">配色</h4>
          <div className="save-appearance-options" role="group" aria-label={`${spec.label}配色`}>
          {current.variants.map(variant => <button type="button" key={variant.color} aria-pressed={selectedColor === variant.color}
            aria-label={lookupName(names, 'items', String(variant.itemId)) ?? `${spec.label}配色 ${variant.color}`}
            onClick={() => onChange(colorField, String(variant.color))}>
            <SaveIcon names={names} kind="items" value={String(variant.itemId)} size={40} />
            <small>{lookupName(names, 'items', String(variant.itemId))?.split('／').at(-1)}</small>
          </button>)}
          </div>
        </div>}
        {!current && <p>暂不支持预览当前外观。</p>}
      </fieldset>;
    })}
  </section>;
}
