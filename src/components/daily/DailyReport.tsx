import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildDailyDigest, landSummary, type CellGroup, type DeliveryLine, type LostGroup } from '../../domain/dailyDigest';
import { DAILY_CROPS, gameDate, type DailySnapshot } from '../../lib/saveDaily';
import { UNLOCKS } from '../../lib/saveDeliveries';
import { ITEM_RANKS } from '../../lib/saveRules';
import { GAME_SEASONS } from '../../lib/saveTime';
import { lookupName, type SaveNameTables } from '../../lib/saveNames';
import type { SerDocument } from '../../lib/ser';
import type { FarmArea } from '../../lib/farmArea';
import SaveIcon from '../save/SaveIcon';
import type { MapHighlight } from './FarmAreaMap';
import { activeLocale, tr } from '../../i18n/active';

const FarmAreaMap = lazy(() => import('./FarmAreaMap'));
const DAY = 86_400;
const SHOWN = 5;

const clock = (hour: number, minute: number) => `${hour}:${String(minute).padStart(2, '0')}`;

function finishLabel(finish: number, now: number): string {
  const days = Math.floor(finish / DAY) - Math.floor(now / DAY), date = gameDate(finish);
  if (days <= 0) return tr('今天 {time}', { time: clock(date.hour, date.minute) });
  if (days === 1) return tr('明天 {time}', { time: clock(date.hour, date.minute) });
  return tr('{days} 天后', { days });
}

/** Long lists show their first rows and fold the rest away. */
function ShortList({ rows }: { rows: ReactNode[] }) {
  return <>
    <ul className="daily-list">{rows.slice(0, SHOWN)}</ul>
    {rows.length > SHOWN && <details className="daily-more">
      <summary>{tr('其余 {count} 项', { count: rows.length - SHOWN })}</summary>
      <ul className="daily-list">{rows.slice(SHOWN)}</ul>
    </details>}
  </>;
}

