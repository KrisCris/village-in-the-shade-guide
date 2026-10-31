import { COLLECT_ORDER, type CollectLine, type CollectNeed, type CollectPlan, type SpotCatch, type SpotPlan } from '../../domain/dailyCollect';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveIcon from '../save/SaveIcon';
import { Card, GrowList, MapButton, Section, sourceTarget, sourceText, type MapTarget, type Names } from './dailyUi';
import { pageHref, tr } from '../../i18n/active';

/** ITEM_ID_SPRINKLING_BAIT_WHITE: about 3% white rare fish instead of 1%. */
const WHITE_BAIT = 40020;
/** fishing.dat time ranges of the FISH_PERIODS; 6:00–7:00 is in none of them. */
const PERIOD_HOURS: Array<[from: number, to: number]> = [[7, 12], [12, 18], [18, 24], [0, 6]];

const percent = (value: number) => value >= .1 ? `${Math.round(value * 100)}%` : `${(value * 100).toFixed(1)}%`;

/** Fish to catch at each spot in the periods left today, then the plants, saps, quarry drops and products to get, all limited to what the encyclopedia lacks or deliveries still need. */
export default function CollectSection({ plan, names, name, onMap }: {
  plan: CollectPlan;
  names: SaveNameTables;
  name: Names;
  onMap: (target: MapTarget) => void;
}) {
  const fish = new Set(plan.spots.flatMap((spot) => spot.catches.map((entry) => entry.itemId)));
  const total = fish.size + plan.lines.length;
  const why = (entry: CollectNeed) => [entry.missing && tr('图鉴未登记'), entry.short > 0 && tr('交付还差 {count} 个', { count: entry.short })].filter(Boolean).join(' · ');

  // Neighbouring periods with the same odds read as one time range.
  const odds = (entry: SpotCatch) => {
    const runs: Array<{ from: number; to: number; text: string }> = [];
    plan.periods.forEach((period, index) => {
      const value = entry.odds[index];
      if (!value) return;
      const text = percent(value), last = runs.at(-1), [from, to] = PERIOD_HOURS[period];
      if (last && last.text === text && last.to === from) last.to = to;
      else runs.push({ from, to, text });
    });
    return runs.map((run) => <span key={run.from} className="daily-odd"><b>{tr('{from}–{to} 时', { from: run.from, to: run.to })}</b>{run.text}</span>);
  };
  const spotCard = (spot: SpotPlan) => <li key={spot.id} className="card daily-spot">
    <header className="daily-card-head"><h4>{spot.name}</h4><span className="daily-badge">{tr('{count} 种', { count: spot.catches.length })}</span></header>
    <ul className="daily-list">{spot.catches.map((entry) => <li key={entry.itemId} className="daily-row daily-catch">
      <SaveIcon names={names} kind="items" value={String(entry.itemId)} size={32} />
      <span className="daily-row-name">{name.item(entry.itemId)}<small className={entry.short > 0 ? 'is-short' : undefined}>{why(entry)}</small></span>
      <span className="daily-odds">{odds(entry)}</span>
    </li>)}</ul>
  </li>;

  const row = (line: CollectLine) => {
    const item = name.item(line.itemId);
    return <li key={line.itemId} className="daily-row daily-collect-row">
      <SaveIcon names={names} kind="items" value={String(line.itemId)} size={32} />
      <span className="daily-row-name">{item}<small className={line.short > 0 ? 'is-short' : undefined}>{why(line)}</small>
        {line.source.kind !== 'wild' && <small>{sourceText(line.source, name)}</small>}</span>
      <MapButton target={sourceTarget([line.source], item, name)} onMap={onMap} />
    </li>;
  };
  const titles: Record<CollectLine['source']['kind'], string> = { wild: tr('野外采集'), sap: tr('树液'), quarry: tr('采石场'), machine: tr('用现有设备加工') };
  const notes: Partial<Record<CollectLine['source']['kind'], string>> = {
    wild: tr('这些山菜和虫子这季会在野外长出来，具体位置还没查到。'),
    machine: tr('只列农场里有设备、库存原料够做一份的产品；交付要用的原料不算在内。'),
  };
  const groups = COLLECT_ORDER.map((kind) => ({ kind, lines: plan.lines.filter((line) => line.source.kind === kind) })).filter((group) => group.lines.length);
  const night = plan.periods.length === 1;

  return <Section id="daily-collect" icon="book" title={tr('今日可收集')}
    summary={total ? tr('图鉴里还没有或交付还缺、今天拿得到的有 {count} 种。', { count: total }) : tr('今天拿得到的东西都已登记，交付也不缺。')}>
    {plan.spots.length > 0 && <>
      <h3 className="daily-sub-head">{tr('钓鱼')}</h3>
      <ul className="daily-spot-grid">{plan.spots.map(spotCard)}</ul>
      <p className="daily-note">
        {tr('百分比是不用鱼饵时每次上钩钓到该鱼的机会，只列今天还没过去的时段。白色稀有鱼约 1%，用{bait}约 3%。', { bait: name.item(WHITE_BAIT) })}
        {night && ` ${tr('现在是午夜后，只列深夜时段；白天的鱼等 7:00 换日后再看。')}`}
        {' '}<a href={pageHref('/guides/fishing-spots/')}>{tr('钓点指南')}</a>
      </p>
    </>}
    {groups.length > 0 && <div className="daily-collect-grid">{groups.map(({ kind, lines }) => <Card key={kind} title={titles[kind]}
      badge={<span className="daily-badge">{tr('{count} 种', { count: lines.length })}</span>}>
      <GrowList className="daily-list" items={lines.map(row)} shown={6} />
      {notes[kind] && <p className="daily-note">{notes[kind]}</p>}
    </Card>)}</div>}
  </Section>;
}
