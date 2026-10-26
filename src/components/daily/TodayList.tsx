import type { ReactNode } from 'react';
import type { DailyAction } from '../../domain/dailyActions';
import type { BuildStep } from '../../domain/dailyProcessing';
import type { SaveNameTables } from '../../lib/saveNames';
import SaveIcon from '../save/SaveIcon';
import { Icon, MapButton, Meter, Section, sourceTarget, sourceText, type MapTarget, type Names } from './dailyUi';
import { tr } from '../../i18n/active';

type Tone = 'urgent' | 'deliver' | 'craft' | 'gather' | 'field' | 'routine';
interface Row { key: string; tag: string; tone: Tone; icon?: ReactNode; title: string; details: string[]; target?: MapTarget | null; section: string }

/** A key that survives changing the settings, so a ticked task stays ticked. */
export function actionKey(action: DailyAction): string {
  switch (action.kind) {
    case 'fetch': return `fetch:${action.trip}`;
    case 'gather': return `gather:${action.lines[0].material.itemId}`;
    case 'animal': return `animal:${action.idea.species}`;
    default: return action.kind;
  }
}

/** Today's to-do list as a checklist: one line per job, with where it happens and a way to tick it off. */
export default function TodayList({ actions, names, name, horizon, done, onToggle, onMap }: {
  actions: DailyAction[];
  names: SaveNameTables;
  name: Names;
  horizon: number;
  done: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onMap: (target: MapTarget) => void;
}) {
  const icon = (kind: 'items' | 'crops', id: number) => <SaveIcon names={names} kind={kind} value={String(id)} size={36} />;
  const list = (values: string[]) => values.join(tr('、'));
  const days = (value: number) => Number.isFinite(value) ? name.number(Math.ceil(value)) : '∞';
  const step = (entry: BuildStep) => entry.upgrade
    ? tr('升级 {count} 台{machine}', { count: entry.count, machine: name.item(entry.machine) })
    : tr('新造 {count} 台{machine}', { count: entry.count, machine: name.item(entry.machine) });
  const houseName = (type: number) => [tr('畜舍'), tr('禽舍'), tr('马棚')][type] ?? tr('畜舍');

  const rows = actions.map((action): Row => {
    const key = actionKey(action);
    switch (action.kind) {
      case 'wither': {
        const cells = action.groups.flatMap((group) => group.cells);
        return {
          key, tag: tr('紧急'), tone: 'urgent', icon: icon('crops', action.groups[0].crop), section: 'daily-farm',
          target: { label: tr('明天会枯萎的作物'), cells },
          title: tr('今天收完 {count} 格作物', { count: cells.length }),
          details: [tr('{crops}明天就会枯萎', { crops: list(action.groups.map((group) => name.crop(group.crop))) })],
        };
      }
      case 'deliver': return {
        key, tag: tr('交付'), tone: 'deliver', icon: icon('items', action.plans[0].lines[0].itemId), section: 'daily-deliveries',
        title: tr('交付 {count} 项', { count: action.plans.length }), details: [list(action.plans.map((plan) => plan.spec.name))],
      };
      case 'fetch': {
        const items = list(action.items.map(([itemId, count]) => `${name.item(itemId)} × ${count}`));
        return {
          key, tag: action.trip === 'fish' ? tr('钓鱼') : tr('采集'), tone: 'deliver', icon: icon('items', action.items[0][0]), section: 'daily-deliveries',
          title: action.trip === 'fish' ? tr('钓鱼：{items}', { items }) : tr('去山里采：{items}', { items }),
          details: [tr('凑齐后能交{bundles}', { bundles: action.plans.map((plan) => `「${plan.spec.name}」`).join('') })],
        };
      }
      case 'machines': return {
        key, tag: tr('设备'), tone: 'craft', icon: action.fill.length ? icon('items', action.fill[0].family.machine) : undefined, section: 'daily-machines',
        title: action.outputs && action.fill.length ? tr('取出 {count} 件做好的产品，再装满空着的设备', { count: action.outputs })
          : action.outputs ? tr('取出 {count} 件做好的产品', { count: action.outputs }) : tr('装满空着的设备'),
        details: action.fill.map(({ family, produce }) => tr('{machine}空着 {count} 台，放{items}', { machine: name.item(family.machine), count: family.idle, items: list(produce.slice(0, 3).map(name.item)) })),
      };
      case 'build': return {
        key, tag: tr('加造'), tone: 'craft', icon: icon('items', action.families[0].machine), section: 'daily-machines',
        title: tr('加造设备：{steps}', { steps: action.families.flatMap((family) => family.build.map(step)).join(tr('，')) }),
        details: [
          tr('按现有数量，{families}才加工得完，期限是 {horizon} 天', { horizon, families: list(action.families.map((family) => tr('{machine}要 {days} 天', { machine: name.item(family.machine), days: days(family.days) }))) }),
          action.short.length ? tr('材料还差：{items}', { items: list(action.short.map((line) => `${name.item(line.itemId)} ${line.short}`)) }) : tr('材料够用，可以直接去工作台做'),
        ],
      };
      case 'gather': {
        const [{ material, source }] = action.lines, item = name.item(material.itemId);
        const target = sourceTarget(action.lines.map((line) => line.source), item, name);
        const reason = material.for ? [tr('做{item}用', { item: name.item(material.for) })] : [];
        const base = { key, tone: 'gather' as const, icon: icon('items', material.itemId), section: 'daily-materials', target };
        switch (source.kind) {
          case 'quarry': return {
            ...base, tag: tr('采石'),
            title: source.reached
              ? tr('去采石场第 {from}–{to} 层挖{item}，还差 {count} 个', { from: source.from, to: source.to, item, count: material.short })
              : tr('去采石场挖{item}，还差 {count} 个', { item, count: material.short }),
            details: [...reason, source.reached ? tr('每敲 100 块石头约得 {count} 个', { count: name.number(source.perHundred) }) : sourceText(source, name)],
          };
          case 'sap': return {
            ...base, tag: tr('树液'),
            title: tr('用树液采集器收集{items}', { items: list(action.lines.map((line) => name.item(line.material.itemId))) }),
            details: action.lines.map((line) => `${tr('{item}还差 {count} 个', { item: name.item(line.material.itemId), count: line.material.short })}：${sourceText(line.source, name)}`),
          };
          case 'trees': return { ...base, tag: tr('砍树'), title: tr('砍树收集{item}，还差 {count} 个', { item, count: material.short }), details: [...reason, sourceText(source, name)] };
          case 'machine': return { ...base, tag: tr('加工'), title: tr('用{machine}做{item}，还差 {count} 个', { machine: name.item(source.machine), item, count: material.short }), details: [...reason, sourceText(source, name)] };
          default: return {
            ...base, tag: source.kind === 'fish' ? tr('钓鱼') : tr('准备'),
            title: source.kind === 'fish' ? tr('钓{item}，还差 {count} 个', { item, count: material.short }) : tr('准备{item}，还差 {count} 个', { item, count: material.short }),
            details: [...reason, sourceText(source, name)],
          };
        }
      }
      case 'plant': {
        const needed = action.ideas.filter((idea) => idea.needed > 0);
        return {
          key, tag: tr('种植'), tone: 'field', icon: icon('crops', Number(action.ideas[0].crop.numeric_id)), section: 'daily-land',
          title: tr('空地 {count} 格可以种：{crops}', { count: action.vacant, crops: list(action.ideas.map((idea) => idea.crop.name.zh_hans)) }),
          details: needed.length ? [tr('交付还差：{items}', { items: list(needed.map((idea) => `${idea.crop.name.zh_hans} ${idea.needed}`)) })] : [],
        };
      }
      case 'animal': return {
        key, tag: tr('家畜'), tone: 'field', section: 'daily-land',
        title: tr('{house}还有 {count} 个空位：可以养{animal}', { house: houseName(action.idea.house), count: action.idea.room, animal: name.animal(action.idea.species) }),
        details: [tr('交付要的{items}只有它产', { items: list(action.idea.items.map(name.item)) })],
      };
      case 'routine': return {
        key, tag: tr('日常'), tone: 'routine', section: 'daily-farm', title: tr('日常农活'),
        target: action.harvest.length ? { label: tr('可收获的作物'), cells: action.harvest } : null,
        details: [[
          action.harvest.length && tr('收获 {count} 格', { count: action.harvest.length }),
          action.water.length && tr('浇水 {count} 格', { count: action.water.length }),
          action.hungry && tr('喂 {count} 只动物', { count: action.hungry }),
        ].filter(Boolean).join(' · ')],
      };
    }
  });

  const finished = rows.filter((row) => done.has(row.key)).length;
  return <Section id="daily-today" icon="today" title={tr('今日待办')}
    summary={rows.length > 0 && <span className="daily-progress">
      <Meter value={finished} max={rows.length} tone={finished === rows.length ? 'done' : undefined} label={tr('已完成 {done} / {total} 项', { done: finished, total: rows.length })} />
      <span>{finished === rows.length ? tr('今天的事都做完了') : tr('已完成 {done} / {total} 项，勾选的记录只留到这一天', { done: finished, total: rows.length })}</span>
    </span>}>
    {rows.length ? <ol className="daily-tasks">{rows.map((row) => {
      const checked = done.has(row.key), title = `daily-task-${row.key.replace(/\W/g, '-')}`;
      return <li key={row.key} className={`daily-task is-${row.tone}${checked ? ' is-done' : ''}`}>
        <input type="checkbox" className="daily-checkbox" checked={checked} aria-labelledby={title} onChange={() => onToggle(row.key)} />
        <span className="daily-task-icon" aria-hidden="true">{row.icon ?? <Icon name="farm" size={22} />}</span>
        <div className="daily-task-body">
          <p className="daily-task-title"><span className="daily-tag">{row.tag}</span><strong id={title}>{row.title}</strong></p>
          {row.details.map((detail) => <p key={detail} className="daily-task-detail">{detail}</p>)}
        </div>
        <div className="daily-task-links">
          <MapButton target={row.target ?? null} onMap={onMap} />
          <a className="button daily-link-button" href={`#${row.section}`} aria-label={tr('{name}的详情', { name: row.title })}>{tr('详情')}</a>
        </div>
      </li>;
    })}</ol> : <p className="daily-empty card">{tr('今天没有要紧的事。')}</p>}
  </Section>;
}
