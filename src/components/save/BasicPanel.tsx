import { describeGameTime, FAIR_GROUP, type SaveField, type SaveGroup } from '../../lib/saveModel';
import { FAIR_ENTRIES, fairDayEntry, fairDayPrepared, fairEntryName, withFairDayEntry, withoutFairDayEdits, type FairEntry } from '../../lib/saveFair';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveFieldInput from './SaveFieldInput';
import SaveFieldTable from './SaveFieldTable';
import GameClockInput from './GameClockInput';
import SearchableSelect from '../controls/SearchableSelect';
import { GAME_LANGUAGES, gameLanguage, withGameLanguage, type ProgressEdits } from '../../lib/saveProgress';
import type { SerDocument } from '../../lib/ser';
import { tr } from '../../i18n/active';

export default function BasicPanel({ groups, drafts, names, onChange, doc, progress, onProgress }: {
  doc: SerDocument; progress: ProgressEdits; onProgress: (edits: ProgressEdits) => void;
  groups: SaveGroup[];
  drafts: Record<number, string>;
  names: SaveNameTables;
  onChange: (field: SaveField, value: string) => void;
}) {
  const time = groups.find(group => group.title === tr('时间'));
  const clock = time?.fields.find(field => field.label === tr('游戏内累计秒数'));
  const seconds = clock && (drafts[clock.offset] ?? clock.value);
  const duration = [[tr('小时'), tr('游玩时长 · 小时')], [tr('分'), tr('游玩时长 · 分')], [tr('秒'), tr('游玩时长 · 秒')]].map(([unit, label]) => ({ unit, field: time?.fields.find(field => field.label === label) }));
  return <div className="save-basic-layout">
    <div className="save-basic-column">
      <SaveFieldTable groups={groups.filter(group => ![tr('时间'), tr('天气'), FAIR_GROUP].includes(group.title))} drafts={drafts} names={names} onChange={onChange} />
    </div>
    <div className="save-basic-column">
      <section className="save-group save-basic-language">
        <h3>{tr('游戏语言')}</h3>
        <label><span>{tr('这个存档使用的语言')}</span><SearchableSelect value={gameLanguage(doc, progress) ?? ''} onChange={event => onProgress(withGameLanguage(doc, progress, Number(event.target.value)))}>
          {gameLanguage(doc, progress) === undefined && <option value="">{tr('未知')}</option>}
          {GAME_LANGUAGES.map(language => <option key={language.flag} value={language.flag}>{language.name}</option>)}
        </SearchableSelect></label>
        <p>{tr('进入游戏后生效。选档界面的摘要可能仍显示原来的语言。')}</p>
      </section>
      <FairSection field={groups.find(group => group.title === FAIR_GROUP)?.fields[0]} drafts={drafts} onChange={onChange} doc={doc} progress={progress} onProgress={onProgress} />
      {time && <section className="save-group save-basic-time">
        <h3>{tr('时间')}</h3>
        {clock && <>
          <p className="save-clock-preview">{seconds && /^\d+$/.test(seconds) ? describeGameTime(BigInt(seconds)) : tr('请输入有效的游戏时间')}</p>
          <GameClockInput value={seconds ?? ''} onChange={value => onChange(clock, value)} />
        </>}
        {duration.some(entry => entry.field) && <div className="save-play-duration"><h4>{tr('实际游玩时长')}</h4><div className="save-duration-fields">{duration.map(({ unit, field }) => field && <label key={unit}><span>{unit}</span><SaveFieldInput field={field} draft={drafts[field.offset]} names={names} onChange={onChange} /></label>)}</div></div>}
      </section>}
      <SaveFieldTable groups={groups.filter(group => group.title === tr('天气'))} drafts={drafts} names={names} onChange={onChange} />
    </div>
  </div>;
}

/**
 * Before the 26th the answer on the fair notice decides the entry; from the 26th the
 * preparation has copied it into flags, so the fair day is changed through those.
 */
function FairSection({ field, drafts, onChange, doc, progress, onProgress }: {
  field?: SaveField; drafts: Record<number, string>; onChange: (field: SaveField, value: string) => void;
  doc: SerDocument; progress: ProgressEdits; onProgress: (edits: ProgressEdits) => void;
}) {
  const prepared = fairDayPrepared(doc);
  const entry = fairDayEntry(doc, progress);
  return <section className="save-group save-basic-language save-basic-fair">
    <h3>{tr('评鉴会')}</h3>
    {prepared ? <>
      <label><span>{tr('今天的评鉴项目')}</span><SearchableSelect value={entry ?? ''} onChange={event => {
        const next = Number(event.target.value) as FairEntry;
        onProgress(next === fairDayEntry(doc) ? withoutFairDayEdits(progress) : withFairDayEntry(doc, progress, next));
      }}>
        {entry === undefined && <option value="">{tr('未知')}</option>}
        {FAIR_ENTRIES.map(option => <option key={option} value={option}>{fairEntryName(option)}</option>)}
      </SearchableSelect></label>
      <p>{tr('会场已按回信布置好。修改后，会场布局和评鉴流程都会换成新项目。')}</p>
    </> : field ? <>
      <label><span>{tr('通知信上的回信')}</span><SearchableSelect value={drafts[field.offset] ?? field.value} onChange={event => onChange(field, event.target.value)}>
        {field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </SearchableSelect></label>
      <p>{tr('每季 27 日举行。26 日游戏按这封回信布置会场，没有回信就随机选一项。改回“尚未回答”后，可以在游戏里重新回信。')}</p>
    </> : <p>{tr('这个存档里没有待处理的评鉴会通知信。通知信每季 19 日寄到，之后可以在这里修改回信。')}</p>}
  </section>;
}
