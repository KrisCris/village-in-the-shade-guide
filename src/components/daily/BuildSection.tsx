import { BUILD_DAYS, type BuildLine, type BuildOption } from '../../domain/dailyProcessing';
import type { ItemSource } from '../../domain/dailySources';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveIcon from '../save/SaveIcon';
import { ItemChip, MapButton, Section, sourceTarget, sourceText, type MapTarget, type Names } from './dailyUi';
import { tr } from '../../i18n/active';

/** Machines whose queue runs past a week: what one more costs, how many the stock covers and what it adds. */
export default function BuildSection({ lines, sources, names, name, onMap }: {
  lines: BuildLine[];
  /** Where to get the materials that are short or run out first. */
  sources: ReadonlyMap<number, ItemSource[]>;
  names: SaveNameTables;
  name: Names;
  onMap: (target: MapTarget) => void;
}) {
  const money = (value: number) => name.number(Math.round(value));

  const option = (line: BuildLine, entry: BuildOption) => {
    const machine = name.item(entry.machine), each = entry.slots * line.perSlot;
    // Materials that are short for one, or the one that runs out first.
    const watch = entry.inputs.filter((input) => input.held < input.count || input.itemId === entry.limit);
    return <div key={`${entry.machine}-${entry.upgrade}`} className="daily-build-option">
      <p className="daily-build-title">
        <strong>{entry.upgrade ? tr('升级成{machine}', { machine }) : tr('新造{machine}', { machine })}</strong>
        <span>{entry.upgrade ? tr('每台多 {slots} 个槽位，每天约多赚 {money}', { slots: entry.slots, money: money(each) })
          : tr('每台 {slots} 个槽位，每天约多赚 {money}', { slots: entry.slots, money: money(each) })}</span>
        {entry.via && <span>{tr('材料包括先造的那台{basic}，造好后直接升级，不用摆出来。占地和一台{basic}一样。', { basic: name.item(entry.via) })}</span>}
      </p>
      <span className="daily-items">{entry.inputs.map((input) => <ItemChip key={input.itemId} names={names} itemId={input.itemId} tone={input.held < input.count ? 'short' : undefined}
        label={tr('{item} × {count}', { item: name.item(input.itemId), count: input.count })} count={tr('有 {count}', { count: input.held })} />)}</span>
      <p className={`daily-build-afford${entry.afford ? '' : ' is-short'}`}>{!entry.afford ? tr('材料还不够造一台。')
        : entry.upgrade && entry.afford === entry.basics && !entry.limit ? tr('{count} 台{machine}都能升级，升级完每天约多赚 {money}。', { count: entry.afford, machine: name.item(line.machine), money: money(entry.afford * each) })
        : entry.upgrade ? tr('现在的材料够升级 {count} 台（还有 {basics} 台没升级），升级完每天约多赚 {money}。', { count: entry.afford, basics: entry.basics ?? 0, money: money(entry.afford * each) })
        : tr('现在的材料够造 {count} 台，造完每天约多赚 {money}。', { count: entry.afford, money: money(entry.afford * each) })}</p>
      {watch.map((input) => {
        const found = sources.get(input.itemId) ?? [], item = name.item(input.itemId);
        if (!found.length) return null;
        return <p key={input.itemId} className="daily-source">
          <span>{input.held < input.count ? tr('{item}还差 {count} 个。', { item, count: input.count - input.held }) : tr('{item}会最先用完。', { item })}{found.map((source) => sourceText(source, name)).join(tr('；'))}</span>
          <MapButton target={sourceTarget(found, item, name)} onMap={onMap} />
        </p>;
      })}
    </div>;
  };

  const card = (line: BuildLine) => {
    const shown = line.waiting.slice(0, 4);
    return <li key={line.family} className="card daily-build">
      <header className="daily-machine-head">
        <SaveIcon names={names} kind="items" value={String(line.machine)} size={40} />
        <span className="daily-row-name">{name.item(line.machine)}
          <small>{line.machines ? tr('{machines} 台 · {slots} 个槽位', { machines: line.machines, slots: line.slots }) : tr('农场里还没有')}</small>
        </span>
        {line.machines > 0 && <span className="daily-badge is-short">{tr('要排 {days} 天', { days: Math.ceil(line.days) })}</span>}
      </header>
      <div className="daily-build-why">
        <p>{line.machines ? tr('仓库里等着放进来的：') : tr('仓库里这些原料用它加工最值钱：')}</p>
        <span className="daily-items">
          {shown.map((entry) => <ItemChip key={entry.itemId} names={names} itemId={entry.itemId} label={name.item(entry.itemId)} count={entry.count} />)}
          {line.waiting.length > shown.length && <span className="daily-build-more">{tr('等 {count} 种', { count: line.waiting.length })}</span>}
        </span>
        <p>{tr('每多 1 个槽位，每天约多赚 {money}。', { money: money(line.perSlot) })}</p>
      </div>
      {line.stored > 0 && <p className="daily-banner is-info">{tr('仓库里还有 {count} 台没放出来，先把它们摆到农场上。', { count: line.stored })}</p>}
      {line.locked ? <p className="daily-build-afford is-short">{line.locked.skill
        ? tr('还没学会做{machine}，要先学祠堂能力「{skill}」。', { machine: name.item(line.machine), skill: line.locked.skill })
        : tr('还没学会做{machine}。', { machine: name.item(line.machine) })}</p>
        : line.options.map((entry) => option(line, entry))}
    </li>;
  };

  return <Section id="daily-build" icon="build" title={tr('加造设备')}
    summary={lines.length ? tr('按现在的数量，这些设备要 {days} 天以上才做得完仓库里的原料。多造几台，原料就能早点做完卖钱。', { days: BUILD_DAYS })
      : tr('现有设备够用：仓库里的原料 {days} 天内都能做完。', { days: BUILD_DAYS })}>
    {lines.length > 0 && <ul className="daily-build-grid">{lines.map(card)}</ul>}
  </Section>;
}
