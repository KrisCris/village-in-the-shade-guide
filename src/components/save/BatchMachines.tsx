import { useState } from 'react';
import SearchableSelect from '../controls/SearchableSelect';
import { MACHINES, machineJobs, machineSpec, deviceEnabled, type MachineEdit, type MachineEdits } from '../../lib/saveMachines';
import { ITEM_RANKS } from '../../lib/saveRules';
import type { SaveModel } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import { itemLabel } from './ItemGrid';

export default function BatchMachines({ model, edits, names, onChange }: { model: SaveModel; edits: MachineEdits; names: SaveNameTables; onChange: (key: string, edit?: MachineEdit) => void }) {
  const [type, setType] = useState(''), [recipeId, setRecipeId] = useState(''), [rank, setRank] = useState(0);
  const devices = model.containers.filter(c => machineSpec(c) && deviceEnabled(model.doc, c));
  const types = [...new Set(devices.map(c => c.dataId!))];
  const targets = devices.filter(c => !type || c.dataId === Number(type));
  const jobs = targets.flatMap(c => machineJobs(model.doc, c, edits).map(job => ({ ...job, container: c, key: `${c.id}/${job.index}` })));
  const recipes = MACHINES.processes.filter(r => type && r.machines.includes(Number(type)));
  const recipe = recipes.find(r => String(r.id) === recipeId);
  const empty = jobs.filter(j => !j.seconds && machineSpec(j.container)?.mode === 'processing');
  const running = jobs.filter(j => j.remaining > 0);
  return <details className="save-batch-machines"><summary>批量设置加工设备</summary><div className="save-progress-toolbar">
    <label>设备范围<SearchableSelect value={type} onChange={e => { setType(e.target.value); setRecipeId(''); }}><option value="">全部设备</option>{types.map(id => <option key={id} value={id}>{itemLabel(names, String(MACHINES.machines.find(m => m.id === id)!.itemId))}</option>)}</SearchableSelect></label>
    <button type="button" disabled={!running.length} onClick={() => running.forEach(j => onChange(j.key, { ...edits[j.key], finish: true }))}>完成 {running.length} 个加工任务</button>
    <button type="button" disabled={!jobs.some(j => edits[j.key])} onClick={() => jobs.forEach(j => onChange(j.key))}>撤销此范围修改</button>
  </div>{type && <div className="save-progress-toolbar"><label>加工配方<SearchableSelect value={recipeId} onChange={e => setRecipeId(e.target.value)}><option value="">选择配方</option>{recipes.map(r => <option key={r.id} value={r.id}>{itemLabel(names, String(r.output))} · {r.inputs.map(i => `${itemLabel(names, String(i.itemId))} × ${i.count}`).join(' + ')}</option>)}</SearchableSelect></label><label>材料品质<SearchableSelect value={rank} onChange={e => setRank(Number(e.target.value))}>{ITEM_RANKS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</SearchableSelect></label><button type="button" disabled={!recipe || !empty.length} onClick={() => empty.forEach(j => onChange(j.key, { recipeId: recipe!.id, rank, finish: false }))}>填入 {empty.length} 个空栏位</button></div>}<p className="save-device-hint">当前范围共 {targets.length} 台。添加任务会生成材料，不扣背包物品；已有任务保留。</p></details>;
}
