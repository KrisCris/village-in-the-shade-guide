import { useMemo, useState } from 'react';
import { buildSaveSearchText, normalizeSearch } from '../../lib/saveSearch';
import { gameDuration, MACHINES, machineJobs, machineSpec, type MachineEdit, type MachineEdits } from '../../lib/saveMachines';
import type { SaveContainer } from '../../lib/saveItems';
import type { SaveModel } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveIcon from './SaveIcon';
import SaveDialog from './SaveDialog';
import { itemLabel } from './ItemGrid';

export default function MachinePanel({ model, container, edits, names, onChange }: { model: SaveModel; container: SaveContainer; edits: MachineEdits; names: SaveNameTables; onChange: (key: string, value?: MachineEdit) => void }) {
  const [picking, setPicking] = useState<number | null>(null), [search, setSearch] = useState('');
  const jobs = machineJobs(model.doc, container, edits);
  const spec = machineSpec(container);
  const indexed = useMemo(() => MACHINES.processes.filter(recipe => recipe.machines.includes(container.dataId!)).map(recipe => ({ ...recipe, searchText: buildSaveSearchText(itemLabel(names, String(recipe.output)), String(recipe.output)) })), [container.dataId, names]);
  const recipes = indexed.filter(recipe => recipe.searchText.includes(normalizeSearch(search)));
  if (spec?.mode === 'collector') return <div className="save-special-contents"><p>自动收集畜产品，在游戏中领取。</p><div className="save-collected-grid">{container.slots.flatMap(slot => slot.item ? [slot.item] : []).map((item, index) => <div key={index}><SaveIcon names={names} kind="items" value={item.itemId} size={40} /><span>{itemLabel(names, item.itemId)}<small>× {item.count}</small></span></div>)}</div>{!container.used && <p className="save-device-hint">暂未收集到物品</p>}</div>;
  if (!spec || !jobs.length) return <p className="save-tab-description">当前设备没有可编辑的加工任务。</p>;
  return <div className="save-machine-panel">
    <p className="save-machine-caption">{spec.mode === 'extractor' ? '自动采集树液' : `${spec.capacity} 个加工栏位`}</p>
    <div className="save-machine-jobs">{jobs.map(job => <article className="save-machine-job" key={job.index}>
      <header><b>加工栏位 {job.index + 1}</b><small>{job.seconds ? job.remaining ? '加工中' : '可以领取' : '空闲'}</small></header>
      {job.seconds ? <>
        <div className="save-machine-output"><SaveIcon names={names} kind="items" value={String(job.output)} size={48} /><b>{itemLabel(names, String(job.output))} × {job.count}</b></div>
        {job.inputs.length > 0 && <p className="save-machine-inputs">材料：{job.inputs.map(input => `${itemLabel(names, String(input.itemId))} × ${input.count}`).join('、')}</p>}
        <progress max={job.seconds} value={Math.max(0, job.seconds - job.remaining)} aria-label={`加工栏位 ${job.index + 1} 进度`} />
        <small>{job.remaining ? `剩余 ${gameDuration(job.remaining)}（游戏时间）` : '回到游戏后领取成品'}</small>
        <button type="button" disabled={!job.remaining} onClick={() => onChange(`${container.id}/${job.index}`, { ...edits[`${container.id}/${job.index}`], finish: true })}>立即完成</button>
      </> : spec.mode === 'extractor' ? <p>等待树木产出树液。</p> : <><p>选择这台设备能够加工的配方。</p><button type="button" onClick={() => { setPicking(job.index); setSearch(''); }}>添加加工任务</button></>}
      {job.edited && <button type="button" className="save-machine-undo" onClick={() => onChange(`${container.id}/${job.index}`)}>撤销此栏修改</button>}
    </article>)}</div>
    {picking !== null && <SaveDialog title="选择加工配方" onClose={() => setPicking(null)}>
      <p>加入所需材料并开始计时，材料品质为普通。此操作不会扣除背包物品。</p>
      <input className="save-machine-search" type="search" autoFocus value={search} placeholder="成品名称、拼音或首字母" aria-label="搜索加工配方" onChange={event => setSearch(event.target.value)} />
      <div className="save-recipe-options">{recipes.map(recipe => <button type="button" key={recipe.id} onClick={() => { onChange(`${container.id}/${picking}`, { recipeId: recipe.id, finish: false }); setPicking(null); }}>
        <SaveIcon names={names} kind="items" value={String(recipe.output)} size={36} /><span><b>{itemLabel(names, String(recipe.output))} × {recipe.count}</b><small>{recipe.inputs.map(input => `${itemLabel(names, String(input.itemId))} × ${input.count}`).join(' + ')} · {gameDuration(recipe.minutes * 60)}（游戏时间）</small></span>
      </button>)}</div>
      {!recipes.length && <p>没有匹配的配方。</p>}
    </SaveDialog>}
  </div>;
}
