import type { SaveField, SaveTable } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveFieldInput from './SaveFieldInput';

interface SaveDataTableProps {
  table: SaveTable;
  drafts: Record<number, string>;
  names: SaveNameTables;
  onChange: (field: SaveField, value: string) => void;
}

export default function SaveDataTable({ table, drafts, names, onChange }: SaveDataTableProps) {
  const used = table.rows.filter((row) => row.cells.some(Boolean));
  return <section className="save-group" key={table.id}>
    <h3>{table.title}</h3>
    {table.note && <p className="save-tab-description">{table.note}</p>}
    {used.length === 0
      ? <p className="save-tab-empty">这个容器是空的。</p>
      : <div className="save-table-scroll">
        <table className="save-data-table">
          <thead><tr>{table.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>
            {used.map((row) => <tr key={row.key}>
              <th scope="row">{row.label}</th>
              {row.cells.map((field, index) => <td key={index}>
                {field
                  ? <SaveFieldInput field={field} draft={drafts[field.offset]} names={names} onChange={onChange} compact />
                  : <span className="save-cell readonly">—</span>}
              </td>)}
            </tr>)}
          </tbody>
        </table>
      </div>}
  </section>;
}
