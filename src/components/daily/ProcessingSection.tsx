import { NOT_PROCESSED, optionGain, type FillLine, type MachineDay, type ProcessingPlan, type ProduceLine, type ProduceOption } from '../../domain/dailyProcessing';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveIcon from '../save/SaveIcon';
import SearchableSelect from '../controls/SearchableSelect';
import { finishTime, GrowList, Icon, ItemChip, Section, type Names } from './dailyUi';
import { tr } from '../../i18n/active';

/** What to load into each machine today, what it sells for, and which machine each kind of produce goes to. */
export default function ProcessingSection({ plan, now, names, name, onChoice }: {
  plan: ProcessingPlan;
  /** The save's game clock, in seconds. */
  now: number;
  names: SaveNameTables;
  name: Names;
  /** `undefined` hands the item back to the plan's own choice. */
  onChoice: (itemId: number, process: number | undefined) => void;
}) {
  const money = (value: number) => name.number(Math.round(value));
  const opened = (machine: MachineDay) => machine.free + machine.later.reduce((sum, entry) => sum + entry.slots, 0);
  // Every slot that opens today already has something to take.
  const full = (machine: MachineDay) => opened(machine) <= sum(machine.fill, (entry) => entry.batches);
  const machineOf = new Map(plan.machines.map((machine) => [machine.family, machine]));
  const lineOf = new Map(plan.produce.map((line) => [line.itemId, line]));
  // What a batch sells for once made, and what the same items fetch raw.
  const sold = (entry: FillLine) => entry.count * entry.option.value;
  const raw = (entry: FillLine) => entry.count * lineOf.get(entry.itemId)!.rawPrice;
  const sum = (entries: FillLine[], value: (entry: FillLine) => number) => entries.reduce((total, entry) => total + value(entry), 0);
  const loading = plan.machines.filter((machine) => machine.fill.length);
  const empty = plan.machines.filter((machine) => !machine.fill.length && opened(machine));
  const busy = plan.machines.filter((machine) => !opened(machine));
  const ready = plan.machines.reduce((total, machine) => total + machine.ready, 0);
  const fills = loading.flatMap((machine) => machine.fill);
  const slots = sum(fills, (entry) => entry.batches);
  // Items loaded today past what is in storage: the rest comes from today's harvest.
  const unpicked = (itemId: number) => { const line = lineOf.get(itemId)!; return sum(fills.filter((entry) => entry.itemId === itemId), (entry) => entry.count) - (line.held - line.harvest); };

  const card = (machine: MachineDay) => {
    const spare = opened(machine) - sum(machine.fill, (entry) => entry.batches);
    return <li key={machine.family} className="card daily-machine">
      <header className="daily-machine-head">
        <SaveIcon names={names} kind="items" value={String(machine.machine)} size={40} />
        <span className="daily-row-name">{name.item(machine.machine)}
          <small>{tr('{machines} 台 · {slots} 个槽位', { machines: machine.machines, slots: machine.slots })}</small>
        </span>
        <span className="daily-badge is-done">{tr('多赚 {money}', { money: money(sum(machine.fill, (entry) => entry.gain)) })}</span>
      </header>
      <ul className="daily-openings">
        {machine.free > machine.ready && <li><b>{tr('现在')}</b>{tr('空着 {count} 个', { count: machine.free - machine.ready })}</li>}
        {machine.ready > 0 && <li><b>{tr('现在')}</b>{tr('{count} 个做好了，取出后放', { count: machine.ready })}</li>}
        {machine.later.map((entry) => <li key={entry.after}><b>{finishTime(now, entry.after)}</b>{tr('做好 {count} 个，取出后放', { count: entry.slots })}</li>)}
      </ul>
      <ul className="daily-machine-jobs">
        {machine.fill.map((entry) => <li key={entry.itemId}>
          <SaveIcon names={names} kind="items" value={String(entry.itemId)} size={24} />
          <span>{tr('{item} × {count} → {output}', { item: name.item(entry.itemId), count: entry.count, output: name.item(entry.option.output) })}</span>
          <b className="daily-machine-gain">+{money(entry.gain)}</b>
          <small>{tr('做好能卖 {value}，直接卖 {raw}', { value: money(sold(entry)), raw: money(raw(entry)) })}</small>
          {unpicked(entry.itemId) > 0 && <small>{tr('有 {count} 个要先收今天熟的', { count: unpicked(entry.itemId) })}</small>}
        </li>)}
      </ul>
      {spare > 0 && <p className="daily-machine-math">{tr('还有 {count} 个槽位没有能放的原料。', { count: spare })}</p>}
    </li>;
  };

  // An option is the machine alone; the product only tells apart two recipes on one machine.
  const label = (line: ProduceLine, process: number) => {
    const option = line.options.find((entry) => entry.process === process);
    if (!option) return tr('不加工');
    return line.options.filter((entry) => entry.machine === option.machine).length > 1
      ? tr('{machine}（{output}）', { machine: name.item(option.machine), output: name.item(option.output) }) : name.item(option.machine);
  };
  // Why an item gets nothing today.
  const idle = (line: ProduceLine, option: ProduceOption | undefined) => {
    if (!option) return tr('不加工');
    const machine = machineOf.get(option.family), item = name.item(option.machine);
    if (line.held < option.inputs) return tr('每批需要 {count} 个', { count: option.inputs });
    if (!machine) return tr('尚未拥有{machine}', { machine: item });
    if (!opened(machine) && machine.next !== undefined) return tr('{machine} {time} 有空位', { machine: item, time: finishTime(now, machine.next) });
    return tr('{machine}今日已排满', { machine: item });
  };
  const numbers = (entries: FillLine[]) => <>
    <span className="daily-produce-num"><span className="daily-produce-label">{tr('加工数量')}</span>{name.number(sum(entries, (entry) => entry.count))}</span>
    <span className="daily-produce-num"><span className="daily-produce-label">{tr('加工收益')}</span>{money(sum(entries, sold))}</span>
    <b className="daily-produce-num is-gain"><span className="daily-produce-label">{tr('加工增益')}</span>+{money(sum(entries, (entry) => entry.gain))}</b>
  </>;

  const listed = plan.produce.filter((line) => line.pick !== undefined || line.options.some((option) => option.value > line.rawPrice))
    .map((line) => ({ line, today: fills.filter((entry) => entry.itemId === line.itemId) }))
    // In the order of the plan's own batches, so a row stays put when the player picks another machine for it.
    .sort((a, b) => b.line.planned - a.line.planned || sum(b.today, (entry) => entry.gain) - sum(a.today, (entry) => entry.gain) || b.line.held - a.line.held);
  const rows = listed.map(({ line, today }) => {
    const value = line.pick ?? line.best, chosen = line.options.find((option) => option.process === value), top = line.options[0];
    const notes: Array<{ text: string; short?: boolean }> = [];
    if (line.pick !== undefined && line.pick !== line.best) notes.push({ text: tr('推荐：{machine}', { machine: label(line, line.best) }) });
    if (chosen && chosen.value <= line.rawPrice) notes.push({ text: tr('加工后售价低于原料售价'), short: true });
    // The plan skipped a recipe that pays more: say why.
    const topMachine = machineOf.get(top.family), topVars = { machine: name.item(top.machine), gain: money(optionGain(line, top)) };
    if (line.pick === undefined && chosen && top !== chosen && optionGain(line, top) > optionGain(line, chosen) && (!topMachine || full(topMachine))) {
      notes.push({ text: topMachine ? tr('{machine}每个增益 {gain}，今日已排满', topVars) : tr('{machine}每个增益 {gain}，尚未拥有', topVars) });
    }
    if (today.length > 1) notes.push({ text: tr('今日分配：{list}', { list: today.map((entry) => tr('{machine} {count} 个', { machine: name.item(entry.option.machine), count: entry.count })).join(tr('、')) }) });
    return <li key={line.itemId} className="daily-produce">
      <span className="daily-produce-item">
        <SaveIcon names={names} kind="items" value={String(line.itemId)} size={32} />
        <span className="daily-row-name">{name.item(line.itemId)}<small>{[line.held > line.harvest && tr('库存 {count}', { count: name.number(line.held - line.harvest) }),
          line.harvest > 0 && tr('今日收获 {count}', { count: name.number(line.harvest) })].filter(Boolean).join(' · ')}</small></span>
      </span>
      <span className="daily-produce-choice">
        <SearchableSelect value={value} aria-label={tr('{item}的加工设备', { item: name.item(line.itemId) })}
          onChange={(event) => { const next = Number(event.target.value); onChoice(line.itemId, next === line.best ? undefined : next); }}>
          {line.options.map((option) => <option key={option.process} value={option.process}>{label(line, option.process)}</option>)}
          <option value={NOT_PROCESSED}>{label(line, NOT_PROCESSED)}</option>
        </SearchableSelect>
        {notes.map((note) => <small key={note.text} className={note.short ? 'is-short' : undefined}>{note.text}</small>)}
      </span>
      {today.length ? numbers(today) : <span className="daily-produce-idle">{idle(line, chosen)}</span>}
    </li>;
  });
  const shown = Math.max(6, listed.findLastIndex((entry) => entry.today.length || entry.line.planned > 0) + 1);

  return <Section id="daily-machines" icon="machine" title={tr('加工设备')}
    summary={slots ? tr('今天有 {slots} 个槽位要放原料，照下面放。', { slots }) : tr('今天没有要放原料的槽位。')}>
    {fills.length > 0 && <dl className="daily-stats daily-today-money">
      <div><dt>{tr('加工数量')}</dt><dd>{tr('{count} 个', { count: name.number(sum(fills, (entry) => entry.count)) })}</dd></div>
      <div><dt>{tr('加工收益')}</dt><dd>{money(sum(fills, sold))}</dd></div>
      <div className="is-gain"><dt>{tr('加工增益')}</dt><dd>+{money(sum(fills, (entry) => entry.gain))}</dd></div>
    </dl>}
    {ready > 0 && <p className="daily-banner"><Icon name="check" size={18} />{tr('有 {count} 个槽位的产品已经做好，先取出来再放新的。', { count: ready })}</p>}

    {loading.length ? <ul className="daily-machine-grid">{loading.map(card)}</ul>
      : <p className="daily-empty card">{tr('今天没有空出来的槽位，或者仓库里没有值得加工的原料。')}</p>}
    {busy.length > 0 && <div className="daily-quiet">
      <span className="daily-quiet-label">{tr('今天不用管')}</span>
      <span className="daily-items">{busy.map((machine) => <ItemChip key={machine.family} names={names} itemId={machine.machine} label={name.item(machine.machine)}
        count={machine.next !== undefined ? tr('{time} 做好', { time: finishTime(now, machine.next) }) : undefined} />)}</span>
    </div>}
    {empty.length > 0 && <div className="daily-quiet">
      <span className="daily-quiet-label">{tr('空着，但没有能放的农产品')}</span>
      <span className="daily-items">{empty.map((machine) => <ItemChip key={machine.family} names={names} itemId={machine.machine} label={name.item(machine.machine)} count={tr('{count} 个槽位', { count: opened(machine) })} />)}</span>
    </div>}
    <p className="daily-note">{tr('算上了今天熟的作物和能摇下的果子，没算家畜今天的产物。交付要用的已经留出来了。价钱按普通品质算。')}</p>

    {rows.length > 0 && <>
      <h3 className="daily-sub-head">{tr('各原料的加工设备')}</h3>
      <div className="card daily-produce-table">
        <div className="daily-produce-head" aria-hidden="true">
          <span>{tr('原料')}</span><span>{tr('设备')}</span><span>{tr('加工数量')}</span><span>{tr('加工收益')}</span><span>{tr('加工增益')}</span>
        </div>
        <GrowList className="daily-produce-list" items={rows} shown={shown}
          after={fills.length > 0 && <p className="daily-produce daily-produce-total"><strong className="daily-produce-item">{tr('合计')}</strong><span />{numbers(fills)}</p>} />
      </div>
      <p className="daily-note">{tr('默认按今日空位收益最高的方式安排。改选设备后，该原料只放入所选设备；选回推荐的设备即恢复默认。选择只保存在本浏览器。')}</p>
    </>}
  </Section>;
}
