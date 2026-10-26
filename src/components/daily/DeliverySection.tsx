import type { DeliveryDigest, DeliveryPlan } from '../../domain/dailyDeliveries';
import type { DeliveryList } from '../../data/dailyPayload';
import { ITEM_RANKS } from '../../lib/saveRules';
import type { SaveNameTables } from '../../lib/saveNames';
import { ItemChip, Section, sourceCells, sourceText, type Names } from './dailyUi';
import { tr } from '../../i18n/active';

/** Every delivery list, sorted into what to hand in today, what is close, and what is far off. */
export default function DeliverySection({ deliveries, names, name, onMap }: {
  deliveries: DeliveryDigest;
  names: SaveNameTables;
  name: Names;
  onMap: (label: string, cells: number[]) => void;
}) {
  const lists: Array<[DeliveryList, string]> = [['repair', tr('修复祠堂')], ['shrine', tr('狐狸神社供奉')], ['catalog', tr('村长家交付目录')]];
  const quality = (rank: number) => rank > 0 ? tr('{rank}及以上', { rank: ITEM_RANKS.find((entry) => entry.value === rank)?.label ?? rank }) : '';
  const label = (itemId: number, rank: number) => [name.item(itemId), quality(rank)].filter(Boolean).join(' · ');
  const close = deliveries.pending.filter((plan) => plan.eta !== undefined);
  const far = deliveries.pending.filter((plan) => plan.eta === undefined);

  const head = (plan: DeliveryPlan) => <span className="daily-bundle-name">
    <strong>{plan.spec.name}</strong>
    <small>{plan.spec.list === 'repair' ? tr('修复祠堂 · 第 {stage} 座', { stage: plan.spec.stage! }) : plan.spec.place}</small>
  </span>;
  const rewards = (plan: DeliveryPlan) => plan.spec.rewards.length > 0 && <span className="daily-reward">
    {tr('奖励')}{plan.spec.rewards.map(([itemId, count]) => <ItemChip key={itemId} names={names} itemId={itemId} label={name.item(itemId)} count={count > 1 ? `× ${count}` : undefined} />)}
  </span>;
  const missing = (plan: DeliveryPlan) => <ul className="daily-missing">{plan.lines.filter((line) => line.have < line.remain).map((line) => {
    const cells = line.sources.flatMap(sourceCells);
    return <li key={`${line.itemId}:${line.rank}`}>
      <ItemChip names={names} itemId={line.itemId} label={label(line.itemId, line.rank)} count={`${line.have} / ${line.remain}`} tone="short" />
      <span className="daily-source">{line.sources.length ? line.sources.map((source) => sourceText(source, name)).join(tr('；')) : tr('来源还没整理')}</span>
      {cells.length > 0 && <button type="button" className="daily-map-button" aria-label={tr('在地图上标出{name}', { name: name.item(line.itemId) })} onClick={() => onMap(name.item(line.itemId), cells)}>{tr('地图')}</button>}
    </li>;
  })}</ul>;

  return <Section id="daily-deliveries" title={tr('交付')}
    summary={tr('已完成 {done} / {total} 项。背包和收纳箱里的物品先分给今天能交完的项目，剩下的留给还没凑齐的。', { done: deliveries.done, total: deliveries.total })}>
    <div className="daily-columns">
      <div className="card daily-card">
        <h3>{tr('今天可以交')}</h3>
        {deliveries.ready.length ? <ul className="daily-list">{deliveries.ready.map((plan) => <li key={plan.spec.id} className="daily-bundle">
          {head(plan)}
          <span className="daily-items">{plan.lines.map((line) => <ItemChip key={`${line.itemId}:${line.rank}`} names={names} itemId={line.itemId} label={label(line.itemId, line.rank)} count={`× ${line.remain}`} tone="done" />)}</span>
          {rewards(plan)}
        </li>)}</ul> : <p className="daily-empty">{tr('手上的物品还不够交完任何一项。')}</p>}
      </div>
      <div className="card daily-card">
        <h3>{tr('物品交付')}</h3>
        {close.length ? <ul className="daily-list">{close.map((plan) => <li key={plan.spec.id} className="daily-bundle">
          {head(plan)}
          <span className="pill">{plan.eta ? tr('约 {days} 天后', { days: plan.eta }) : tr('今天能凑齐')}</span>
          {missing(plan)}
          {rewards(plan)}
        </li>)}</ul> : <p className="daily-empty">{tr('没有这季能凑齐的项目。')}</p>}
      </div>
    </div>
    {far.length > 0 && <details className="daily-more daily-panel">
      <summary>{tr('本季凑不齐的项目（{count} 项）', { count: far.length })}</summary>
      {lists.map(([list, title]) => {
        const plans = far.filter((plan) => plan.spec.list === list);
        return plans.length > 0 && <div key={list}>
          <p className="daily-sub">{title}</p>
          <ul className="daily-list">{plans.map((plan) => <li key={plan.spec.id} className="daily-bundle">{head(plan)}{missing(plan)}</li>)}</ul>
        </div>;
      })}
    </details>}
    {deliveries.keep.length > 0 && <details className="daily-more daily-panel">
      <summary>{tr('留给交付的物品（{count} 种）', { count: deliveries.keep.length })}</summary>
      <p className="daily-note">{tr('这些物品已经分给还没凑齐的交付项目，加工安排不会用到它们。')}</p>
      <span className="daily-items">{deliveries.keep.map((row) => <ItemChip key={`${row.itemId}:${row.rank}`} names={names} itemId={row.itemId} label={label(row.itemId, row.rank)} count={`× ${row.count}`} />)}</span>
    </details>}
    <p className="daily-note">{[
      !deliveries.catalogOpen && tr('村长家的交付目录还没开放，暂时不列。'),
      tr('修复祠堂一次只能做一座，这里只列当前这一座。狐狸神社其他季节的供奉也列在这里，但还没核实不在当季时能不能交。'),
    ].filter(Boolean).join(' ')}</p>
  </Section>;
}
