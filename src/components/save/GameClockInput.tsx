import { useEffect, useRef, useState } from 'react';
import { GAME_SEASONS, joinGameTime, splitGameTime, type GameDate } from '../../lib/saveTime';
import { tr } from '../../i18n/active';

export default function GameClockInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [date, setDate] = useState<GameDate>(() => splitGameTime(value) ?? splitGameTime('0')!);
  const emitted = useRef(value);
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    const next = splitGameTime(value);
    if (next) setDate(next);
  }, [value]);
  function change(key: keyof GameDate, value: string) {
    const next = { ...date, [key]: value };
    setDate(next);
    emitted.current = joinGameTime(next) ?? '';
    onChange(emitted.current);
  }
  const valid = joinGameTime(date) !== null && splitGameTime(value) !== null;
  return <div className="save-calendar">
    <div className="save-calendar-date">
      <label><span>{tr('年份')}</span><input aria-label={tr('游戏年份')} type="number" min="1" step="1" value={date.year} onChange={event => change('year', event.target.value)} /></label>
      <label><span>{tr('季节')}</span><select aria-label={tr('游戏季节')} value={date.season} onChange={event => change('season', event.target.value)}>{GAME_SEASONS.map((name, index) => <option value={index} key={name}>{name}</option>)}</select></label>
      <label><span>{tr('日期')}</span><select aria-label={tr('游戏日期')} value={date.day} onChange={event => change('day', event.target.value)}>{Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{i + 1} {tr('日')}</option>)}</select></label>
    </div>
    <div className="save-calendar-clock">{([['hour', tr('时'), 24], ['minute', tr('分'), 60], ['second', tr('秒'), 60]] as const).map(([key, label, count]) => <label key={key}><span>{label}</span><select aria-label={tr('游戏时刻 · {label}', { label })} value={date[key]} onChange={event => change(key, event.target.value)}>{Array.from({ length: count }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}</option>)}</select></label>)}</div>
    {!valid && <small className="save-calendar-error" role="status">{tr('请输入有效日期和时间。')}</small>}
  </div>;
}
