import { CALENDAR_ICONS, type CalendarIconName } from '../art/calendarIcons';
import { GIFTS, SEASON_KEYS, weekday, weekdayName, type CalendarFestival } from '../../data/calendar';
import { residentOrder, type VillagerPlan, type WeekEvent } from '../../domain/dailyVillagers';
import { heartFill, SAVE_RULES } from '../../lib/saveRules';
import { fairEntryName } from '../../lib/saveFair';
import type { SaveNameTables } from '../../lib/saveNames';
import { withBase } from '../../lib/sitePath';
import SaveIcon from '../save/SaveIcon';
import { GrowList, ItemChip, Section, type Names } from './dailyUi';
import { activeLocale, pageHref, tr } from '../../i18n/active';

/** A calendar line icon (lantern, rosette, envelope, hourglass). */
export function CalendarGlyph({ name, size = 22 }: { name: CalendarIconName; size?: number }) {
  return <svg className={`daily-calendar-glyph is-${name}`} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d={CALENDAR_ICONS[name]} /></svg>;
}

/** What to know about a festival or the Evaluation on the day. */
export function festivalNotes(festival: CalendarFestival, fairEntry: number | null): string[] {
  switch (festival.key) {
    case 'SAKURA_VIEWING': return [tr('大家在广场赏花。')];
    case 'FESTIVAL': return [tr('晚上广场摆摊。琪娜娜这天卖彩色小鸡，不卖其他家畜。')];
    case 'HARVEST': return [tr('大家在广场烤红薯，游戏日历提醒带一个去。')];
    case 'NEW_YEARS_EVE': return [tr('帮忙准备就能拿到年糕。')];
    case 'FAIR': return [fairEntry === null ? tr('在广场举行，按回信选的部门参加。') : tr('在广场举行。这个存档报名的是{entry}。', { entry: fairEntryName(fairEntry) })];
  }
}

const when = (offset: number) => offset === 0 ? tr('今天') : offset === 1 ? tr('明天') : tr('{days} 天后', { days: offset });

