import type { DailyDigest } from '../../domain/dailyDigest';
import type { MaterialLine } from '../../domain/dailyMaterials';
import { NOT_PROCESSED, type FamilyLine, type ProcessingPlan } from '../../domain/dailyProcessing';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveIcon from '../save/SaveIcon';
import SearchableSelect from '../controls/SearchableSelect';
import { ItemChip, Section, ShortList, sourceCells, sourceText, type Names } from './dailyUi';
import { tr } from '../../i18n/active';

const RESERVES = [0, 0.1, 0.2, 0.3, 0.5];
const HORIZONS = [7, 14, 28, 56];

/** Machine capacity against the produce in hand and coming, plus the machines and materials to add. */
export default function ProcessingSection({ plan, machines, materials, seasonDays, horizon, reserve, names, name, onHorizon, onReserve, onChoice, onMap }: {
  plan: ProcessingPlan;
  machines: DailyDigest['machines'];
  materials: MaterialLine[];
  /** Turnovers left in the season, the default horizon. */
  seasonDays: number;
  /** The saved horizon setting; 0 is the end of the season. */
  horizon: number;
  reserve: number;
  names: SaveNameTables;
  name: Names;
  onHorizon: (days: number) => void;
  onReserve: (share: number) => void;
  onChoice: (itemId: number, process: number) => void;
  onMap: (label: string, cells: number[]) => void;
}) {
  const days = (value: number) => Number.isFinite(value) ? name.number(Math.ceil(value * 10) / 10) : '∞';
  const working = plan.families.filter((family) => family.demand > 0 || family.build.length > 0);
  const quiet = plan.families.filter((family) => !working.includes(family));
  const collect = machines.done.reduce((sum, row) => sum + row.count, 0);

  const familyRow = (family: FamilyLine) => {
    const short = family.days > plan.horizon;
    return <li key={family.family} className={`daily-family${short ? ' is-short' : ''}`}>
      <SaveIcon names={names} kind="items" value={String(family.machine)} size={32} />
      <span className="daily-row-name">{name.item(family.machine)}
        <small>{tr('{machines} 台 · {slots} 个槽位', { machines: family.machines, slots: family.slots })}{family.idle > 0 && ` · ${tr('{count} 台空着', { count: family.idle })}`}</small>
      </span>
      <span className="daily-meter" role="img" aria-label={tr('要 {days} 天，期限 {horizon} 天', { days: days(family.days), horizon: plan.horizon })}>
        <span style={{ width: `${Math.min(100, family.days / plan.horizon * 100)}%` }} />
      </span>
      <b className="daily-count">{tr('{days} 天', { days: days(family.days) })}</b>
      {(family.build.length > 0 || family.locked) && <p className="daily-build">
        {family.locked ? tr('还差 {slots} 个槽位，但还没学会做{machine}{skill}', { slots: family.extraSlots, machine: name.item(family.machine), skill: family.locked.skill ? tr('（祠堂能力「{skill}」）', { skill: family.locked.skill }) : '' })
          : tr('还差 {slots} 个槽位：{steps}', { slots: family.extraSlots, steps: family.build.map((step) => step.upgrade
            ? tr('升级 {count} 台{machine}', { count: step.count, machine: name.item(step.machine) })
            : tr('新造 {count} 台{machine}', { count: step.count, machine: name.item(step.machine) })).join(tr('，')) })}
      </p>}
    </li>;
  };

  const produceRows = plan.produce.map((line) => {
    const chosen = line.options.find((option) => option.process === line.choice);
    return <li key={line.itemId} className="daily-row daily-produce">
      <SaveIcon names={names} kind="items" value={String(line.itemId)} size={32} />
      <span className="daily-row-name">{name.item(line.itemId)}
        <small>{[line.held && tr('库存 {count}', { count: line.held }), line.coming && tr('{days} 天内还会收 {count}', { days: plan.horizon, count: line.coming })].filter(Boolean).join(' · ')}</small>
      </span>
      <SearchableSelect value={line.choice} aria-label={tr('{item}的加工方式', { item: name.item(line.itemId) })} onChange={(event) => onChoice(line.itemId, Number(event.target.value))}>
        <option value={NOT_PROCESSED}>{tr('直接卖 {price}', { price: line.rawPrice })}</option>
        {line.options.map((option) => <option key={option.process} value={option.process}>
          {tr('{output} {value} · {machine}', { output: name.item(option.output), machine: name.item(option.machine), value: name.number(option.value) })}
        </option>)}
      </SearchableSelect>
      {chosen && chosen.value <= line.rawPrice && <small className="daily-produce-note">{tr('加工后卖得比直接卖还少')}</small>}
    </li>;
  });

  const shortMaterials = materials.filter((line) => line.short > 0);
  return <Section id="daily-machines" title={tr('加工设备')}
    summary={tr('按现有设备算，手上和 {days} 天内要收的作物要几天才能加工完。', { days: plan.horizon })}
    controls={<label className="daily-control">{tr('期限')}
      <SearchableSelect value={horizon} onChange={(event) => onHorizon(Number(event.target.value))}>
        <option value={0}>{tr('本季结束（{days} 天）', { days: Math.max(seasonDays, 7) })}</option>
        {HORIZONS.map((value) => <option key={value} value={value}>{tr('{days} 天', { days: value })}</option>)}
      </SearchableSelect>
    </label>}>
    {collect > 0 && <p className="save-status success">{tr('有 {count} 件产品已经做好，先取出来再放新的。', { count: collect })}</p>}
    <div className="daily-columns">
      <div className="card daily-card">
        <h3>{tr('设备数量')}</h3>
        {working.length ? <ul className="daily-list">{working.map(familyRow)}</ul> : <p className="daily-empty">{tr('现在没有要加工的作物。')}</p>}
        {quiet.length > 0 && <details className="daily-more">
          <summary>{tr('闲置的设备（{count} 种）', { count: quiet.length })}</summary>
          <ul className="daily-list">{quiet.map(familyRow)}</ul>
        </details>}
        <p className="daily-note">{tr('天数包括正在加工的产品。每种作物只按一种配方算：优先选已有设备里有空闲、卖价最高的那种，没有空闲的设备时才建议加造。直接卖更划算的作物不加工。')}</p>
      </div>
      <div className="card daily-card">
        <h3>{tr('作物加工')}</h3>
        {produceRows.length ? <ShortList rows={produceRows} shown={6} /> : <p className="daily-empty">{tr('现在没有要加工的作物。')}</p>}
        <p className="daily-note">{tr('选项里的数字是每个原料最后能卖多少钱。交付要用的数量已经扣掉。你选的加工方式会保存在这个浏览器里。')}</p>
      </div>
    </div>
    {materials.length > 0 && <div id="daily-materials" className="card daily-card daily-materials">
      <header className="daily-card-head">
        <h3>{tr('加造设备的材料')}</h3>
        <label className="daily-control">{tr('库存保留')}
          <SearchableSelect value={reserve} onChange={(event) => onReserve(Number(event.target.value))}>
            {RESERVES.map((value) => <option key={value} value={value}>{`${Math.round(value * 100)}%`}</option>)}
          </SearchableSelect>
        </label>
      </header>
      <ul className="daily-list">{materials.map((line) => {
        const cells = line.sources.flatMap(sourceCells);
        return <li key={`${line.itemId}:${line.for ?? ''}`} className={`daily-material${line.short ? ' is-short' : ''}`}>
          <ItemChip names={names} itemId={line.itemId} label={name.item(line.itemId)} count={line.short ? tr('还差 {count}', { count: line.short }) : tr('够了')} tone={line.short ? 'short' : 'done'} />
          <small>{[
            line.for && tr('做{item}用', { item: name.item(line.for) }),
            line.held ? tr('需要 {need}，可用 {usable}（库存 {held}，留 {reserve}）', { need: line.need, usable: Math.max(0, line.held - line.reserve), held: line.held, reserve: line.reserve })
              : tr('需要 {need}，库存里没有', { need: line.need }),
          ].filter(Boolean).join(' · ')}</small>
          {line.sources.length > 0 && <span className="daily-source">{line.sources.map((source) => sourceText(source, name)).join(tr('；'))}</span>}
          {cells.length > 0 && <button type="button" className="daily-map-button" aria-label={tr('在地图上标出{name}', { name: name.item(line.itemId) })} onClick={() => onMap(name.item(line.itemId), cells)}>{tr('地图')}</button>}
        </li>;
      })}</ul>
      <p className="daily-note">{shortMaterials.length ? tr('交付要用的材料已经扣掉，每种再按库存保留的比例留一部分。每棵树能砍出多少木材还没核实，所以只列出能砍的树。') : tr('材料够用，可以直接去工作台做。')}</p>
    </div>}
  </Section>;
}
