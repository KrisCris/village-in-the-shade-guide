import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { buildDailyDigest, DAYS_PER_SEASON, landSummary } from '../../domain/dailyDigest';
import { dailyPlan, planFlags } from '../../domain/dailyPlan';
import { DAILY_CROPS, enabledFlags, type DailySnapshot } from '../../lib/saveDaily';
import { loadDailyData, readDone, readSettings, writeDone, writeSettings, type DailyData, type DailySettings } from '../../lib/dailyData';
import { GAME_SEASONS } from '../../lib/saveTime';
import { lookupName, type SaveNameTables } from '../../lib/saveNames';
import type { SerDocument } from '../../lib/ser';
import type { FarmArea } from '../../lib/farmArea';
import { withBase } from '../../lib/sitePath';
import { minimapImage } from '../../data/collectionMap';
import { Icon, useNames, type IconName, type MapTarget } from './dailyUi';
import TodayList, { actionKey } from './TodayList';
import DeliverySection from './DeliverySection';
import ProcessingSection from './ProcessingSection';
import PlantingSection from './PlantingSection';
import FarmSection from './FarmSection';
import { activeLocale, tr } from '../../i18n/active';

const FarmAreaMap = lazy(() => import('./FarmAreaMap'));

const clock = (hour: number, minute: number) => `${hour}:${String(minute).padStart(2, '0')}`;
const browserStorage = () => { try { return window.localStorage; } catch { return undefined; } };

/** Keeps the section menu below the site header, whose height changes when it wraps. */
function useHeaderHeight() {
  const [height, setHeight] = useState(64);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.site-header');
    if (!header) return;
    const observer = new ResizeObserver(() => setHeight(header.getBoundingClientRect().height));
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return height;
}

/** The last section whose top has passed the upper third of the screen; none above the first, the last one at the page bottom. */
function useActiveSection(ids: string[], enabled: boolean) {
  const [active, setActive] = useState<string>();
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const bottom = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
      setActive(bottom ? ids.at(-1) : ids.filter((id) => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= innerHeight * 0.35).at(-1));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(frame); removeEventListener('scroll', schedule); removeEventListener('resize', schedule); };
  }, [ids.join(), enabled]);
  return active;
}

