import { useState } from 'react';
import { ANIMALS, animalHouses, animalResidents, type AnimalEdits } from '../../lib/saveAnimals';
import type { SaveField, SaveModel } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveIcon from './SaveIcon';
import SaveDialog from './SaveDialog';
import SaveFieldInput from './SaveFieldInput';
import { buildSaveSearchText, normalizeSearch } from '../../lib/saveSearch';

export default function AnimalsPanel({ model, names, edits, drafts, onEdit, onField }: { model: SaveModel; names: SaveNameTables; edits: AnimalEdits; drafts: Record<number, string>; onEdit: (edits: AnimalEdits) => void; onField: (field: SaveField, value: string) => void }) {
  const houses = animalHouses(model.doc), residents = animalResidents(model.doc, edits);
  const rows = model.sections.find(section => section.id === 'barn')?.tables[0]?.rows ?? [];
  const [selected, setSelected] = useState<number | null>(null), [adding, setAdding] = useState<number | null>(null), [species, setSpecies] = useState(''), [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const detail = selected === null ? null : residents.find(resident => resident.index === selected);
  const tableRow = detail && rows[detail.index];
  const speciesName = (id: number) => names.names?.livestock?.[id] ?? ANIMALS.find(animal => animal.id === id)?.name ?? String(id);
  const loose = residents.filter(resident => !houses.some(house => house.slots.some(slot => slot.id === resident.placement)));
  const canAdd = residents.some(resident => ANIMALS.some(a => a.id === resident.species && a.id < 100 && a.houseType < 2));
  const variantFor = (id: number, index = 0) => ANIMALS.find(a => a.id === id)?.variants.find(v => v.index === index);
  const variantName = (id: number, index = 0) => { const v = variantFor(id, index); return v?.itemId ? names.names?.items?.[v.itemId] ?? speciesName(id) : speciesName(id); };
  const portrait = (id: number, variant = 0, size = 46) => { const v = variantFor(id, variant); return <SaveIcon names={names} kind={v?.itemId ? 'items' : 'livestock'} value={String(v?.itemId || id)} size={size} />; };
  const availableSpecies = adding === null ? [] : ANIMALS.filter(a => a.id < 100 && a.houseType === houses.find(house => house.slots.some(slot => slot.id === adding))?.type).flatMap(a => a.variants.map(v => ({ id: `${a.id}:${v.index}`, species: a.id, variant: v.index, name: variantName(a.id, v.index), growDays: a.growDays })));
  const matches = availableSpecies.filter(a => buildSaveSearchText(a.name, speciesName(a.species)).includes(normalizeSearch(query)));
  function move(placement: number) {
    if (!detail) return;
    const occupant = residents.find(resident => resident.placement === placement), moves: Record<string, number> = { ...edits.moves, [detail.index]: placement };
    if (occupant && occupant.index !== detail.index) moves[occupant.index] = detail.placement;
    onEdit({ ...edits, moves });
  }
  const animalButton = (resident: typeof residents[number]) => <button type="button" className={`save-animal-card${resident.index === selected ? ' active' : ''}`} key={resident.index} onClick={() => setSelected(resident.index)}>{portrait(resident.species, resident.variant)}<b>{drafts[rows[resident.index]?.cells[0]?.offset ?? -1] ?? resident.name}</b><small>{variantName(resident.species, resident.variant)}</small></button>;
  return <div className="save-animals">
    {!canAdd && houses.length > 0 && <p className="save-notice">先在游戏中领养一只普通家畜或家禽，再添加新伙伴。</p>}
    {houses.map(house => <section className="save-container-panel" key={house.id}><header className="save-container-head"><h3>{house.title}</h3><small>{house.slots.length} 个安置位置</small></header><div className="save-animal-slots">{house.slots.map((slot, index) => {
      const resident = residents.find(resident => resident.placement === slot.id), addition = edits.added?.[slot.id];
      return <div key={slot.id} className="save-animal-position"><small>位置 {index + 1}</small>{resident ? animalButton(resident) : addition ? <div className="save-animal-card">{portrait(addition.species, addition.variant)}<b>{addition.name}</b><small>新增 · {variantName(addition.species, addition.variant)}</small><button type="button" onClick={() => { const added = { ...edits.added }; delete added[slot.id]; onEdit({ ...edits, added }); }}>撤销新增</button></div> : <button type="button" className="save-animal-card empty" disabled={!canAdd} onClick={() => { setAdding(slot.id); setSpecies(''); setName(''); setQuery(''); }}><span>＋</span><small>添加动物</small></button>}</div>;
    })}</div></section>)}
    {loose.length > 0 && <section className="save-container-panel"><h3>其他伙伴</h3><div className="save-animal-slots">{loose.map(animalButton)}</div></section>}
    {detail && tableRow && <SaveDialog title={`${detail.name} · ${speciesName(detail.species)}`} onClose={() => setSelected(null)}><div className="save-animal-fields">{tableRow.cells.filter(field => field && !field.readOnly).map(field => field && <label key={field.offset}><span>{field.label}</span><SaveFieldInput field={field} draft={drafts[field.offset]} names={names} onChange={onField} /></label>)}</div>
      {houses.some(house => house.slots.some(slot => slot.id === detail.placement)) && <label className="save-animal-move"><span>安置位置</span><select aria-label="安置位置" value={detail.placement} onChange={event => move(Number(event.target.value))}>{houses.filter(house => house.type === ANIMALS.find(animal => animal.id === detail.species)?.houseType).map(house => <optgroup key={house.id} label={house.title}>{house.slots.filter(slot => !edits.added?.[slot.id]).map((slot, index) => <option value={slot.id} key={slot.id}>位置 {index + 1}{residents.find(resident => resident.placement === slot.id && resident.index !== detail.index) ? ' · 交换位置' : ''}</option>)}</optgroup>)}</select></label>}
    </SaveDialog>}
    {adding !== null && <SaveDialog title="添加动物" onClose={() => setAdding(null)}><div className="save-animal-picker">
      <input type="search" className="save-animal-search" aria-label="搜索动物品种" placeholder="搜索品种、拼音或首字母" value={query} onChange={e => setQuery(e.target.value)} />
      <div className="save-animal-breeds" role="group" aria-label="新动物品种">{matches.map(a => <button type="button" key={a.id} aria-pressed={species === a.id} onClick={() => setSpecies(a.id)}>{portrait(a.species, a.variant, 48)}<strong>{a.name}</strong><small>{a.growDays > 0 ? '幼年' : '成年'}</small></button>)}{!matches.length && <p>没有匹配的品种。</p>}</div>
      <div className="save-animal-add-footer"><label className="save-animal-move"><span>名字</span><input aria-label="新动物名字" placeholder="给新伙伴起个名字" value={name} onChange={event => setName(event.target.value)} /></label><button type="button" className="save-download" disabled={!species || !name.trim()} onClick={() => { const [id, variant] = species.split(':').map(Number); onEdit({ ...edits, added: { ...edits.added, [adding]: { species: id, variant, name: name.trim() } } }); setAdding(null); }}>添加到空位</button></div>
    </div></SaveDialog>}
  </div>;
}
