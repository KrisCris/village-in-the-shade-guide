import type { SaveField, SaveTable, SaveTableRow } from '../../lib/saveModel';
import { lookupName, type SaveNameTables } from '../../lib/saveNames';
import SaveFieldInput from './SaveFieldInput';
import { tr } from '../../i18n/active';

interface SaveDataTableProps {
  table: SaveTable;
  drafts: Record<number, string>;
  names: SaveNameTables;
  onChange: (field: SaveField, value: string) => void;
  cards?: boolean;
}

/** Who a row is about: the name its ID cell resolves to, its name field, or the row key. */
export function rowSubject(row: SaveTableRow, names: SaveNameTables): string {
  const id = row.cells.find(cell => cell?.lookup), named = row.cells.find(cell => cell?.type === 'string' && cell.value);
  return (id && lookupName(names, id.lookup, id.value)) || named?.value || row.label;
}

export default function SaveDataTable({ table, drafts, names, onChange, cards = false }: SaveDataTableProps) {
  const used = table.rows.filter((row) => row.cells.some(Boolean));
  return <section className="save-group" key={table.id}>
    <h3>{table.title}</h3>
    {table.note && <p className="save-tab-description">{table.note}</p>}
    {used.length === 0
      ? !table.note && <p className="save-tab-empty">{tr('暂无记录。')}</p>
      : cards ? <div className="save-record-grid">
        {used.map(row => <article className="save-record-card" key={row.key} aria-label={`${table.title} ${rowSubject(row, names)}`}>
          {row.cells.map((field, index) => field && <div className={`save-record-field${index === 0 ? ' identity' : ''}`} key={field.offset}>
            {index > 0 && <span className="save-record-label">{table.columns[index + 1]}</span>}
            <SaveFieldInput field={field} draft={drafts[field.offset]} names={names} onChange={onChange} label={`${rowSubject(row, names)} · ${field.label}`} />
          </div>)}
        </article>)}
      </div> : <div className="save-table-scroll">
        <table className="save-data-table">
          <thead><tr>{table.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>
            {used.map((row) => <tr key={row.key}>
              <th scope="row">{row.label}</th>
              {row.cells.map((field, index) => <td key={index}>
                {field
                  ? <SaveFieldInput field={field} draft={drafts[field.offset]} names={names} onChange={onChange} compact label={`${rowSubject(row, names)} · ${table.columns[index + 1] ?? field.label}`} />
                  : <span className="save-cell readonly">—</span>}
              </td>)}
            </tr>)}
          </tbody>
        </table>
      </div>}
  </section>;
}
