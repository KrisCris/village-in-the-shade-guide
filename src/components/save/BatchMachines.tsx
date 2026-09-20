import { useState } from 'react';
import SearchableSelect from '../controls/SearchableSelect';
import { MACHINES, machineJobs, machineSpec, deviceEnabled, type MachineEdit, type MachineEdits } from '../../lib/saveMachines';
import RankPicker from './RankPicker';
import SaveIcon from './SaveIcon';
import type { SaveModel } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import { itemLabel } from './ItemGrid';

export default function BatchMachines({ family, model, edits, names, onChange, drafts, onDraft }: {
  family: string; model: SaveModel; edits: MachineEdits; names: SaveNameTables;
  onChange: (key: string, edit?: MachineEdit) => void;
  drafts: Record<number, string>; onDraft: (offset: number, value: string) => void;
}) {
  const [recipeId, setRecipeId] = useState(''), [rank, setRank] = useState(0);
  const targets = model.containers.filter(c => machineSpec(c)?.family === family && deviceEnabled(model.doc, c));
  const jobs = targets.flatMap(c => machineJobs(model.doc, c, edits).map(job => ({ ...job, container: c, key: `${c.id}/${job.index}` })));
  const recipes = MACHINES.processes.filter(r => targets.some(c => machineSpec(c)?.mode === 'processing' && r.machines.includes(c.dataId!)));
  const recipe = recipes.find(r => String(r.id) === recipeId);
  const empty = jobs.filter(j => !j.seconds && machineSpec(j.container)?.mode === 'processing' && recipe?.machines.includes(j.container.dataId!));
  const running = jobs.filter(j => j.remaining > 0), occupied = jobs.filter(j => j.seconds > 0);
  const collected = targets.filter(c => machineSpec(c)?.mode === 'collector').flatMap(c => c.slots.flatMap(s => s.item ? [s.item] : []));
  const modified = jobs.filter(j => edits[j.key]);
  return <div className="save-batch-panel">
    <p className="save-machine-caption">{targets.length} 台设备 · {occupied.length} 个加工任务{collected.length > 0 && ` · ${collected.length} 格已收集物品`}</p>
    <RankPicker value={rank} onChange={setRank} />
    <div className="save-batch-actions">
      {!!jobs.length && <button type="button" disabled={!occupied.length} onClick={() => occupied.forEach(j => onChange(j.key, { ...edits[j.key], rank, finish: edits[j.key]?.finish ?? false }))}>设置 {occupied.length} 个任务的品质</button>}
      {targets.some(c => machineSpec(c)?.mode === 'collector') && <button type="button" disabled={!collected.length} onClick={() => collected.forEach(item => onDraft(item.rankOffset, String(rank)))}>设置 {collected.length} 格收集物的品质</button>}
      {!!jobs.length && <button type="button" disabled={!running.length} onClick={() => running.forEach(j => onChange(j.key, { ...edits[j.key], finish: true }))}>完成 {running.length} 个加工任务</button>}
    </div>
    {recipes.length > 0 && <div className="save-batch-recipe">
      <label>添加加工任务<SearchableSelect value={recipeId} onChange={e => setRecipeId(e.target.value)}><option value="">选择配方</option>{recipes.map(r => <option key={r.id} value={r.id}>{itemLabel(names, String(r.output))} · {r.inputs.map(i => `${itemLabel(names, String(i.itemId))} × ${i.count}`).join(' + ')}</option>)}</SearchableSelect></label>
      {recipe && <div className="save-machine-output"><SaveIcon names={names} kind="items" value={String(recipe.output)} size={48} rank={rank} /><span>{itemLabel(names, String(recipe.output))} × {recipe.count}</span></div>}
      <button type="button" disabled={!recipe || !empty.length} onClick={() => empty.forEach(j => onChange(j.key, { recipeId: recipe!.id, rank, finish: false }))}>填入 {empty.length} 个空栏位</button>
      <p>只填入能加工此配方的空栏位，已有任务保留。材料直接生成，不扣背包物品。</p>
    </div>}
    {!!modified.length && <button type="button" onClick={() => modified.forEach(j => onChange(j.key))}>撤销本类别的 {modified.length} 项任务修改</button>}
    {collected.some(item => drafts[item.rankOffset] !== undefined && drafts[item.rankOffset] !== item.rank) && <button type="button" onClick={() => collected.forEach(item => onDraft(item.rankOffset, item.rank))}>还原本类别收集物品质</button>}
  </div>;
}
