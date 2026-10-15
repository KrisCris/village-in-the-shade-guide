import { useDeferredValue, useMemo, useState } from 'react';
import { isNodeList, NULL_REF, SerTag, type SerDocument, type SerNode } from '../../lib/ser';
import { collectFields, rawFieldFor, type SaveField, type SaveModel } from '../../lib/saveModel';
import { lookupName, type SaveNameTables } from '../../lib/saveNames';
import { buildSaveSearchText, normalizeSearch } from '../../lib/saveSearch';
import SaveFieldInput from './SaveFieldInput';
import { tr } from '../../i18n/active';

interface RawTreeProps {
  model: SaveModel;
  doc: SerDocument;
  drafts: Record<number, string>;
  names: SaveNameTables;
  onChange: (field: SaveField, value: string) => void;
}
/** The curated fields by offset; a node that has one is edited through it everywhere. */
type TreeProps = RawTreeProps & { fields: ReadonlyMap<number, SaveField> };

const TAG_LABELS: Record<number, string> = {
  [SerTag.Scalar]: tr('数值'),
  [SerTag.Blob]: tr('字节数组'),
  [SerTag.Object]: tr('对象'),
  [SerTag.List]: tr('列表'),
  [SerTag.Pointer]: tr('指针'),
  [SerTag.String]: tr('字符串'),
};

/** How many children to render before asking for the rest; some lists hold thousands. */
const PAGE = 100;
const SEARCH_LIMIT = 200;

function meta(node: SerNode): string {
  const parts = [TAG_LABELS[node.tag] ?? `tag ${node.tag}`, `0x${node.offset.toString(16).padStart(6, '0')}`, tr('{size} 字节', { size: node.size })];
  if (node.tag === SerTag.List && node.ref >= 0) parts.push(tr('{ref} 项', { ref: node.ref }));
  if (node.tag === SerTag.Pointer && node.ref === NULL_REF) parts.push(tr('空指针'));
  return parts.join(' · ');
}

function Leaf({ doc, node, drafts, names, onChange, fields }: TreeProps & { node: SerNode }) {
  // Edits are keyed by offset and read back with the curated field when there is
  // one, so the tree must show and validate the same type (a float stays a float).
  const field = useMemo(() => fields.get(node.offset) ?? rawFieldFor(doc, node), [doc, node, fields]);
  if (!field) return <span className="save-cell readonly" />;
  return <SaveFieldInput field={field} draft={drafts[field.offset]} names={names} onChange={onChange} compact />;
}

function NodeRow(props: TreeProps & { node: SerNode; depth: number; autoOpen: boolean }) {
  const { doc, node, depth, autoOpen } = props;
  const [open, setOpen] = useState(autoOpen);
  const [limit, setLimit] = useState(PAGE);
  const container = isNodeList(node.tag);
  const children = open && container ? doc.children(node) : [];

  return <>
    <div className="save-tree-row" style={{ paddingLeft: `${depth * 1.1}rem` }}>
      <span className="save-tree-label">
        {container
          ? <button type="button" className="save-tree-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            {open ? '▾' : '▸'} {node.name}
          </button>
          : <span className="save-tree-leaf">{node.name}</span>}
        <small>{meta(node)}</small>
      </span>
      {container ? <span className="save-cell readonly" /> : <Leaf {...props} />}
    </div>
    {children.slice(0, limit).map((child) => (
      <NodeRow {...props} key={child.offset} node={child} depth={depth + 1} autoOpen={false} />
    ))}
    {children.length > limit && <div className="save-tree-row" style={{ paddingLeft: `${(depth + 1) * 1.1}rem` }}>
      <button type="button" className="save-tree-more" onClick={() => setLimit((value) => value + PAGE * 5)}>
        {tr('还有 {count} 个子节点，点击展开更多', { count: children.length - limit })}
      </button>
    </div>}
  </>;
}

interface Hit { node: SerNode; path: string }

/** Depth-first search over node names and paths; stops once the list is full. */
function search(doc: SerDocument, query: string, labels: ReadonlyMap<number, string>): { hits: Hit[]; truncated: boolean } {
  const needle = normalizeSearch(query);
  const hits: Hit[] = [];
  let truncated = false;
  const walk = (node: SerNode, path: string): void => {
    if (truncated) return;
    const full = path ? `${path}/${node.name}` : node.name;
    if (buildSaveSearchText(full).includes(needle) || labels.get(node.offset)?.includes(needle)) {
      if (hits.length >= SEARCH_LIMIT) { truncated = true; return; }
      hits.push({ node, path: full });
    }
    for (const child of doc.children(node)) walk(child, full);
  };
  walk(doc.root, '');
  return { hits, truncated };
}

export default function RawTree(props: RawTreeProps) {
  const { doc, model, names } = props;
  const fields = useMemo(() => collectFields(model), [model]);
  const labels = useMemo(() => new Map([...fields].map(([offset, field]) => [offset, buildSaveSearchText(field.label, lookupName(names, field.lookup, field.value) ?? '')])), [fields, names]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [query, setQuery] = useState('');
  // The walk visits up to ~200k nodes, so keep typing ahead of the search.
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(
    () => (deferredQuery.trim().length >= 2 ? search(doc, deferredQuery, labels) : null),
    [doc, deferredQuery, labels],
  );

  return <div className="save-raw-editor">
    <div className="save-raw-warning">
      <strong>{tr('完整字段树')}</strong>
      <p>
        {tr('这里允许直接修改存档字段。请只修改含义明确的内容；错误的改动可能导致游戏无法读取存档。')}
      </p>
      <label>
        <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
        {tr('我了解风险，允许在这里编辑')}
      </label>
    </div>
    {acknowledged ? <>
      <input
        className="save-raw-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={tr('字段名称、拼音、首字母或路径')}
        aria-label={tr('搜索字段')}
        spellCheck={false}
      />
      {results
        ? <div className="save-tree">
          {results.hits.length === 0 && <p className="save-tab-empty">{tr('没有匹配的字段。')}</p>}
          {results.hits.map(({ node, path }) => <div className="save-tree-row" key={node.offset}>
            <span className="save-tree-label">
              <span className="save-tree-leaf">{fields.get(node.offset)?.label ?? node.name}</span>
              <small>{path} · {meta(node)}</small>
            </span>
            {isNodeList(node.tag) ? <span className="save-cell readonly" /> : <Leaf {...props} fields={fields} node={node} />}
          </div>)}
          {results.truncated && <div className="save-tree-row">
            <span className="save-tree-label"><small>{tr('结果超过 {count} 条，请把关键词写得更具体。', { count: SEARCH_LIMIT })}</small></span>
          </div>}
        </div>
        : <div className="save-tree"><NodeRow {...props} fields={fields} node={doc.root} depth={0} autoOpen /></div>}
    </> : <p className="save-tab-empty">{tr('勾选上方确认后才会显示完整字段树。')}</p>}
  </div>;
}