export default function DailyReport({ doc, snapshot, names, area, storageFailed, onAdd, onRemove, onSwitch }: {
  doc: SerDocument;
  snapshot: DailySnapshot;
  names: SaveNameTables;
  area: FarmArea;
  storageFailed: boolean;
  onAdd: (cells: number[]) => void;
  onRemove: (cells: number[]) => void;
  onSwitch: () => void;
}) {
  const digest = useMemo(() => buildDailyDigest(snapshot, DAILY_CROPS), [snapshot]);
  const land = useMemo(() => landSummary(snapshot.cells, new Set(area.include)), [snapshot, area]);
  const [map, setMap] = useState<{ target: MapTarget | null } | null>(null);
  const [data, setData] = useState<DailyData | null>(null), [dataError, setDataError] = useState(false), [attempt, setAttempt] = useState(0);
  const [settings, setSettings] = useState<DailySettings>(() => readSettings(browserStorage(), snapshot.player));
  const { date } = digest;
  const night = digest.hoursToTurnover > 0;
  // Ticks belong to this save: a later save of the same day has its own jobs and counts.
  const saveTime = `${date.year}-${date.season}-${date.day} ${date.hour}:${date.minute}`;
  const [done, setDone] = useState(() => new Set(readDone(browserStorage(), snapshot.player, saveTime)));
  const dialog = useRef<HTMLDialogElement>(null);
  const headerHeight = useHeaderHeight();

  useEffect(() => { setSettings(readSettings(browserStorage(), snapshot.player)); }, [snapshot.player]);
  useEffect(() => { setDone(new Set(readDone(browserStorage(), snapshot.player, saveTime))); }, [snapshot.player, saveTime]);
  useEffect(() => {
    let current = true;
    setDataError(false);
    loadDailyData().then((loaded) => { if (current) setData(loaded); }).catch(() => { if (current) setDataError(true); });
    return () => { current = false; };
  }, [attempt]);
  useEffect(() => {
    const element = dialog.current;
    if (map && element && !element.open) element.showModal();
  }, [map]);

  const name = useNames(names);
  const showOnMap = (target: MapTarget | null) => setMap({ target });
  const changeSettings = (next: Partial<DailySettings>) => setSettings((previous) => {
    const merged = { ...previous, ...next };
    writeSettings(browserStorage(), snapshot.player, merged);
    return merged;
  });
  const toggle = (key: string) => setDone((previous) => {
    const next = new Set(previous);
    if (!next.delete(key)) next.add(key);
    writeDone(browserStorage(), snapshot.player, saveTime, [...next]);
    return next;
  });

  const daysLeft = DAYS_PER_SEASON - snapshot.date.day;
  const unlocked = useMemo(() => data ? enabledFlags(doc, planFlags(data.payload)) : new Set<number>(), [doc, data]);
  const vacant = land.tilled + land.plain;
  const plan = useMemo(() => data && dailyPlan({
    snapshot, digest, payload: data.payload, crops: data.crops, unlocked, itemCategory: (itemId) => names.itemCategories?.[itemId], settings, vacant,
  }), [data, snapshot, digest, unlocked, names, settings, vacant]);
  const sections = ['daily-today', 'daily-deliveries', 'daily-machines', 'daily-land', 'daily-farm'];
  const active = useActiveSection(sections, Boolean(plan));
  const navList = useRef<HTMLUListElement>(null);
  // On a phone the menu scrolls sideways; keep the highlighted part in view.
  useEffect(() => {
    const list = navList.current, link = list?.querySelector<HTMLElement>('[aria-current]');
    if (!list || !link) return;
    const left = link.offsetLeft - list.offsetLeft, right = left + link.offsetWidth;
    if (left < list.scrollLeft) list.scrollTo({ left: left - 8, behavior: 'smooth' });
    else if (right > list.scrollLeft + list.clientWidth) list.scrollTo({ left: right - list.clientWidth + 8, behavior: 'smooth' });
  }, [active]);

  const money = new Intl.NumberFormat(activeLocale()).format(snapshot.money);
  const weather = lookupName(names, 'weather', String(snapshot.weather));

  const tiles: Array<{ key: string; id: string; icon: IconName; label: string; value: string | number; caption: string; tone?: 'alert' | 'done' }> = [];
  if (plan) {
    const tasks = plan.actions.map(actionKey), ticked = tasks.filter((key) => done.has(key)).length;
    const builds = plan.processing.families.flatMap((family) => family.build).reduce((sum, step) => sum + step.count, 0);
    const missing = plan.materials.filter((line) => line.short > 0).length;
    const free = plan.livestock.housing.reduce((sum, line) => sum + Math.max(0, line.slots - line.used), 0);
    const { deliveries } = plan;
    // After midnight the catalog waits for the morning, like the to-do list says.
    const handIn = night ? deliveries.ready.filter((entry) => entry.spec.list !== 'catalog') : deliveries.ready, waiting = deliveries.ready.length - handIn.length;
    const roomy = plan.livestock.ideas.filter((idea) => idea.room > 0).length;
    tiles.push(
      { key: 'today', id: 'daily-today', icon: 'today', label: tr('今日待办'), value: tasks.length - ticked, caption: tasks.length ? tr('已完成 {done} / {total} 项', { done: ticked, total: tasks.length }) : tr('今天没有要紧的事。'), tone: tasks.length && ticked === tasks.length ? 'done' : undefined },
      { key: 'deliver', id: 'daily-deliveries', icon: 'deliver', label: tr('今天可以交'), value: handIn.length, caption: waiting ? tr('另有 {count} 项 7:00 后能交', { count: waiting }) : tr('已完成 {done} / {total} 项', { done: deliveries.done, total: deliveries.total }), tone: handIn.length ? 'alert' : undefined },
      { key: 'build', id: 'daily-machines', icon: 'machine', label: tr('要加造的设备'), value: builds, caption: !builds ? tr('现有设备够用') : missing ? tr('材料还差 {count} 种', { count: missing }) : tr('材料够用'), tone: builds ? 'alert' : 'done' },
      { key: 'land', id: 'daily-land', icon: 'land', label: tr('空着的农田'), value: vacant, caption: !vacant ? tr('农田都种上了') : !daysLeft ? tr('明天就换季') : tr('有 {count} 种作物来得及成熟', { count: plan.planting.length }) },
      { key: 'animals', id: 'daily-land', icon: 'farm', label: tr('家畜空位'), value: free, caption: roomy ? tr('有 {count} 种动物现在就能养', { count: roomy }) : plan.livestock.ideas.length ? tr('交付要的动物得先扩建或新建') : tr('交付不需要新的动物') },
    );
  }
  const navLabel: Record<string, string> = {
    'daily-today': tr('待办'), 'daily-deliveries': tr('交付'), 'daily-machines': tr('设备'), 'daily-land': tr('空地和家畜'), 'daily-farm': tr('农场概况'),
  };

  return <div className="daily-report" style={{ '--daily-top': `${headerHeight}px` } as CSSProperties}>
    <header className={`daily-hero is-season-${date.season}`}>
      <span className="daily-hero-glyph" aria-hidden="true">{GAME_SEASONS[date.season]}</span>
      <div className="daily-hero-text">
        <p className="daily-hero-eyebrow">{tr('第 {year} 年 · 存档时间 {time}', { year: date.year, time: clock(date.hour, date.minute) })}</p>
        <h2>{tr('{season} 第 {day} 天', { season: GAME_SEASONS[date.season], day: date.day })}</h2>
        <ul className="daily-facts">
          {weather && <li className="pill">{weather}</li>}
          <li className="pill">{tr('持有金钱 {money}', { money })}</li>
        </ul>
      </div>
      <div className="daily-season">
        <span className="daily-season-label">{digest.daysLeft ? tr('本季还剩 {days} 天', { days: digest.daysLeft }) : tr('今天是本季最后一天')}</span>
        <ol className="daily-season-track" aria-hidden="true">
          {Array.from({ length: DAYS_PER_SEASON }, (_, index) => <li key={index} className={index + 1 < date.day ? 'is-past' : index + 1 === date.day ? 'is-today' : undefined} />)}
        </ol>
        <button type="button" className="daily-switch" onClick={onSwitch}><Icon name="swap" size={18} />{tr('换一个存档')}</button>
      </div>
    </header>
    {digest.hoursToTurnover > 0 && <p className="daily-banner is-info"><Icon name="clock" size={18} />{tr('这是午夜后的存档：离 07:00 换日还有 {hours} 小时。这段时间进不了别人家，河里只钓得到被诅咒的鱼；要等天亮的事排在待办最后。', { hours: digest.hoursToTurnover })}</p>}

    {dataError ? <p className="save-status error" role="alert">{tr('交付和加工数据没能载入。')} <button type="button" onClick={() => setAttempt((count) => count + 1)}>{tr('重试')}</button></p>
      : !plan ? <p className="save-loading" role="status">{tr('正在核对交付、设备和材料…')}</p>
      : <>
        <ul className="daily-tiles">{tiles.map((tile) => <li key={tile.key}>
          <a className={`daily-tile${tile.tone ? ` is-${tile.tone}` : ''}`} href={`#${tile.id}`}>
            <span className="daily-tile-label"><Icon name={tile.icon} size={18} />{tile.label}</span>
            <b className="daily-tile-value">{tile.value}</b>
            <small>{tile.caption}</small>
          </a>
        </li>)}</ul>

        <nav className="daily-nav" aria-label={tr('页面目录')}>
          <ul ref={navList}>{sections.map((id) => <li key={id}><a href={`#${id}`} aria-current={active === id ? 'true' : undefined}>{navLabel[id]}</a></li>)}</ul>
          <button type="button" className="daily-nav-map" onClick={() => showOnMap(null)}><Icon name="map" size={18} />{tr('地图')}</button>
        </nav>

        <TodayList actions={plan.actions} names={names} name={name} horizon={plan.horizon} night={night} done={done} onToggle={toggle} onMap={showOnMap} />
        <DeliverySection deliveries={plan.deliveries} names={names} name={name} night={night} onMap={showOnMap} />
        <ProcessingSection plan={plan.processing} machines={digest.machines} materials={plan.materials} seasonDays={daysLeft} horizon={settings.horizon} reserve={settings.reserve} picked={settings.choices}
          names={names} name={name} onMap={showOnMap}
          onHorizon={(days) => changeSettings({ horizon: days })} onReserve={(reserve) => changeSettings({ reserve })}
          onChoice={(itemId, process) => changeSettings({ choices: process === undefined
            ? Object.fromEntries(Object.entries(settings.choices).filter(([key]) => key !== String(itemId)))
            : { ...settings.choices, [itemId]: process } })} />
        <PlantingSection land={land} ideas={plan.planting} housing={plan.livestock.housing} animals={plan.livestock.ideas} daysLeft={daysLeft} names={names} name={name}
          onEditArea={() => showOnMap(null)} />
      </>}

    <FarmSection digest={digest} land={land} names={names} name={name} storageFailed={storageFailed} onMap={showOnMap} onEditArea={() => showOnMap(null)} />

    <dialog ref={dialog} className="daily-map-dialog" aria-labelledby="daily-map-title" onClose={() => setMap(null)}
      onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      {map && <Suspense fallback={<p className="save-loading daily-map-placeholder" role="status">{tr('正在载入地图…')}</p>}>
        <FarmAreaMap doc={doc} area={area.include} highlight={map.target} village={data ? { src: withBase(minimapImage(activeLocale())), bounds: data.payload.village } : undefined}
          onAdd={onAdd} onRemove={onRemove} onClearHighlight={() => setMap({ target: null })} onClose={() => dialog.current?.close()} />
      </Suspense>}
    </dialog>
  </div>;
}
