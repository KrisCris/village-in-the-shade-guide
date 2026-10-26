import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { buildDailyDigest, DAYS_PER_SEASON, landSummary, type CellGroup, type LostGroup } from '../../domain/dailyDigest';
import { dailyPlan, planFlags } from '../../domain/dailyPlan';
import { DAILY_CROPS, enabledFlags, type DailySnapshot } from '../../lib/saveDaily';
import { loadDailyData, readSettings, writeSettings, type DailyData, type DailySettings } from '../../lib/dailyData';
import { GAME_SEASONS } from '../../lib/saveTime';
import { lookupName, type SaveNameTables } from '../../lib/saveNames';
import type { SerDocument } from '../../lib/ser';
import type { FarmArea } from '../../lib/farmArea';
import SaveIcon from '../save/SaveIcon';
import type { MapHighlight } from './FarmAreaMap';
import { Card, ShortList, useNames } from './dailyUi';
import TodayList from './TodayList';
import DeliverySection from './DeliverySection';
import ProcessingSection from './ProcessingSection';
import PlantingSection from './PlantingSection';
import { activeLocale, tr } from '../../i18n/active';

const FarmAreaMap = lazy(() => import('./FarmAreaMap'));

const clock = (hour: number, minute: number) => `${hour}:${String(minute).padStart(2, '0')}`;
const browserStorage = () => { try { return window.localStorage; } catch { return undefined; } };

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
  const [mapOpen, setMapOpen] = useState(false), [highlight, setHighlight] = useState<MapHighlight | null>(null);
  const [data, setData] = useState<DailyData | null>(null), [dataError, setDataError] = useState(false), [attempt, setAttempt] = useState(0);
  const [settings, setSettings] = useState<DailySettings>(() => readSettings(browserStorage(), snapshot.player));
  const mapAnchor = useRef<HTMLDivElement>(null);
  useEffect(() => { if (mapOpen) mapAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [mapOpen, highlight]);
  useEffect(() => { setSettings(readSettings(browserStorage(), snapshot.player)); }, [snapshot.player]);
  useEffect(() => {
    let current = true;
    setDataError(false);
    loadDailyData().then((loaded) => { if (current) setData(loaded); }).catch(() => { if (current) setDataError(true); });
    return () => { current = false; };
  }, [attempt]);

  const name = useNames(names);
  const showOnMap = (label: string, cells: number[]) => { setHighlight({ label, cells }); setMapOpen(true); };
  const changeSettings = (next: Partial<DailySettings>) => setSettings((previous) => {
    const merged = { ...previous, ...next };
    writeSettings(browserStorage(), snapshot.player, merged);
    return merged;
  });

  const daysLeft = DAYS_PER_SEASON - snapshot.date.day;
  const unlocked = useMemo(() => data ? enabledFlags(doc, planFlags(data.payload)) : new Set<number>(), [doc, data]);
  const vacant = land.tilled + land.plain;
  const plan = useMemo(() => data && dailyPlan({
    snapshot, digest, payload: data.payload, crops: data.crops, unlocked, itemCategory: (itemId) => names.itemCategories?.[itemId], settings, vacant,
  }), [data, snapshot, digest, unlocked, names, settings, vacant]);

  const money = new Intl.NumberFormat(activeLocale()).format(snapshot.money);
  const weather = lookupName(names, 'weather', String(snapshot.weather));
  const { date, chores, seasonEnd } = digest;
  const stopCauses = new Set([...seasonEnd.witherTomorrow, ...seasonEnd.lost].map((group) => group.cause));
  const cropRow = (group: CellGroup, note?: string, key = String(group.crop)) => {
    const crop = name.crop(group.crop);
    return <li className="daily-row" key={key}>
      <SaveIcon names={names} kind="crops" value={String(group.crop)} size={32} />
      <span className="daily-row-name">{crop}{note && <small>{note}</small>}</span>
      <b className="daily-count">{tr('{count} 格', { count: group.cells.length })}</b>
      <button type="button" className="daily-map-button" aria-label={tr('在地图上标出{name}', { name: crop })} onClick={() => showOnMap(note ? `${crop} · ${note}` : crop, group.cells)}>{tr('地图')}</button>
    </li>;
  };
  const harvestNote = { ripe: undefined, withered: tr('已枯萎，仍可收获'), shake: tr('摇树收果') };
  const lostNote = ({ cause, days, left }: LostGroup) => cause === 'season'
    ? left ? tr('还要 {days} 天，本季只剩 {left} 天', { days, left }) : tr('还要 {days} 天，明天就换季', { days })
    : left ? tr('还要 {days} 天，稻草人只剩 {left} 天', { days, left }) : tr('还要 {days} 天，稻草人明天失效', { days });

  return <>
    <header className="daily-head">
      <div>
        <p className="eyebrow">{tr('第 {year} 年 · 存档时间 {time}', { year: date.year, time: clock(date.hour, date.minute) })}</p>
        <h2>{tr('{season} 第 {day} 天', { season: GAME_SEASONS[date.season], day: date.day })}</h2>
        <ul className="daily-facts">
          <li className="pill">{digest.daysLeft ? tr('本季还剩 {days} 天', { days: digest.daysLeft }) : tr('今天是本季最后一天')}</li>
          {weather && <li className="pill">{weather}</li>}
          <li className="pill">{tr('持有金钱 {money}', { money })}</li>
        </ul>
      </div>
      <button type="button" className="save-switch" onClick={onSwitch}>{tr('换一个存档')}</button>
    </header>
    {digest.hoursToTurnover > 0 && <p className="save-status">{tr('这是午夜后的存档：离 07:00 换日还有 {hours} 小时，下面的事今天还来得及做。', { hours: digest.hoursToTurnover })}</p>}

    {dataError ? <p className="save-status error" role="alert">{tr('交付和加工数据没能载入。')} <button type="button" onClick={() => setAttempt((count) => count + 1)}>{tr('重试')}</button></p>
      : !plan ? <p className="save-loading" role="status">{tr('正在核对交付、设备和材料…')}</p>
      : <>
        <TodayList actions={plan.actions} names={names} name={name} horizon={plan.horizon} onMap={showOnMap} />
        <DeliverySection deliveries={plan.deliveries} names={names} name={name} onMap={showOnMap} />
        <ProcessingSection plan={plan.processing} machines={digest.machines} materials={plan.materials} seasonDays={daysLeft} horizon={settings.horizon} reserve={settings.reserve}
          names={names} name={name} onMap={showOnMap}
          onHorizon={(days) => changeSettings({ horizon: days })} onReserve={(reserve) => changeSettings({ reserve })}
          onChoice={(itemId, process) => changeSettings({ choices: { ...settings.choices, [itemId]: process } })} />
        <PlantingSection land={land} ideas={plan.planting} housing={plan.livestock.housing} animals={plan.livestock.ideas} daysLeft={daysLeft} names={names} name={name}
          onEditArea={() => { setHighlight(null); setMapOpen(true); }} />
      </>}

    <section id="daily-farm" className="daily-section" aria-labelledby="daily-farm-title">
      <header className="daily-section-head"><div><h2 id="daily-farm-title">{tr('农场概况')}</h2></div></header>
      <div className="daily-grid">
        {stopCauses.size > 0 && <Card title={stopCauses.size > 1 ? tr('换季和稻草人提醒') : stopCauses.has('season') ? tr('换季提醒') : tr('稻草人提醒')} tone="warning">
          {seasonEnd.witherTomorrow.length > 0 && <>
            <p className="daily-sub">{tr('今天不收就会枯萎')}</p>
            <ul className="daily-list">{seasonEnd.witherTomorrow.map((group) => cropRow(group, group.cause === 'season' ? tr('明天换季') : tr('稻草人明天失效'), `${group.cause}:${group.crop}`))}</ul>
          </>}
          {seasonEnd.lost.length > 0 && <>
            <p className="daily-sub">{tr('来不及成熟')}</p>
            <ul className="daily-list">{seasonEnd.lost.map((group) => cropRow(group, lostNote(group), `${group.cause}:${group.left}:${group.crop}`))}</ul>
          </>}
          <p className="daily-note">{tr('下一季不能生长的田间作物会在换季那天枯萎，长熟的毛豆会变成黄豆。稻草人能让周围 5×5 格里同季节的作物多长 28 天，失效时范围内过季的田间作物会枯萎。栽培包只在秋天生长。')}</p>
        </Card>}

        <Card title={tr('可收获的作物')}>
          {digest.harvest.length
            ? <ShortList rows={digest.harvest.map((group) => cropRow(group, harvestNote[group.kind], `${group.kind}:${group.crop}`))} />
            : <p className="daily-empty">{tr('今天没有成熟的作物。')}</p>}
        </Card>

        <Card title={tr('日常杂务')}>
          <ul className="daily-list">
            <li className="daily-row is-plain">
              <span className="daily-row-name">{chores.water.length ? tr('浇水') : tr('不用浇水')}<small>{chores.water.length ? tr('耕地和田垄上还没浇水的作物') : tr('没有等着浇水的作物')}</small></span>
              <b className="daily-count">{chores.water.length > 0 && tr('{count} 格', { count: chores.water.length })}</b>
              {chores.water.length > 0 && <button type="button" className="daily-map-button" aria-label={tr('在地图上标出{name}', { name: tr('要浇水的作物') })} onClick={() => showOnMap(tr('要浇水的作物'), chores.water)}>{tr('地图')}</button>}
            </li>
            {chores.spentScarecrows.length > 0 && <li className="daily-row is-plain">
              <span className="daily-row-name">{tr('拆掉失效的稻草人')}<small>{tr('28 天已经用完，用斧头可以拆掉')}</small></span>
              <b className="daily-count">{tr('{count} 个', { count: chores.spentScarecrows.length })}</b>
              <button type="button" className="daily-map-button" aria-label={tr('在地图上标出{name}', { name: tr('失效的稻草人') })} onClick={() => showOnMap(tr('失效的稻草人'), chores.spentScarecrows.flatMap((scarecrow) => scarecrow.cells))}>{tr('地图')}</button>
            </li>}
            {chores.hungry > 0 && <li className="daily-row is-plain"><span className="daily-row-name">{tr('喂动物')}<small>{tr('今天还没喂过')}</small></span><b className="daily-count">{tr('{count} 只', { count: chores.hungry })}</b></li>}
            {chores.shipping > 0 && <li className="daily-row is-plain"><span className="daily-row-name">{tr('出货箱')}<small>{tr('07:00 换日时结算')}</small></span><b className="daily-count">{tr('{count} 件', { count: chores.shipping })}</b></li>}
          </ul>
          {chores.withered.length > 0 && <>
            <p className="daily-sub">{tr('清理枯萎的作物')}</p>
            <ul className="daily-list">{chores.withered.map((group) => cropRow(group))}</ul>
          </>}
        </Card>

        <Card title={tr('未来 7 天')}>
          {digest.forecast.length ? <ul className="daily-list daily-days">{digest.forecast.map((day) => <li key={day.days}>
            <strong>{tr('{days} 天后', { days: day.days })}</strong>
            <span className="daily-chips">{day.groups.map((group) => {
              const crop = name.crop(group.crop);
              return <button type="button" className="daily-chip" key={group.crop} aria-label={tr('在地图上标出{name}', { name: crop })} onClick={() => showOnMap(tr('{days} 天后成熟：{name}', { days: day.days, name: crop }), group.cells)}>
                <SaveIcon names={names} kind="crops" value={String(group.crop)} size={24} />{crop}<b>{group.cells.length}</b>
              </button>;
            })}</span>
          </li>)}</ul> : <p className="daily-empty">{tr('7 天内没有作物成熟。')}</p>}
          <p className="daily-note">{tr('按每天都浇水计算：浇过水的作物每晚长一天。')}</p>
        </Card>

        <Card title={tr('农田')}>
          <dl className="daily-stats">
            <div><dt>{tr('农田范围')}</dt><dd>{land.area}</dd></div>
            <div><dt>{tr('已种下')}</dt><dd>{land.planted}</dd></div>
            <div><dt>{tr('已耕待种')}</dt><dd>{land.tilled}</dd></div>
            <div><dt>{tr('要重新翻耕')}</dt><dd>{land.plain}</dd></div>
            {land.wild > 0 && <div><dt>{tr('长了杂草或树')}</dt><dd>{land.wild}</dd></div>}
          </dl>
          {digest.scarecrows.length > 0 && <>
            <p className="daily-sub">{tr('稻草人')}</p>
            <ul className="daily-list">{digest.scarecrows.map((scarecrow) => {
              const item = name.item(scarecrow.itemId);
              return <li className="daily-row" key={scarecrow.key}>
                <SaveIcon names={names} kind="items" value={String(scarecrow.itemId)} size={32} />
                <span className="daily-row-name">{item}<small>{tr('范围内有 {count} 格{season}季作物', { count: scarecrow.crops, season: GAME_SEASONS[scarecrow.season] })}</small></span>
                <b className="daily-count">{scarecrow.daysLeft ? tr('还剩 {days} 天', { days: scarecrow.daysLeft }) : tr('最后一天')}</b>
                <button type="button" className="daily-map-button" aria-label={tr('在地图上标出{name}', { name: item })} onClick={() => showOnMap(item, scarecrow.cells)}>{tr('地图')}</button>
              </li>;
            })}</ul>
          </>}
          <p className="daily-note">{tr('空着的耕地和田垄每晚约有一半会变回平地，存档不会记住它们。这里会记住你的农田范围，每读一次存档就补上新耕的格子。')}</p>
          {storageFailed && <p className="daily-note is-error">{tr('浏览器没能保存农田范围，关闭页面后会丢失。')}</p>}
          <div className="daily-actions">
            <button type="button" aria-expanded={mapOpen} onClick={() => { setHighlight(null); setMapOpen((open) => !open); }}>{mapOpen ? tr('收起地图') : tr('在地图上编辑农田范围')}</button>
          </div>
        </Card>
      </div>
    </section>

    <div ref={mapAnchor} className="daily-map-anchor">
      {/* The placeholder is map-sized so the page can scroll the map into view before its code arrives. */}
      {mapOpen && <Suspense fallback={<p className="save-loading daily-map-placeholder" role="status">{tr('正在载入地图…')}</p>}>
        <FarmAreaMap doc={doc} area={area.include} highlight={highlight} onAdd={onAdd} onRemove={onRemove} onClearHighlight={() => setHighlight(null)} />
      </Suspense>}
    </div>
  </>;
}
