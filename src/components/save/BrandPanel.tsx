import { useState } from 'react';
import { ANIMALS, animalResidents } from '../../lib/saveAnimals';
import { BRAND_PRODUCTS, CROP_BRAND_ITEMS, LIVESTOCK_BRAND_ITEMS, brandFeature, brandNames, storedBrands, withBrandName, type BrandEdits, type BrandKind } from '../../lib/saveBrands';
import type { SaveField, SaveModel } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import { itemLabel } from './ItemGrid';
import EntityPicker from './EntityPicker';
import SaveDialog from './SaveDialog';
import SaveFieldInput, { NAME_LIMIT, NameCount } from './SaveFieldInput';
import SaveIcon from './SaveIcon';
import { tr } from '../../i18n/active';

/** A field shape for names that only exist in the pending edits. */
const newNameField = (): SaveField => ({ offset: -1, label: tr('品牌名'), type: 'string', value: '', byteLength: 0, nameLimit: true });

export default function BrandPanel({ model, names, drafts, edits, onEdit, onField, onClearDraft }: {
  model: SaveModel; names: SaveNameTables; drafts: Record<number, string>; edits: BrandEdits;
  onEdit: (edits: BrandEdits) => void; onField: (field: SaveField, value: string) => void; onClearDraft: (offset: number) => void;
}) {
  const [adding, setAdding] = useState<BrandKind | null>(null), [picked, setPicked] = useState(''), [name, setName] = useState('');
  const tables = model.sections.find(section => section.id === 'brand')?.tables ?? [];
  const residents = animalResidents(model.doc);
  const speciesName = (id: number) => names.names?.livestock?.[id] ?? ANIMALS.find(animal => animal.id === id)?.name ?? String(id);
  const sharing = (item: string) => [...BRAND_PRODUCTS].filter(([, product]) => String(product) === item).map(([species]) => speciesName(species)).join(tr('、'));
  const branded = (item: string) => residents.filter(resident => String(BRAND_PRODUCTS.get(resident.species)) === item && brandFeature(model.doc, resident.index, edits)).length;

  const section = (kind: BrandKind, title: string, note: string) => {
    const stored = storedBrands(model.doc, kind), table = tables.find(entry => entry.id === (kind === 'crops' ? 'brandCropsNameMap_' : 'brandLivestockNameMap_'));
    const pending = Object.entries(edits[kind] ?? {}).filter((entry): entry is [string, string] => entry[1] !== null && !stored.some(row => row.key === entry[0]));
    const count = brandNames(model.doc, kind, edits, drafts).size;
    const describe = (key: string) => kind === 'livestock' ? <small className="save-cell-name">{tr('{species} · 品牌种 {count} 只', { species: sharing(key) || '—', count: branded(key) })}</small> : null;
    const identity = (key: string, tag?: string) => <div className="save-record-field identity"><span className="save-cell readonly">
      <SaveIcon names={names} kind="items" value={key} size={22} /><span className="save-cell-value">{itemLabel(names, key)}{tag && <small className="save-brand-tag">{tag}</small>}</span>{describe(key)}
    </span></div>;
    return <section className="save-group save-brand-group" aria-label={title}>
      <header className="save-brand-head"><h3>{tr('{title}（{count} 条）', { title, count })}</h3><button type="button" onClick={() => { setAdding(kind); setPicked(''); setName(''); }}>{kind === 'crops' ? tr('添加作物品牌') : tr('添加畜产品牌')}</button></header>
      <p className="save-tab-description">{note}</p>
      {count === 0 && !stored.length && <p className="save-tab-empty">{tr('这个存档里还没有登记品牌名。')}</p>}
      <div className="save-record-grid">
        {stored.map((entry, index) => {
          const removed = edits[kind]?.[entry.key] === null, field = table?.rows[index]?.cells[1];
          return <article className={`save-record-card${removed ? ' removed' : ''}`} key={entry.key} aria-label={`${title} ${itemLabel(names, entry.key)}`}>
            {identity(entry.key, removed ? tr('待删除') : undefined)}
            {!removed && field && <div className="save-record-field"><span className="save-record-label">{tr('品牌名')}</span><SaveFieldInput field={field} draft={drafts[field.offset]} names={names} onChange={onField} label={`${itemLabel(names, entry.key)} · ${tr('品牌名')}`} /></div>}
            <div className="save-record-actions">{removed
              ? <button type="button" onClick={() => onEdit(withBrandName(model.doc, edits, kind, entry.key, entry.name))}>{tr('撤销删除')}</button>
              : <button type="button" onClick={() => { if (field) onClearDraft(field.offset); onEdit(withBrandName(model.doc, edits, kind, entry.key, null)); }}>{tr('删除品牌')}</button>}</div>
          </article>;
        })}
        {pending.map(([key, value]) => <article className="save-record-card" key={key} aria-label={`${title} ${itemLabel(names, key)}`}>
          {identity(key, tr('新增'))}
          <div className="save-record-field"><span className="save-record-label">{tr('品牌名')}</span><SaveFieldInput field={newNameField()} draft={value} names={names} onChange={(_, next) => onEdit(withBrandName(model.doc, edits, kind, key, next))} label={`${itemLabel(names, key)} · ${tr('品牌名')}`} /></div>
          <div className="save-record-actions"><button type="button" onClick={() => onEdit(withBrandName(model.doc, edits, kind, key, null))}>{tr('撤销新增')}</button></div>
        </article>)}
      </div>
    </section>;
  };

  const taken = adding ? brandNames(model.doc, adding, edits, drafts) : new Map();
  // A stored entry waiting for deletion can't be added again until the deletion is undone.
  const blocked = adding ? new Set(storedBrands(model.doc, adding).map(entry => entry.key)) : new Set<string>();
  const allowed = new Set((adding === 'crops' ? CROP_BRAND_ITEMS : LIVESTOCK_BRAND_ITEMS).map(String).filter(id => !taken.has(id) && !blocked.has(id)));
  const tooLong = Array.from(name).length > NAME_LIMIT;
  return <div className="save-brands">
    {section('crops', tr('作物品牌'), tr('登记后，这种作物收获时都是品牌品质，并显示品牌名。'))}
    {section('livestock', tr('畜产品牌'), tr('品牌名按主要产物登记，同产物的品种共用一个名字。产物要变成品牌品质，还需要在畜牧页把动物设为品牌种。'))}
    {adding && <SaveDialog title={adding === 'crops' ? tr('添加作物品牌') : tr('添加畜产品牌')} onClose={() => setAdding(null)}><div className="save-brand-picker">
      <EntityPicker names={names} kind="items" value={picked} allowedIds={allowed} label={adding === 'crops' ? tr('作物') : tr('畜产品')} onChange={setPicked} />
      <div className="save-animal-add-footer"><label className="save-animal-move"><span>{picked ? tr('{item}的品牌名', { item: itemLabel(names, picked) }) : tr('品牌名')}</span>
        <input aria-label={tr('新品牌名')} placeholder={tr('最多 {limit} 个字符', { limit: NAME_LIMIT })} value={name} aria-invalid={tooLong || undefined} onChange={event => setName(event.target.value)} /><NameCount value={name} /></label>
        <button type="button" className="save-download" disabled={!picked || !name.trim() || tooLong} onClick={() => { onEdit(withBrandName(model.doc, edits, adding, picked, name.trim())); setAdding(null); }}>{tr('添加品牌')}</button></div>
    </div></SaveDialog>}
  </div>;
}
