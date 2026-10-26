import type { DeliveryDigest, DeliveryPlan } from '../../domain/dailyDeliveries';
import type { DeliveryList } from '../../data/dailyPayload';
import { ITEM_RANKS } from '../../lib/saveRules';
import type { SaveNameTables } from '../../lib/saveNames';
import { GAME_SEASONS } from '../../lib/saveTime';
import SaveIcon from '../save/SaveIcon';
import { GrowList, Icon, ItemChip, MapButton, Meter, Section, sourceTarget, sourceText, Tabs, type MapTarget, type Names } from './dailyUi';
import { tr } from '../../i18n/active';

/** Every delivery list, split into tabs: hand in today, can be completed this season, still far off, and the items set aside. */
export default function DeliverySection({ deliveries, names, name, night, onMap }: {
  deliveries: DeliveryDigest;
  /** After midnight the village head's house is closed until the 07:00 turnover. */
  night: boolean;
  names: SaveNameTables;
  name: Names;
  onMap: (target: MapTarget) => void;
}) {
  const listName: Record<DeliveryList, string> = { repair: tr('修复祠堂'), shrine: tr('狐狸神社'), catalog: tr('村长家目录') };
  const quality = (rank: number) => rank > 0 ? tr('{rank}及以上', { rank: ITEM_RANKS.find((entry) => entry.value === rank)?.label ?? rank }) : '';
  const label = (itemId: number, rank: number) => [name.item(itemId), quality(rank)].filter(Boolean).join(' · ');
  const close = deliveries.pending.filter((plan) => !plan.offSeason);
  const far = deliveries.pending.filter((plan) => plan.offSeason);

  const where = ({ spec }: DeliveryPlan) => spec.list === 'repair' ? tr('第 {stage} 座', { stage: spec.stage! })
    : spec.list === 'shrine' && spec.season !== undefined ? tr('{season}季', { season: GAME_SEASONS[spec.season] }) : spec.place;
  const card = (plan: DeliveryPlan) => {
    const owed = plan.lines.filter((line) => line.have < line.remain);
    return <li key={plan.spec.id} className={`card daily-bundle is-${plan.spec.list}${plan.ready ? ' is-ready' : ''}`}>
      <header className="daily-bundle-head">
        <div className="daily-bundle-name">
          <span className="daily-list-tag">{listName[plan.spec.list]}<small>{where(plan)}</small></span>
          <h4>{plan.spec.name}</h4>
        </div>
        {plan.ready ? night && plan.spec.list === 'catalog'
          ? <span className="daily-badge"><Icon name="clock" size={14} />{tr('7:00 后能交')}</span>
          : <span className="daily-badge is-done"><Icon name="check" size={14} />{tr('可以交')}</span>
          : plan.eta !== undefined && <span className={`daily-badge${plan.eta ? '' : ' is-done'}`}><Icon name="clock" size={14} />{plan.eta ? tr('约 {days} 天后', { days: plan.eta }) : tr('今天能凑齐')}</span>}
      </header>
      {plan.ready ? <span className="daily-items">{plan.lines.map((line) => <ItemChip key={`${line.itemId}:${line.rank}`} names={names} itemId={line.itemId} label={label(line.itemId, line.rank)} count={`× ${line.remain}`} tone="done" />)}</span>
        : <ul className="daily-lines">{owed.map((line) => <li key={`${line.itemId}:${line.rank}`} className="daily-line">
          <SaveIcon names={names} kind="items" value={String(line.itemId)} size={28} />
          <span className="daily-line-name">{label(line.itemId, line.rank)}
            <small>{line.sources.length ? line.sources.map((source) => sourceText(source, name)).join(tr('；')) : tr('还没查到从哪里来')}</small>
          </span>
          <span className="daily-line-count"><span><b>{line.have}</b> / {line.remain}</span><Meter value={line.have} max={line.remain} tone="short" /></span>
          <MapButton target={sourceTarget(line.sources, name.item(line.itemId), name)} onMap={onMap} />
        </li>)}</ul>}
      {plan.spec.rewards.length > 0 && <footer className="daily-reward">{tr('奖励')}{plan.spec.rewards.map(([itemId, count]) => <ItemChip key={itemId} names={names} itemId={itemId} label={name.item(itemId)} count={count > 1 ? `× ${count}` : undefined} />)}</footer>}
    </li>;
  };
  const cards = (plans: DeliveryPlan[], empty: string, shown = 12) => plans.length
    ? <GrowList className="daily-masonry" items={plans.map(card)} shown={shown} />
    : <p className="daily-empty card">{empty}</p>;

  return <Section id="daily-deliveries" icon="deliver" title={tr('交付')}
    summary={<span className="daily-progress">
      <Meter value={deliveries.done} max={deliveries.total} tone="done" label={tr('已完成 {done} / {total} 项', { done: deliveries.done, total: deliveries.total })} />
      <span>{tr('已完成 {done} / {total} 项。背包和收纳箱里的物品先分给今天能交完的项目，剩下的留给还没凑齐的。', { done: deliveries.done, total: deliveries.total })}</span>
    </span>}>
    <Tabs label={tr('交付项目')} initial={deliveries.ready.length ? 'ready' : 'close'} tabs={[
      { id: 'ready', label: tr('今天可以交'), count: deliveries.ready.length, content: cards(deliveries.ready, tr('手上的物品还不够交完任何一项。')) },
      { id: 'close', label: tr('物品交付'), count: close.length, content: cards(close, tr('没有这季能凑齐的项目。')) },
      { id: 'far', label: tr('本季凑不齐'), count: far.length, content: cards(far, tr('所有项目这季都能凑齐。'), 9) },
      {
        id: 'keep', label: tr('留给交付的物品'), count: deliveries.keep.length, content: deliveries.keep.length ? <div className="card daily-keep">
          <p className="daily-note">{tr('这些物品已经分给还没凑齐的交付项目，加工安排不会用到它们。')}</p>
          <span className="daily-items">{deliveries.keep.map((row) => <ItemChip key={`${row.itemId}:${row.rank}`} names={names} itemId={row.itemId} label={label(row.itemId, row.rank)} count={`× ${row.count}`} />)}</span>
        </div> : <p className="daily-empty card">{tr('现在没有要留着的物品。')}</p>,
      },
    ]} />
    <p className="daily-note">{[
      !deliveries.catalogOpen && tr('村长家的交付目录还没开放，暂时不列。'),
      tr('修复祠堂一次只能做一座，这里只列当前这一座。狐狸神社其他季节的供奉也列在这里，但还没核实不在当季时能不能交。'),
    ].filter(Boolean).join(' ')}</p>
  </Section>;
}
