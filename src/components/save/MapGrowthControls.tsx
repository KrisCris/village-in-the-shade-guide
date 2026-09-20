import { CROP_FORMS, type cropGrowth, type CellPaint } from '../../lib/saveMap';
import SearchableSelect from '../controls/SearchableSelect';

export default function MapGrowthControls({ state, onChange }: {
  state: ReturnType<typeof cropGrowth>; onChange: (paint: CellPaint) => void;
}) {
  if (!state) return null;
  const normal = state.forms['1'];
  return <div className="farm-growth">
    <strong>生长状态</strong>
    <p>{CROP_FORMS[state.form] ?? '未知状态'} · 阶段 {state.stage + 1} / {state.stages.length}</p>
    <p>{state.days === null ? '此状态不按成长天数推进' : state.days === 0 ? '已成熟' : `基础剩余 ${state.days} 天`}</p>
    <small>按每日 100 成长点估算；季节、浇水、肥料等会影响实际时间。</small>
    <SearchableSelect aria-label="作物形态" value={state.form} onChange={e => onChange({ form: Number(e.target.value), growth: 0 })}>
      {Object.entries(state.forms).filter(([, stages]) => stages.length).map(([form]) => <option key={form} value={form}>{CROP_FORMS[Number(form)] ?? `形态 ${form}`}</option>)}
    </SearchableSelect>
    <div className="farm-growth-stages" role="group" aria-label="生长阶段">
      {state.stages.map(([growth], i) => <button type="button" key={i} aria-pressed={i === state.stage} onClick={() => onChange({ growth })}>{i === state.stages.length - 1 && state.days !== null ? '成熟' : `阶段 ${i + 1}`}</button>)}
    </div>
    {state.maximum > 0 && <label>成长进度
      <input aria-label="成长进度" type="range" min="0" max={state.maximum} value={Math.min(state.growth, state.maximum)} onChange={e => onChange({ growth: Number(e.target.value) })}/>
    </label>}
    {state.days !== null && <label>基础剩余天数
      <input aria-label="基础剩余天数" type="number" min="0" max={Math.ceil(state.maximum / 100)} value={state.days} onChange={e => { const days=Number(e.target.value); if(Number.isFinite(days)&&days>=0)onChange({growth:Math.max(0,state.maximum-Math.round(days)*100)}); }}/>
    </label>}
    {!!normal?.length && <div className="farm-growth-stages">
      <button type="button" onClick={() => onChange({ form: 1, growth: 0 })}>恢复幼苗</button>
      <button type="button" onClick={() => onChange({ form: 1, growth: normal.at(-1)![0] })}>一键成熟</button>
    </div>}
  </div>;
}
