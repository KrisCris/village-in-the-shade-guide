import RankPicker from './RankPicker';
import { useState } from 'react';
import { gameDuration, MACHINES, machineJobs, machineSpec, type MachineEdit, type MachineEdits } from '../../lib/saveMachines';
import type { SaveContainer } from '../../lib/saveItems';
import type { SaveModel } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveIcon from './SaveIcon';
import MachineRecipePicker from './MachineRecipePicker';
import { itemLabel } from './ItemGrid';
import { tr } from '../../i18n/active';

export default function MachinePanel({ model, container, edits, names, onChange, drafts, onDraft }: { drafts: Record<number, string>; onDraft: (offset: number, value: string) => void; model: SaveModel; container: SaveContainer; edits: MachineEdits; names: SaveNameTables; onChange: (key: string, value?: MachineEdit) => void }) {
  const [picking, setPicking] = useState<number | null>(null);
  const [rank, setRank] = useState(0);
  const jobs = machineJobs(model.doc, container, edits);
  const spec = machineSpec(container);
  if (spec?.mode === 'collector') return <div className="save-special-contents"><p>{tr('自动收集畜产品，在游戏中领取。')}</p><div className="save-collected-grid">{container.slots.flatMap(slot => slot.item ? [slot.item] : []).map((item, index) => <div key={index}><SaveIcon names={names} kind="items" value={item.itemId} size={40} rank={Number(drafts[item.rankOffset] ?? item.rank)} /><span>{itemLabel(names, item.itemId)}<small>× {item.count}</small></span><RankPicker label={tr('物品品质')} value={Number(drafts[item.rankOffset] ?? item.rank)} onChange={value => onDraft(item.rankOffset, String(value))} /></div>)}</div>{!container.used && <p className="save-device-hint">{tr('暂未收集到物品')}</p>}</div>;
  if (!spec || !jobs.length) return <p className="save-tab-description">{tr('当前设备没有可编辑的加工任务。')}</p>;
  return <div className="save-machine-panel">
    <p className="save-machine-caption">{spec.mode === 'extractor' ? tr('自动采集树液') : tr('{capacity} 个加工栏位', { capacity: spec.capacity })}</p>
    <div className="save-machine-jobs">{jobs.map(job => <article className="save-machine-job" key={job.index}>
      <header><b>{tr('加工栏位')} {job.index + 1}</b><small>{job.seconds ? job.remaining ? tr('加工中') : tr('可以领取') : tr('空闲')}</small></header>
      {job.seconds ? <>
        <div className="save-machine-output"><SaveIcon names={names} kind="items" value={String(job.output)} size={48} rank={job.rank} /><b>{itemLabel(names, String(job.output))} × {job.count}</b></div>
        {job.inputs.length > 0 && <div className="save-machine-inputs"><span>{tr('材料')}</span><ul>{job.inputs.map((input, index) => <li key={index}>
          <SaveIcon names={names} kind="items" value={String(input.itemId)} size={32} rank={edits[`${container.id}/${job.index}`]?.rank ?? ('rank' in input ? Number(input.rank) : job.rank)} />
          <span>{itemLabel(names, String(input.itemId))} × {input.count}</span>
        </li>)}</ul></div>}
        <RankPicker value={job.rank} onChange={value => onChange(`${container.id}/${job.index}`, { ...edits[`${container.id}/${job.index}`], finish: edits[`${container.id}/${job.index}`]?.finish ?? false, rank: value })} />
        <progress max={job.seconds} value={Math.max(0, job.seconds - job.remaining)} aria-label={tr('加工栏位 {number} 进度', { number: job.index + 1 })} />
        <small>{job.remaining ? tr('剩余 {gameDuration}（游戏时间）', { gameDuration: gameDuration(job.remaining) }) : tr('回到游戏后领取成品')}</small>
        <button type="button" disabled={!job.remaining} onClick={() => onChange(`${container.id}/${job.index}`, { ...edits[`${container.id}/${job.index}`], finish: true })}>{tr('立即完成')}</button>
      </> : spec.mode === 'extractor' ? <p>{tr('等待树木产出树液。')}</p> : <><p>{tr('选择这台设备能够加工的配方。')}</p><button type="button" onClick={() => setPicking(job.index)}>{tr('添加加工任务')}</button></>}
      {job.edited && <button type="button" className="save-machine-undo" onClick={() => onChange(`${container.id}/${job.index}`)}>{tr('撤销此栏修改')}</button>}
    </article>)}</div>
    {picking !== null && <MachineRecipePicker recipes={MACHINES.processes.filter(recipe => recipe.machines.includes(container.dataId!))} names={names} rank={rank} onRankChange={setRank} onClose={() => setPicking(null)}
      onSelect={recipe => { onChange(`${container.id}/${picking}`, { recipeId: recipe.id, finish: false, rank }); setPicking(null); }} />}

  </div>;
}
