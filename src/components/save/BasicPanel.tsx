import { describeGameTime, type SaveField, type SaveGroup } from '../../lib/saveModel';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveFieldInput from './SaveFieldInput';
import SaveFieldTable from './SaveFieldTable';
import GameClockInput from './GameClockInput';

export default function BasicPanel({ groups, drafts, names, onChange }: {
  groups: SaveGroup[];
  drafts: Record<number, string>;
  names: SaveNameTables;
  onChange: (field: SaveField, value: string) => void;
}) {
  const time = groups.find(group => group.title === '时间');
  const clock = time?.fields.find(field => field.label === '游戏内累计秒数');
  const seconds = clock && (drafts[clock.offset] ?? clock.value);
  const duration = ['小时', '分', '秒'].map(unit => ({ unit, field: time?.fields.find(field => field.label === `游玩时长 · ${unit}`) }));
  return <div className="save-basic-layout">
    <div className="save-basic-column">
      <SaveFieldTable groups={groups.filter(group => !['时间', '天气'].includes(group.title))} drafts={drafts} names={names} onChange={onChange} />
    </div>
    <div className="save-basic-column">
      {time && <section className="save-group save-basic-time">
        <h3>时间</h3>
        {clock && <>
          <p className="save-clock-preview">{seconds && /^\d+$/.test(seconds) ? describeGameTime(BigInt(seconds)) : '请输入有效的游戏时间'}</p>
          <GameClockInput value={seconds ?? ''} onChange={value => onChange(clock, value)} />
          <div className="save-field-row">
            <span className="save-field-meta"><b>{clock.label}</b></span>
            <SaveFieldInput field={clock} draft={drafts[clock.offset]} names={names} onChange={onChange} />
          </div>
        </>}
        {duration.some(entry => entry.field) && <div className="save-play-duration"><h4>实际游玩时长</h4><div className="save-duration-fields">{duration.map(({ unit, field }) => field && <label key={unit}><span>{unit}</span><SaveFieldInput field={field} draft={drafts[field.offset]} names={names} onChange={onChange} /></label>)}</div></div>}
      </section>}
      <SaveFieldTable groups={groups.filter(group => group.title === '天气')} drafts={drafts} names={names} onChange={onChange} />
    </div>
  </div>;
}