/** Residents who take gifts and the coming week's birthdays and festivals. */
export default function VillagersSection({ plan, season, fairEntry, night, names, name }: {
  plan: VillagerPlan;
  season: number;
  fairEntry: number | null;
  /** A save after midnight: houses are closed until 07:00. */
  night: boolean;
  names: SaveNameTables;
  name: Names;
}) {
  const locale = activeLocale();
  const person = (id: number) => name.resident(id);
  const open = plan.residents.filter((entry) => entry.giftsLeft > 0).length;
  const residents = [...plan.residents].sort(residentOrder);

  const eventLine = (event: WeekEvent) => {
    const date = <span className="daily-week-date"><b>{when(event.offset)}</b><small>{tr('{weekday} · {day} 日', { weekday: weekdayName(weekday(event.date.day), locale), day: event.date.day })}</small></span>;
    switch (event.kind) {
      case 'birthday': {
        const entry = plan.residents.find((row) => row.resident.id === event.resident);
        return <>
          {date}
          <SaveIcon names={names} kind="characters" value={String(event.resident)} size={34} className="daily-week-portrait" />
          <span className="daily-week-body">
            <strong>{tr('{name}的生日', { name: person(event.resident) })}</strong>
            <small>{entry?.liked.length ? tr('手上有对方喜欢的 {count} 种', { count: entry.liked.length }) : tr('手上没有对方喜欢的东西')}</small>
          </span>
        </>;
      }
      case 'festival': case 'fair': return <>
        {date}
        <span className="daily-week-icon"><CalendarGlyph name={event.kind} /></span>
        <span className="daily-week-body"><strong>{event.festival.name}<span className="daily-week-time">{event.festival.start}–{event.festival.end}</span></strong>
          <small>{festivalNotes(event.festival, fairEntry).join(' ')}</small></span>
      </>;
      case 'letter': return <>
        {date}
        <span className="daily-week-icon"><CalendarGlyph name="letter" /></span>
        <span className="daily-week-body"><strong>{tr('品评会通知信')}</strong><small>{tr('回信时选参加作物、家畜还是马的评鉴。')}</small></span>
      </>;
      case 'end': return <>
        {date}
        <span className="daily-week-icon"><CalendarGlyph name="end" /></span>
        <span className="daily-week-body"><strong>{tr('本季最后一天')}</strong><small>{tr('下一季不能生长的作物在换日时枯萎；季节稻草人 5×5 范围内的不会。')}</small></span>
      </>;
    }
  };

  const cards = residents.map((entry) => {
    const fill = heartFill(entry.love, SAVE_RULES.npcHearts), hearts = fill.filter((amount) => amount === 1).length;
    const birthday = entry.birthdayIn !== null && entry.birthdayIn < 7;
    const weekFull = entry.giftsWeek >= GIFTS.per_week && entry.birthdayIn !== 0;
    return <li key={entry.resident.id} className={`card daily-resident${entry.birthdayIn === 0 ? ' is-birthday' : ''}${entry.giftsLeft ? '' : ' is-spent'}`}>
      <header className="daily-resident-head">
        <SaveIcon names={names} kind="characters" value={String(entry.resident.id)} size={44} className="daily-resident-portrait" />
        <div className="daily-resident-name">
          <strong>{person(entry.resident.id)}</strong>
          <span className="daily-resident-hearts" role="img" aria-label={tr('{hearts} 心，{points} 好感', { hearts, points: entry.love })}>
            {fill.map((amount, index) => <span key={index} className="daily-heart">
              <img src={withBase('/icons/generated/ui/friendship.webp')} alt="" />
              <img src={withBase('/icons/generated/ui/friendship.webp')} alt="" style={{ clipPath: `inset(0 ${(1 - amount) * 100}% 0 0)` }} />
            </span>)}
          </span>
        </div>
        {birthday && <span className="daily-resident-badge">{entry.birthdayIn === 0 ? tr('今天生日') : entry.birthdayIn === 1 ? tr('明天生日') : tr('{days} 天后生日', { days: entry.birthdayIn })}</span>}
      </header>
      <p className="daily-resident-status">
        <span className={entry.talked ? 'is-done' : undefined}>{entry.talked ? tr('今天聊过了') : tr('今天还没聊')}</span>
        <span className={entry.giftsLeft ? undefined : 'is-done'}>{entry.giftsToday >= GIFTS.per_day ? tr('今天送过礼了') : weekFull ? tr('本周 {week} 份送满了', { week: GIFTS.per_week }) : tr('本周已送 {count}/{week}', { count: entry.giftsWeek, week: GIFTS.per_week })}</span>
      </p>
      {entry.liked.length ? <div className="daily-items">{entry.liked.slice(0, 4).map(([itemId, count]) => <ItemChip key={itemId} names={names} itemId={itemId} label={name.item(itemId)} count={`×${count}`} />)}</div>
        : <p className="daily-resident-none">{tr('喜欢：{items}', { items: entry.resident.likes.slice(0, 4).map(name.item).join(tr('、')) })}</p>}
    </li>;
  });

  return <Section id="daily-villagers" icon="gift" title={tr('村民与日历')}
    summary={<>{tr('今天还能收礼的村民有 {count} 位。礼物每人每天 {day} 份、每周 {week} 份，周一清零；生日当天送的不占这 {week} 份。', { count: open, day: GIFTS.per_day, week: GIFTS.per_week })}
      {night && ` ${tr('午夜后进不了村民家，礼物等 7:00 换日后再送。')}`}</>}
    controls={<a className="button daily-link-button" href={pageHref(`/guides/season-plan/#${SEASON_KEYS[season]}`)}>{tr('本季日历')} →</a>}>
    <div className="daily-villager-layout">
      <section className="card daily-card daily-week" aria-labelledby="daily-week-title">
        <header className="daily-card-head"><h3 id="daily-week-title">{tr('接下来 7 天')}</h3></header>
        {plan.tonight === 'never' && <p className="daily-week-night"><CalendarGlyph name="noNight" size={18} />{tr('今晚是节日前一晚，没有深夜。')}</p>}
        {plan.tonight === 'always' && <p className="daily-week-night is-sure"><CalendarGlyph name="night" size={18} />{tr('今晚一定有深夜。')}</p>}
        {plan.week.length ? <ol className="daily-week-list">{plan.week.map((event, index) => <li key={index} className={`is-${event.kind}`}>{eventLine(event)}</li>)}</ol>
          : <p className="daily-note">{tr('这 7 天没有节日和生日。')}</p>}
      </section>
      <div className="daily-residents-wrap"><GrowList className="daily-residents" items={cards} shown={6} /></div>
    </div>
  </Section>;
}
