import SearchableSelect from '../controls/SearchableSelect';
import { mapAnimalEdits, type MapEdits } from '../../lib/saveMap';
import type { ProgressEdits } from '../../lib/saveProgress';
import { useLayoutEffect, useRef, useState } from 'react';
import { ANIMALS, animalHouses, animalResidents, type AnimalEdits } from '../../lib/saveAnimals';
import type { SaveField, SaveModel } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveIcon from './SaveIcon';
import SaveDialog from './SaveDialog';
import SaveFieldInput, { NAME_LIMIT, NameCount } from './SaveFieldInput';
import { buildSaveSearchText, normalizeSearch } from '../../lib/saveSearch';
import { tr } from '../../i18n/active';

export default function AnimalsPanel({ model, names, edits: rawEdits, drafts, onEdit: changeEdits, onField, progress, mapEdits = {} }: { mapEdits?: MapEdits; progress?: ProgressEdits; model: SaveModel; names: SaveNameTables; edits: AnimalEdits; drafts: Record<number, string>; onEdit: (edits: AnimalEdits) => void; onField: (field: SaveField, value: string) => void }) {
  let edits=rawEdits, migrationError='';
  try { edits=mapAnimalEdits(model.doc,mapEdits,rawEdits,progress??{}); } catch(error) { migrationError=(error as Error).message; }
  function onEdit(next:AnimalEdits) {
    // Persist only user changes, so undoing a map upgrade also undoes its automatic migration.
    const moves={...rawEdits.moves},added={...rawEdits.added};
    for(const key of new Set([...Object.keys(edits.moves??{}),...Object.keys(next.moves??{})]))if(edits.moves?.[key]!==next.moves?.[key]){if(next.moves?.[key]===undefined)delete moves[key];else moves[key]=next.moves[key];}
    for(const key of new Set([...Object.keys(edits.added??{}),...Object.keys(next.added??{})]))if(edits.added?.[key]!==next.added?.[key]){if(next.added?.[key]===undefined){delete added[key];const original=Object.entries(rawEdits.added??{}).find(([,value])=>value===edits.added?.[key]);if(original)delete added[original[0]];}else added[key]=next.added[key];}
    changeEdits({...rawEdits,moves,added});
  }
  const houses = animalHouses(model.doc, progress), residents = animalResidents(model.doc, edits);
  const grid = useRef<HTMLDivElement>(null);
  const rows = model.sections.find(section => section.id === 'barn')?.tables[0]?.rows ?? [];
  const [selected, setSelected] = useState<number | null>(null), [adding, setAdding] = useState<number | null>(null), [species, setSpecies] = useState(''), [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const detail = selected === null ? null : residents.find(resident => resident.index === selected);
  const tableRow = detail && rows[detail.index];
  const speciesName = (id: number) => names.names?.livestock?.[id] ?? ANIMALS.find(animal => animal.id === id)?.name ?? String(id);
  const loose = residents.filter(resident => !houses.some(house => house.slots.some(slot => slot.id === resident.placement)));
  const layoutKey = houses.map(house => `${house.id}:${house.slots.length}`).join('|') + `:${loose.length}`;
  useLayoutEffect(() => {
    const root = grid.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const tiles = Array.from(root.querySelectorAll<HTMLElement>(':scope > .save-animal-tile'));
    const layout = () => {
      for (const tile of tiles) {
        const panel = tile.firstElementChild;
        if (panel) tile.style.gridRowEnd = `span ${Math.ceil(panel.getBoundingClientRect().height + parseFloat(getComputedStyle(tile).paddingBottom))}`;
      }
      root.dataset.masonry = 'true';
    };
    const observer = new ResizeObserver(layout);
    for (const tile of tiles) if (tile.firstElementChild) observer.observe(tile.firstElementChild);
    layout();
    return () => observer.disconnect();
  }, [layoutKey]);
  const canAdd = residents.some(resident => ANIMALS.some(a => a.id === resident.species && a.id < 100 && a.houseType < 3));
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
  const housePanel = (house: typeof houses[number]) => <section className={`save-container-panel save-animal-house${house.type === 2 ? ' save-animal-stable' : ''}`} key={house.id}><header className="save-container-head"><h3>{house.title}</h3><small>{house.slots.length} {tr('个安置位置')}</small></header><div className="save-animal-slots">{house.slots.map((slot, index) => {
      const resident = residents.find(resident => resident.placement === slot.id), addition = edits.added?.[slot.id];
      return <div key={slot.id} className="save-animal-position"><small>{tr('位置')} {index + 1}</small>{resident ? animalButton(resident) : addition ? <div className="save-animal-card">{portrait(addition.species, addition.variant)}<b>{addition.name}</b><small>{tr('新增 ·')} {variantName(addition.species, addition.variant)}</small><button type="button" onClick={() => { const added = { ...edits.added }; delete added[slot.id]; onEdit({ ...edits, added }); }}>{tr('撤销新增')}</button></div> : <button type="button" className="save-animal-card empty" disabled={!canAdd} onClick={() => { setAdding(slot.id); setSpecies(''); setName(''); setQuery(''); }}><span>＋</span><small>{tr('添加动物')}</small></button>}</div>;
    })}</div></section>;
  return <div className="save-animals" ref={grid}>
    {migrationError&&<p role="alert">{migrationError}</p>}
    {!canAdd && houses.length > 0 && <div className="save-animal-tile save-animal-notice"><p className="save-notice">{tr('先在游戏中领养一只普通家畜或家禽，再添加新伙伴。')}</p></div>}
    {houses.map(house => <div className="save-animal-tile" key={house.id}>{housePanel(house)}</div>)}
    {loose.length > 0 && <div className="save-animal-tile"><section className="save-container-panel"><header className="save-container-head"><h3>{tr('其他伙伴')}</h3><small>{loose.length} {tr('位伙伴')}</small></header><div className="save-animal-slots">{loose.map(animalButton)}</div></section></div>}
    {detail && tableRow && <SaveDialog title={`${detail.name} · ${speciesName(detail.species)}`} onClose={() => setSelected(null)}><div className="save-animal-fields">{tableRow.cells.filter(field => field && !field.readOnly).map(field => field && <label key={field.offset}><span>{field.label}</span><SaveFieldInput field={field} draft={drafts[field.offset]} names={names} onChange={onField} /></label>)}</div>
      {houses.some(house => house.slots.some(slot => slot.id === detail.placement)) && <label className="save-animal-move"><span>{tr('安置位置')}</span><SearchableSelect aria-label={tr('安置位置')} value={detail.placement} onChange={event => move(Number(event.target.value))}>{houses.filter(house => house.type === ANIMALS.find(animal => animal.id === detail.species)?.houseType).map(house => <optgroup key={house.id} label={house.title}>{house.slots.filter(slot => !edits.added?.[slot.id]).map((slot, index) => <option value={slot.id} key={slot.id}>{tr('位置')} {index + 1}{residents.find(resident => resident.placement === slot.id && resident.index !== detail.index) ? tr(' · 交换位置') : ''}</option>)}</optgroup>)}</SearchableSelect></label>}
    </SaveDialog>}
    {adding !== null && <SaveDialog title={tr('添加动物')} onClose={() => setAdding(null)}><div className="save-animal-picker">
      <input type="search" className="save-animal-search" aria-label={tr('搜索动物品种')} placeholder={tr('搜索品种、拼音或首字母')} value={query} onChange={e => setQuery(e.target.value)} />
      <div className="save-animal-breeds" role="group" aria-label={tr('新动物品种')}>{matches.map(a => <button type="button" key={a.id} aria-pressed={species === a.id} onClick={() => setSpecies(a.id)}>{portrait(a.species, a.variant, 48)}<strong>{a.name}</strong><small>{a.growDays > 0 ? tr('幼年') : tr('成年')}</small></button>)}{!matches.length && <p>{tr('没有匹配的品种。')}</p>}</div>
      <div className="save-animal-add-footer"><label className="save-animal-move"><span>{tr('名字')}</span><input aria-label={tr('新动物名字')} placeholder={tr('给新伙伴起个名字')} maxLength={NAME_LIMIT} value={name} onChange={event => setName(event.target.value)} /><NameCount value={name} /></label><button type="button" className="save-download" disabled={!species || !name.trim() || Array.from(name).length > NAME_LIMIT} onClick={() => { const [id, variant] = species.split(':').map(Number); onEdit({ ...edits, added: { ...edits.added, [adding]: { species: id, variant, name: name.trim() } } }); setAdding(null); }}>{tr('添加到空位')}</button></div>
    </div></SaveDialog>}
  </div>;
}