function Card({ title, tone, children }: { title: string; tone?: 'warning'; children: ReactNode }) {
  return <section className={`card daily-card${tone ? ` is-${tone}` : ''}`} aria-label={title}><h3>{title}</h3>{children}</section>;
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
  const [mapOpen, setMapOpen] = useState(false), [highlight, setHighlight] = useState<MapHighlight | null>(null);
  const mapAnchor = useRef<HTMLDivElement>(null);
  useEffect(() => { if (mapOpen) mapAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [mapOpen, highlight]);

  const cropName = (id: number) => lookupName(names, 'crops', String(id)) ?? tr('作物 {id}', { id });
  const itemName = (id: number) => lookupName(names, 'items', String(id)) ?? `#${id}`;
  const showOnMap = (label: string, cells: number[]) => { setHighlight({ label, cells }); setMapOpen(true); };
  const money = new Intl.NumberFormat(activeLocale()).format(snapshot.money);
  const weather = lookupName(names, 'weather', String(snapshot.weather));
  const { date, chores, machines, deliveries, seasonEnd } = digest;
  const stopCauses = new Set([...seasonEnd.witherTomorrow, ...seasonEnd.lost].map((group) => group.cause));

  const cropRow = (group: CellGroup, note?: string, key = String(group.crop)) => {
    const name = cropName(group.crop);
    return <li className="daily-row" key={key}>
      <SaveIcon names={names} kind="crops" value={String(group.crop)} size={32} />
      <span className="daily-row-name">{name}{note && <small>{note}</small>}</span>
      <b className="daily-count">{tr('{count} 格', { count: group.cells.length })}</b>
      <button type="button" className="daily-map-button" aria-label={tr('在地图上标出{name}', { name })} onClick={() => showOnMap(note ? `${name} · ${note}` : name, group.cells)}>{tr('地图')}</button>
    </li>;
  };
  const itemRow = (key: string, itemId: number, count: ReactNode, note?: ReactNode) => <li className="daily-row" key={key}>
    <SaveIcon names={names} kind="items" value={String(itemId)} size={32} />
    <span className="daily-row-name">{itemName(itemId)}{note && <small>{note}</small>}</span>
    <b className="daily-count">{count}</b>
  </li>;
  const quality = (rank: number) => rank > 0 ? tr('{rank}及以上', { rank: ITEM_RANKS.find((entry) => entry.value === rank)?.label ?? rank }) : '';
  const bundleName = (id: number) => UNLOCKS.bundles.find((bundle) => bundle.id === id)?.name ?? '';
  const deliveryRow = (line: DeliveryLine) => itemRow(`${line.bundleId}:${line.index}`, line.itemId,
    `${line.have} / ${line.remain}`, [bundleName(line.bundleId), quality(line.rank)].filter(Boolean).join(' · '));
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

      <Card title={tr('现在可以收获')}>
        {digest.harvest.length
          ? <ShortList rows={digest.harvest.map((group) => cropRow(group, harvestNote[group.kind], `${group.kind}:${group.crop}`))} />
          : <p className="daily-empty">{tr('今天没有成熟的作物。')}</p>}
      </Card>

      <Card title={tr('今天的杂务')}>
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

      <Card title={tr('加工设备')}>
        {machines.done.length > 0 && <>
          <p className="daily-sub">{tr('已经做好，可以取出')}</p>
          <ul className="daily-list">{machines.done.map((row) => itemRow(`done:${row.itemId}`, row.itemId, `× ${row.count}`, row.slots > 1 ? tr('{count} 个槽位', { count: row.slots }) : undefined))}</ul>
        </>}
        {machines.idle.length > 0 && <>
          <p className="daily-sub">{tr('空着的设备')}</p>
          <ShortList rows={machines.idle.map((row) => itemRow(`idle:${row.itemId}`, row.itemId, tr('{count} 台', { count: row.machines })))} />
        </>}
        {machines.running.length > 0 && <details className="daily-more">
          <summary>{tr('加工中（{count} 种）', { count: machines.running.length })}</summary>
          <ul className="daily-list">{machines.running.map((row) => itemRow(`run:${row.itemId}`, row.itemId, `× ${row.count}`, tr('最早 {time} 完成', { time: finishLabel(row.finish!, snapshot.seconds) })))}</ul>
        </details>}
        {machines.freeSlots > 0 && <p className="daily-note">{tr('正在工作的设备里还有 {count} 个空槽位。', { count: machines.freeSlots })}</p>}
        {!machines.done.length && !machines.idle.length && !machines.running.length && <p className="daily-empty">{tr('存档里没有加工设备。')}</p>}
      </Card>

      <Card title={tr('交付委托')}>
        {!deliveries.open ? <p className="daily-empty">{tr('村长家的交付目录还没开放。')}</p> : <>
          <p className="daily-sub">{deliveries.ready.length ? tr('背包和收纳箱里的物品现在就够交') : tr('手上的物品还不够交任何一项')}</p>
          {deliveries.ready.length > 0 && <ShortList rows={deliveries.ready.map(deliveryRow)} />}
          {deliveries.missing.length > 0 && <details className="daily-more">
            <summary>{tr('还差的材料（{count} 项）', { count: deliveries.missing.length })}</summary>
            <ul className="daily-list">{deliveries.missing.map(deliveryRow)}</ul>
          </details>}
          <p className="daily-note">{tr('数字是“持有 / 还需”。较高品质的物品也算在内。')}</p>
        </>}
      </Card>

      <Card title={tr('未来 7 天')}>
        {digest.forecast.length ? <ul className="daily-list daily-days">{digest.forecast.map((day) => <li key={day.days}>
          <strong>{tr('{days} 天后', { days: day.days })}</strong>
          <span className="daily-chips">{day.groups.map((group) => {
            const name = cropName(group.crop);
            return <button type="button" className="daily-chip" key={group.crop} aria-label={tr('在地图上标出{name}', { name })} onClick={() => showOnMap(tr('{days} 天后成熟：{name}', { days: day.days, name }), group.cells)}>
              <SaveIcon names={names} kind="crops" value={String(group.crop)} size={24} />{name}<b>{group.cells.length}</b>
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
            const name = itemName(scarecrow.itemId);
            return <li className="daily-row" key={scarecrow.key}>
              <SaveIcon names={names} kind="items" value={String(scarecrow.itemId)} size={32} />
              <span className="daily-row-name">{name}<small>{tr('范围内有 {count} 格{season}季作物', { count: scarecrow.crops, season: GAME_SEASONS[scarecrow.season] })}</small></span>
              <b className="daily-count">{scarecrow.daysLeft ? tr('还剩 {days} 天', { days: scarecrow.daysLeft }) : tr('最后一天')}</b>
              <button type="button" className="daily-map-button" aria-label={tr('在地图上标出{name}', { name })} onClick={() => showOnMap(name, scarecrow.cells)}>{tr('地图')}</button>
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

    <div ref={mapAnchor} className="daily-map-anchor">
      {/* The placeholder is map-sized so the page can scroll the map into view before its code arrives. */}
      {mapOpen && <Suspense fallback={<p className="save-loading daily-map-placeholder" role="status">{tr('正在载入地图…')}</p>}>
        <FarmAreaMap doc={doc} area={area.include} highlight={highlight} onAdd={onAdd} onRemove={onRemove} onClearHighlight={() => setHighlight(null)} />
      </Suspense>}
    </div>
  </>;
}
