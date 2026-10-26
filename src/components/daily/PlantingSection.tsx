import type { LandSummary } from '../../domain/dailyDigest';
import type { AnimalIdea, HousingLine } from '../../domain/dailyLivestock';
import type { PlantingIdea } from '../../domain/dailyPlanting';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveIcon from '../save/SaveIcon';
import { ItemChip, Section, ShortList, type Names } from './dailyUi';
import { pageHref, tr } from '../../i18n/active';

/** Seeds for the empty part of the farm area, and animal housing against what deliveries need. */
export default function PlantingSection({ land, ideas, housing, animals, daysLeft, names, name, onEditArea }: {
  land: LandSummary;
  ideas: PlantingIdea[];
  housing: HousingLine[];
  animals: AnimalIdea[];
  daysLeft: number;
  names: SaveNameTables;
  name: Names;
  onEditArea: () => void;
}) {
  const vacant = land.tilled + land.plain;
  const money = (value: number) => name.number(Math.round(value));
  const houseName = (type: number) => [tr('畜舍'), tr('禽舍'), tr('马棚')][type] ?? tr('畜舍');

  const ideaRows = ideas.map((idea) => {
    const crop = idea.crop.name.zh_hans, best = idea.best;
    const seed = idea.seed.held ? tr('手上有 {count} 个种子', { count: idea.seed.held })
      : tr('种子每个 {price}，{places}有卖', { price: Number(idea.seed.item.buy_price ?? 0), places: idea.seed.places.join(tr('、')) || tr('商店') });
    return <li key={idea.crop.id} className="daily-row daily-idea">
      <SaveIcon names={names} kind="crops" value={String(idea.crop.numeric_id)} size={32} />
      <span className="daily-row-name">{crop}
        <small>{[tr('{days} 天成熟', { days: Number(idea.crop.growth_days) }), tr('本季收 {count} 次', { count: idea.harvests }), seed].join(' · ')}</small>
        <small>{best.process
          ? tr('做成{output}每格约赚 {net}，直接卖约 {direct}', { output: best.output.name.zh_hans, net: money(best.net), direct: money(idea.direct?.net ?? 0) })
          : tr('直接卖每格约赚 {net}', { net: money(best.net) })}</small>
      </span>
      {idea.needed > 0 && <span className="pill">{tr('交付还差 {count}', { count: idea.needed })}</span>}
    </li>;
  });

  return <Section id="daily-land" title={tr('空地和家畜')}
    summary={land.area ? tr('农田范围 {area} 格，空着 {vacant} 格（其中 {plain} 格要重新翻耕）。', { area: land.area, vacant, plain: land.plain }) : tr('还没有农田范围。读取存档时会自动加入耕过的格子，也可以在地图上圈。')}>
    <div className="daily-columns">
      <div className="card daily-card">
        <h3>{tr('空地种植')}</h3>
        {!vacant ? <p className="daily-empty">{tr('农田范围里没有空地。')}</p>
          : !daysLeft ? <p className="daily-empty">{tr('明天就换季，今天种下的作物来不及成熟。')}</p>
          : ideaRows.length ? <ShortList rows={ideaRows} shown={5} />
          : <p className="daily-empty">{tr('这季剩下的天数里，没有买得到种子又能成熟的作物。')}</p>}
        <p className="daily-note">{tr('只列这季能长、来得及成熟、种子在手上或商店有卖的作物。交付还差的排在前面，其余按每格赚的钱排。加工收益只算农场里已有、而且还有空闲的设备。')}</p>
        <div className="daily-actions"><button type="button" onClick={onEditArea}>{tr('在地图上编辑农田范围')}</button></div>
      </div>
      <div className="card daily-card">
        <h3>{tr('家畜')}</h3>
        {housing.length ? <dl className="daily-stats">{housing.map((line) => <div key={line.type}>
          <dt>{line.houses > 1 ? tr('{house}（{count} 座）', { house: houseName(line.type), count: line.houses }) : houseName(line.type)}</dt>
          <dd>{line.used} / {line.slots}</dd>
        </div>)}</dl> : <p className="daily-empty">{tr('还没有畜舍或禽舍。')}</p>}
        {animals.length > 0 && <>
          <p className="daily-sub">{tr('交付要的畜产品，农场里还没有能产的动物')}</p>
          <ul className="daily-list">{[...new Set(animals.map((idea) => idea.house))].map((type) => {
            const group = animals.filter((idea) => idea.house === type), [{ housed, room }] = group, order = group.find((idea) => idea.order)?.order;
            return <li key={type} className="daily-bundle">
              <span className="daily-bundle-name"><strong>{houseName(type)}</strong>
                <small>{!housed ? tr('还没有{house}', { house: houseName(type) }) : room > 0 ? tr('还有 {count} 个空位', { count: room }) : tr('已经住满')}</small>
              </span>
              <span className="daily-items">{group.flatMap((idea) => idea.items.map((itemId) => <ItemChip key={`${idea.species}:${itemId}`} names={names} itemId={itemId} label={tr('{animal}产的{item}', { animal: name.animal(idea.species), item: name.item(itemId) })} />))}</span>
              {order && <div className="daily-order">
                <p>{order.locked ? tr('第一座畜舍建好、收到木助的信后，才能在树木建设订「{name}」（{slots} 个位置）', { name: order.name, slots: order.slots })
                  : order.from ? tr('在树木建设改建成「{name}」，位置从 {from} 个变成 {slots} 个', { name: order.name, from: order.from, slots: order.slots })
                  : tr('在树木建设新建「{name}」（{slots} 个位置）', { name: order.name, slots: order.slots })}</p>
                <span className="daily-items">
                  {order.inputs.map(([itemId, count]) => <ItemChip key={itemId} names={names} itemId={itemId} label={name.item(itemId)} count={`× ${count}`} />)}
                  <span className="daily-item is-money">{tr('金钱 {money}', { money: name.number(order.money) })}</span>
                </span>
              </div>}
            </li>;
          })}</ul>
        </>}
        <p className="daily-note">{tr('家畜每天产多少还没有核实，这里不估算收益。')} <a href={pageHref('/guides/livestock-plan/')}>{tr('各种家畜什么时候能买')}</a> · <a href={pageHref('/guides/buildings/')}>{tr('畜舍和鸡舍的建造费用')}</a></p>
      </div>
    </div>
  </Section>;
}
