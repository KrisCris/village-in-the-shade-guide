import type { SaveGroup, SaveField } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveFieldInput from './SaveFieldInput';

interface SaveFieldTableProps {
  groups: SaveGroup[];
  drafts: Record<number, string>;
  names: SaveNameTables;
  onChange: (field: SaveField, value: string) => void;
}

export default function SaveFieldTable({ groups, drafts, names, onChange }: SaveFieldTableProps) {
  if (!groups.length) return null;
  return <>
    {groups.map((group) => <section className="save-group" key={group.title}>
      <h3>{group.title}</h3>
      <div className="save-field-table">
        {group.fields.map((field) => <div className="save-field-row" key={field.offset}>
          <span className="save-field-meta">
            <b>{field.label}</b>
            <small>
              {field.note}
            </small>
          </span>
          <SaveFieldInput field={field} draft={drafts[field.offset]} names={names} onChange={onChange} />
        </div>)}
      </div>
    </section>)}
  </>;
}
