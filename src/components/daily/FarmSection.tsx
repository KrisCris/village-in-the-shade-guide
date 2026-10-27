import type { CellGroup, DailyDigest, LandSummary, LostGroup } from '../../domain/dailyDigest';
import type { SaveNameTables } from '../../lib/saveNames';
import { GAME_SEASONS } from '../../lib/saveTime';
import SaveIcon from '../save/SaveIcon';
import { Card, GrowList, Icon, MapButton, type MapTarget, type Names } from './dailyUi';
import { tr } from '../../i18n/active';

/** What the save shows about the field today: crops at risk, the harvest, chores, the next week and the farm area. */
export default function FarmSection({ digest, land, names, name, storageFailed, onMap, onEditArea }: {
  digest: DailyDigest;
  land: LandSummary;
  names: SaveNameTables;
  name: Names;
  storageFailed: boolean;
  onMap: (target: MapTarget) => void;
  onEditArea: () => void;
}) {
  const { chores, seasonEnd } = digest;
  const stopCauses = new Set([...seasonEnd.witherTomorrow, ...seasonEnd.lost].map((group) => group.cause));
  const cropRow = (group: CellGroup, note?: string, key = String(group.crop)) => {
    const crop = name.crop(group.crop);
    return <li className="daily-row" key={key}>
      <SaveIcon names={names} kind="crops" value={String(group.crop)} size={32} />
      <span className="daily-row-name">{crop}{note && <small>{note}</small>}</span>
      <b className="daily-count">{tr('{count} 格', { count: group.cells.length })}</b>
      <MapButton target={{ label: note ? `${crop} · ${note}` : crop, cells: group.cells }} onMap={onMap} />
    </li>;
  };
  const harvestNote = { ripe: undefined, withered: tr('已枯萎，仍可收获'), shake: tr('摇树收果') };
  const lostNote = ({ cause, days, left }: LostGroup) => cause === 'season'
    ? left ? tr('还要 {days} 天，本季只剩 {left} 天', { days, left }) : tr('还要 {days} 天，明天就换季', { days })
    : left ? tr('还要 {days} 天，稻草人只剩 {left} 天', { days, left }) : tr('还要 {days} 天，稻草人明天失效', { days });
  const harvestCells = digest.harvest.reduce((sum, group) => sum + group.cells.length, 0);

  return <section id="daily-farm" className="daily-section" aria-labelledby="daily-farm-title">
    <header className="daily-section-head">
      <span className="daily-section-icon"><Icon name="farm" size={22} /></span>
      <div className="daily-section-title">
        <h2 id="daily-farm-title">{tr('农场概况')}</h2>
        <div className="daily-section-summary">{tr('田里的作物、杂务和接下来一周的收成。')}</div>
      </div>
    </header>
    <div className="daily-masonry">
      {stopCauses.size > 0 && <Card title={stopCauses.size > 1 ? tr('换季和稻草人提醒') : stopCauses.has('season') ? tr('换季提醒') : tr('稻草人提醒')} tone="warning"
        badge={<span className="daily-badge is-short"><Icon name="alert" size={14} />{tr('{count} 格', { count: [...seasonEnd.witherTomorrow, ...seasonEnd.lost].reduce((sum, group) => sum + group.cells.length, 0) })}</span>}>
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

      <Card title={tr('可收获的作物')} badge={harvestCells > 0 && <span className="daily-badge is-done">{tr('{count} 格', { count: harvestCells })}</span>}>
        {digest.harvest.length
          ? <GrowList className="daily-list" items={digest.harvest.map((group) => cropRow(group, harvestNote[group.kind], `${group.kind}:${group.crop}`))} shown={6} />
          : <p className="daily-empty">{tr('今天没有成熟的作物。')}</p>}
      </Card>

      <Card title={tr('日常杂务')}>
        <ul className="daily-list">
          <li className="daily-row is-plain">
            <span className="daily-row-name">{chores.water.length ? tr('浇水') : tr('不用浇水')}<small>{chores.water.length ? tr('耕地和田垄上还没浇水的作物') : tr('没有等着浇水的作物')}</small></span>
            <b className="daily-count">{chores.water.length > 0 && tr('{count} 格', { count: chores.water.length })}</b>
            <MapButton target={{ label: tr('要浇水的作物'), cells: chores.water }} onMap={onMap} />
          </li>
          {chores.spentScarecrows.length > 0 && <li className="daily-row is-plain">
            <span className="daily-row-name">{tr('拆掉失效的稻草人')}<small>{tr('28 天已经用完，用斧头可以拆掉')}</small></span>
            <b className="daily-count">{tr('{count} 个', { count: chores.spentScarecrows.length })}</b>
            <MapButton target={{ label: tr('失效的稻草人'), cells: chores.spentScarecrows.flatMap((scarecrow) => scarecrow.cells) }} onMap={onMap} />
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
        {digest.forecast.length ? <ol className="daily-days">{digest.forecast.map((day) => <li key={day.days}>
          <strong>{tr('{days} 天后', { days: day.days })}</strong>
          <span className="daily-chips">{day.groups.map((group) => {
            const crop = name.crop(group.crop);
            return <button type="button" className="daily-chip" key={group.crop} aria-label={tr('在地图上标出{name}', { name: crop })}
              onClick={() => onMap({ label: tr('{days} 天后成熟：{name}', { days: day.days, name: crop }), cells: group.cells })}>
              <SaveIcon names={names} kind="crops" value={String(group.crop)} size={24} />{crop}<b>{group.cells.length}</b>
            </button>;
          })}</span>
        </li>)}</ol> : <p className="daily-empty">{tr('7 天内没有作物成熟。')}</p>}
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
              <MapButton target={{ label: item, cells: scarecrow.cells }} onMap={onMap} />
            </li>;
          })}</ul>
        </>}
        <p className="daily-note">{tr('空着的耕地和田垄每晚约有一半会变回平地，存档不会记住它们。这里会记住你的农田范围，每读一次存档就补上新耕的格子。')}</p>
        {storageFailed && <p className="daily-note is-error">{tr('浏览器没能保存农田范围，关闭页面后会丢失。')}</p>}
        <div className="daily-actions"><button type="button" onClick={onEditArea}>{tr('在地图上编辑农田范围')}</button></div>
      </Card>
    </div>
  </section>;
}
