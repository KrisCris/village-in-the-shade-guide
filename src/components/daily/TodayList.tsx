import type { ReactNode } from 'react';
import type { DailyAction } from '../../domain/dailyActions';
import type { BuildStep } from '../../domain/dailyProcessing';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveIcon from '../save/SaveIcon';
import { sourceCells, sourceText, type Names } from './dailyUi';
import { tr } from '../../i18n/active';

const SHOWN = 8;

interface Row { key: string; icon?: ReactNode; title: string; details: string[]; cells?: number[]; target?: string; urgent?: boolean }

/** Today's to-do list: one line per job, each with a way to see where it happens. */
export default function TodayList({ actions, names, name, horizon, onMap }: {
  actions: DailyAction[];
  names: SaveNameTables;
  name: Names;
  horizon: number;
  onMap: (label: string, cells: number[]) => void;
}) {
  const icon = (kind: 'items' | 'crops', id: number) => <SaveIcon names={names} kind={kind} value={String(id)} size={32} />;
  const list = (values: string[]) => values.join(tr('、'));
  const days = (value: number) => Number.isFinite(value) ? name.number(Math.ceil(value)) : '∞';
  const step = (entry: BuildStep) => entry.upgrade
    ? tr('升级 {count} 台{machine}', { count: entry.count, machine: name.item(entry.machine) })
    : tr('新造 {count} 台{machine}', { count: entry.count, machine: name.item(entry.machine) });
  const houseName = (type: number) => [tr('畜舍'), tr('禽舍'), tr('马棚')][type] ?? tr('畜舍');

  const rows = actions.map((action, index): Row => {
    const key = `${action.kind}:${index}`;
    switch (action.kind) {
      case 'wither': return {
        key, urgent: true, icon: icon('crops', action.groups[0].crop), cells: action.groups.flatMap((group) => group.cells),
        title: tr('今天收完 {count} 格作物', { count: action.groups.reduce((sum, group) => sum + group.cells.length, 0) }),
        details: [tr('{crops}明天就会枯萎', { crops: list(action.groups.map((group) => name.crop(group.crop))) })],
      };
      case 'deliver': return {
        key, icon: icon('items', action.plans[0].lines[0].itemId), target: 'daily-deliveries',
        title: tr('交付 {count} 项', { count: action.plans.length }), details: [list(action.plans.map((plan) => plan.spec.name))],
      };
      case 'fetch': {
        const items = list(action.items.map(([itemId, count]) => `${name.item(itemId)} × ${count}`));
        return {
          key, icon: icon('items', action.items[0][0]), target: 'daily-deliveries',
          title: action.trip === 'fish' ? tr('钓鱼：{items}', { items }) : tr('去山里采：{items}', { items }),
          details: [tr('凑齐后能交{bundles}', { bundles: action.plans.map((plan) => `「${plan.spec.name}」`).join('') })],
        };
      }
      case 'machines': return {
        key, icon: action.fill.length ? icon('items', action.fill[0].family.machine) : undefined, target: 'daily-machines',
        title: action.outputs && action.fill.length ? tr('取出 {count} 件做好的产品，再装满空着的设备', { count: action.outputs })
          : action.outputs ? tr('取出 {count} 件做好的产品', { count: action.outputs }) : tr('装满空着的设备'),
        details: action.fill.map(({ family, produce }) => tr('{machine}空着 {count} 台，放{items}', { machine: name.item(family.machine), count: family.idle, items: list(produce.slice(0, 3).map(name.item)) })),
      };
      case 'build': {
        const short = action.short;
        return {
          key, icon: icon('items', action.families[0].machine), target: 'daily-machines',
          title: tr('加造设备：{steps}', { steps: action.families.flatMap((family) => family.build.map(step)).join(tr('，')) }),
          details: [
            tr('按现有数量，{families}才加工得完，期限是 {horizon} 天', { horizon, families: list(action.families.map((family) => tr('{machine}要 {days} 天', { machine: name.item(family.machine), days: days(family.days) }))) }),
            short.length ? tr('材料还差：{items}', { items: list(short.map((line) => `${name.item(line.itemId)} ${line.short}`)) }) : tr('材料够用，可以直接去工作台做'),
          ],
        };
      }
      case 'gather': {
        const [{ material, source }] = action.lines, item = name.item(material.itemId);
        const cells = action.lines.flatMap((line) => sourceCells(line.source));
        const reason = material.for ? [tr('做{item}用', { item: name.item(material.for) })] : [];
        switch (source.kind) {
          case 'quarry': return {
            key, icon: icon('items', material.itemId), target: 'daily-materials',
            title: source.reached
              ? tr('去采石场第 {from}–{to} 层挖{item}，还差 {count} 个', { from: source.from, to: source.to, item, count: material.short })
              : tr('去采石场挖{item}，还差 {count} 个', { item, count: material.short }),
            details: [...reason, source.reached ? tr('每敲 100 块石头约得 {count} 个', { count: name.number(source.perHundred) }) : sourceText(source, name)],
          };
          case 'sap': return {
            key, icon: icon('items', material.itemId), target: 'daily-materials', cells,
            title: tr('用树液采集器收集{items}', { items: list(action.lines.map((line) => name.item(line.material.itemId))) }),
            details: action.lines.map((line) => `${tr('{item}还差 {count} 个', { item: name.item(line.material.itemId), count: line.material.short })}：${sourceText(line.source, name)}`),
          };
          case 'trees': return {
            key, icon: icon('items', material.itemId), target: 'daily-materials', cells,
            title: tr('砍树收集{item}，还差 {count} 个', { item, count: material.short }), details: [...reason, sourceText(source, name)],
          };
          case 'machine': return {
            key, icon: icon('items', material.itemId), target: 'daily-materials',
            title: tr('用{machine}做{item}，还差 {count} 个', { machine: name.item(source.machine), item, count: material.short }), details: [...reason, sourceText(source, name)],
          };
          default: return {
            key, icon: icon('items', material.itemId), target: 'daily-materials', cells,
            title: source.kind === 'fish' ? tr('钓{item}，还差 {count} 个', { item, count: material.short }) : tr('准备{item}，还差 {count} 个', { item, count: material.short }),
            details: [...reason, sourceText(source, name)],
          };
        }
      }
      case 'plant': {
        const needed = action.ideas.filter((idea) => idea.needed > 0);
        return {
          key, icon: <SaveIcon names={names} kind="crops" value={String(action.ideas[0].crop.numeric_id)} size={32} />, target: 'daily-land',
          title: tr('空地 {count} 格可以种：{crops}', { count: action.vacant, crops: list(action.ideas.map((idea) => idea.crop.name.zh_hans)) }),
          details: needed.length ? [tr('交付还差：{items}', { items: list(needed.map((idea) => `${idea.crop.name.zh_hans} ${idea.needed}`)) })] : [],
        };
      }
      case 'animal': return {
        key, target: 'daily-land',
        title: tr('{house}还有 {count} 个空位：可以养{animal}', { house: houseName(action.idea.house), count: action.idea.room, animal: name.animal(action.idea.species) }),
        details: [tr('交付要的{items}只有它产', { items: list(action.idea.items.map(name.item)) })],
      };
      case 'routine': return {
        key, target: 'daily-farm', cells: action.harvest, title: tr('日常农活'),
        details: [[
          action.harvest.length && tr('收获 {count} 格', { count: action.harvest.length }),
          action.water.length && tr('浇水 {count} 格', { count: action.water.length }),
          action.hungry && tr('喂 {count} 只动物', { count: action.hungry }),
        ].filter(Boolean).join(' · ')],
      };
    }
  });

  const row = (entry: Row, index: number) => <li key={entry.key} className={`daily-action${entry.urgent ? ' is-urgent' : ''}`}>
    <span className="daily-action-number" aria-hidden="true">{index + 1}</span>
    <span className="daily-action-icon" aria-hidden="true">{entry.icon}</span>
    <span className="daily-row-name">{entry.title}{entry.details.map((detail) => <small key={detail}>{detail}</small>)}</span>
    <span className="daily-action-links">
      {entry.cells && entry.cells.length > 0 && <button type="button" className="daily-map-button" aria-label={tr('在地图上标出{name}', { name: entry.title })} onClick={() => onMap(entry.title, entry.cells!)}>{tr('地图')}</button>}
      {entry.target && <a className="button daily-map-button" href={`#${entry.target}`} aria-label={tr('{name}的详情', { name: entry.title })}>{tr('详情')}</a>}
    </span>
  </li>;

  return <section className="card daily-card daily-today" aria-labelledby="daily-today-title">
    <h2 id="daily-today-title">{tr('今日待办')}</h2>
    {rows.length ? <>
      <ol className="daily-list daily-actions-list">{rows.slice(0, SHOWN).map(row)}</ol>
      {rows.length > SHOWN && <details className="daily-more">
        <summary>{tr('其余 {count} 项', { count: rows.length - SHOWN })}</summary>
        <ol className="daily-list daily-actions-list" start={SHOWN + 1}>{rows.slice(SHOWN).map((entry, index) => row(entry, index + SHOWN))}</ol>
      </details>}
    </> : <p className="daily-empty">{tr('今天没有要紧的事。')}</p>}
  </section>;
}
