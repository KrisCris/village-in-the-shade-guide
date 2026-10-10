import { useState } from 'react';
import MachineRecipePicker, { MachineRecipeSummary } from './MachineRecipePicker';
import { MACHINES, machineJobs, machineSpec, deviceEnabled, type MachineEdit, type MachineEdits } from '../../lib/saveMachines';
import RankPicker from './RankPicker';
import type { SaveModel } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import { tr } from '../../i18n/active';

export default function BatchMachines({ family, model, edits, names, onChange, drafts, onDraft }: {
  family: string; model: SaveModel; edits: MachineEdits; names: SaveNameTables;
  onChange: (key: string, edit?: MachineEdit) => void;
  drafts: Record<number, string>; onDraft: (offset: number, value: string) => void;
}) {
  const [recipeId, setRecipeId] = useState(''), [rank, setRank] = useState(0);
  const [picking, setPicking] = useState(false);
  const targets = model.containers.filter(c => machineSpec(c)?.family === family && deviceEnabled(model.doc, c));
  const jobs = targets.flatMap(c => machineJobs(model.doc, c, edits).map(job => ({ ...job, container: c, key: `${c.id}/${job.index}` })));
  const recipes = MACHINES.processes.filter(r => targets.some(c => machineSpec(c)?.mode === 'processing' && r.machines.includes(c.dataId!)));
  const recipe = recipes.find(r => String(r.id) === recipeId);
  const empty = jobs.filter(j => !j.seconds && machineSpec(j.container)?.mode === 'processing' && recipe?.machines.includes(j.container.dataId!));
  const running = jobs.filter(j => j.remaining > 0), occupied = jobs.filter(j => j.seconds > 0);
  const collected = targets.filter(c => machineSpec(c)?.mode === 'collector').flatMap(c => c.slots.flatMap(s => s.item ? [s.item] : []));
  const modified = jobs.filter(j => edits[j.key]);
  return <div className="save-batch-panel">
    <p className="save-machine-caption">{targets.length} {tr('台设备 ·')} {occupied.length} {tr('个加工任务')}{collected.length > 0 && tr(' · {count} 格已收集物品', { count: collected.length })}</p>
    <RankPicker value={rank} onChange={setRank} />
    <div className="save-batch-actions">
      {!!jobs.length && <button type="button" disabled={!occupied.length} onClick={() => occupied.forEach(j => onChange(j.key, { ...edits[j.key], rank, finish: edits[j.key]?.finish ?? false }))}>{tr('设置')} {occupied.length} {tr('个任务的品质')}</button>}
      {targets.some(c => machineSpec(c)?.mode === 'collector') && <button type="button" disabled={!collected.length} onClick={() => collected.forEach(item => onDraft(item.rankOffset, String(rank)))}>{tr('设置')} {collected.length} {tr('格收集物的品质')}</button>}
      {!!jobs.length && <button type="button" disabled={!running.length} onClick={() => running.forEach(j => onChange(j.key, { ...edits[j.key], finish: true }))}>{tr('完成')} {running.length} {tr('个加工任务')}</button>}
    </div>
    {recipes.length > 0 && <div className="save-batch-recipe">
      <span>{tr('添加加工任务')}</span>
      <div className="save-recipe-options"><button type="button" aria-label={recipe ? tr('更换加工配方') : tr('选择加工配方')} onClick={() => setPicking(true)}>
        {recipe ? <MachineRecipeSummary recipe={recipe} names={names} rank={rank} /> : tr('选择加工配方')}
      </button></div>
      <button type="button" disabled={!recipe || !empty.length} onClick={() => empty.forEach(j => onChange(j.key, { recipeId: recipe!.id, rank, finish: false }))}>{tr('填入')} {empty.length} {tr('个空栏位')}</button>
      <p>{tr('只填入能加工此配方的空栏位，已有任务保留。材料直接生成，不扣背包物品。')}</p>
    </div>}
    {picking && <MachineRecipePicker recipes={recipes} names={names} rank={rank} onRankChange={setRank} batch onClose={() => setPicking(false)} onSelect={selected => { setRecipeId(String(selected.id)); setPicking(false); }} />}
    {!!modified.length && <button type="button" onClick={() => modified.forEach(j => onChange(j.key))}>{tr('撤销本类别的')} {modified.length} {tr('项任务修改')}</button>}
    {collected.some(item => drafts[item.rankOffset] !== undefined && drafts[item.rankOffset] !== item.rank) && <button type="button" onClick={() => collected.forEach(item => onDraft(item.rankOffset, item.rank))}>{tr('还原本类别收集物品质')}</button>}
  </div>;
}
