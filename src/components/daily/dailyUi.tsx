import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { TREE_WOOD, type ItemSource } from '../../domain/dailySources';
import { ANIMALS } from '../../lib/saveAnimals';
import { gameDuration } from '../../lib/saveMachines';
import { gameDate } from '../../lib/saveDaily';
import { GAME_SEASONS } from '../../lib/saveTime';
import { lookupName, type SaveNameTables } from '../../lib/saveNames';
import SaveIcon from '../save/SaveIcon';
import { activeLocale, tr } from '../../i18n/active';

/** Cells to mark on the farm map; `trees` counts them as trees rather than field cells. */
export interface MapTarget { label: string; cells: number[]; unit?: 'trees' }

const ICONS = {
  today: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3.5h6v3H9z" /><path d="m9 13.5 2 2 4-4" /></>,
  deliver: <><path d="M3.5 7.5 12 3.2l8.5 4.3v9L12 20.8l-8.5-4.3z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v8.8" /></>,
  build: <><path d="m13.5 6.5 4 4" /><path d="M10.5 3.5 15 8l-2.2 2.2-4.5-4.5z" /><path d="m11.4 9.6-7 7a1.8 1.8 0 0 0 2.6 2.6l7-7" /><path d="M16 15.5h4.5M18.25 13.25v4.5" /></>,
  machine: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1" /></>,
  land: <><path d="M12 20.5v-8.5" /><path d="M12 12c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5z" /><path d="M12 14.5c0-3-2.5-5-6-5 0 3 2.5 5 6 5z" /><path d="M5 20.5h14" /></>,
  farm: <><path d="M3 11 12 4l9 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" /></>,
  map: <><path d="M3.5 6.5 9 4.2l6 2.3 5.5-2.3v13.3L15 19.8l-6-2.3-5.5 2.3z" /><path d="M9 4.2v13.3M15 6.5v13.3" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  alert: <><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2v.3" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  swap: <path d="M6.5 8h11l-3-3M17.5 16h-11l3 3" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  book: <><path d="M3.5 5.8c2.9-1.1 5.7-1 8.5.7 2.8-1.7 5.6-1.8 8.5-.7v12.9c-2.9-1.1-5.7-1-8.5.7-2.8-1.7-5.6-1.8-8.5-.7z" /><path d="M12 6.5v12.9" /></>,
};
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg className="daily-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{ICONS[name]}</svg>;
}

/** Long lists show their first entries; a button reveals the rest in place. `after` sits between the list and the button. */
export function GrowList({ items, shown, className, after }: { items: ReactNode[]; shown: number; className: string; after?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <>
    <ul className={className}>{open ? items : items.slice(0, shown)}</ul>
    {after}
    {items.length > shown && <button type="button" className="daily-grow" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? tr('收起') : tr('显示其余 {count} 项', { count: items.length - shown })}
    </button>}
  </>;
}

export function Card({ title, tone, children, className, badge }: { title: string; tone?: 'warning'; children: ReactNode; className?: string; badge?: ReactNode }) {
  return <section className={`card daily-card${tone ? ` is-${tone}` : ''}${className ? ` ${className}` : ''}`} aria-label={title}>
    <header className="daily-card-head"><h3>{title}</h3>{badge}</header>
    {children}
  </section>;
}

/** A page section with an icon, a heading, a one-line summary and optional controls. */
export function Section({ id, icon, title, summary, controls, children }: { id: string; icon: IconName; title: string; summary?: ReactNode; controls?: ReactNode; children: ReactNode }) {
  return <section id={id} className="daily-section" aria-labelledby={`${id}-title`}>
    <header className="daily-section-head">
      <span className="daily-section-icon"><Icon name={icon} size={22} /></span>
      <div className="daily-section-title">
        <h2 id={`${id}-title`}>{title}</h2>
        {summary && <div className="daily-section-summary">{summary}</div>}
      </div>
      {controls && <div className="daily-controls">{controls}</div>}
    </header>
    {children}
  </section>;
}

/** A thin progress bar; `label` makes it readable to screen readers, otherwise it is decoration. */
export function Meter({ value, max, tone, label }: { value: number; max: number; tone?: 'short' | 'done'; label?: string }) {
  const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return <span className={`daily-meter${tone ? ` is-${tone}` : ''}`} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
    <span style={{ width: `${share * 100}%` }} />
  </span>;
}

/** Tabs with arrow-key movement; only the open panel is rendered. */
/** Tabs with an `anchor` open when a link to `#anchor` is followed, so a link elsewhere on the page can land on the right tab. */
export function Tabs({ label, tabs, initial }: { label: string; tabs: Array<{ id: string; label: string; count?: number; content: ReactNode; anchor?: string }>; initial?: string }) {
  const [active, setActive] = useState(initial);
  const current = tabs.some((tab) => tab.id === active) ? active! : tabs[0]?.id;
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const base = useId();
  const anchors = tabs.flatMap((tab) => tab.anchor ? [[tab.anchor, tab.id]] : []);
  useEffect(() => {
    const open = (hash: string) => { const match = anchors.find(([anchor]) => `#${anchor}` === hash); if (match) setActive(match[1]); };
    // A click, not hashchange: following the same link twice should open the tab again.
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
      if (link) open(link.getAttribute('href')!);
    };
    open(location.hash);
    document.addEventListener('click', click);
    return () => document.removeEventListener('click', click);
  }, [anchors.join()]);
  const keys = (event: KeyboardEvent, index: number) => {
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length];
    setActive(tab.id);
    buttons.current[tab.id]?.focus();
  };
  return <div className="daily-tabs">
    {anchors.map(([anchor]) => <span key={anchor} id={anchor} className="daily-tab-anchor" />)}
    <div className="daily-tablist" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => <button key={tab.id} ref={(element) => { buttons.current[tab.id] = element; }} type="button" role="tab"
        id={`${base}-${tab.id}`} aria-controls={`${base}-${tab.id}-panel`} aria-selected={tab.id === current} tabIndex={tab.id === current ? 0 : -1}
        onClick={() => setActive(tab.id)} onKeyDown={(event) => keys(event, index)}>
        <span>{tab.label}</span>{tab.count !== undefined && <b>{tab.count}</b>}
      </button>)}
    </div>
    {tabs.map((tab) => <div key={tab.id} className="daily-tabpanel" role="tabpanel" id={`${base}-${tab.id}-panel`} aria-labelledby={`${base}-${tab.id}`}
      hidden={tab.id !== current} tabIndex={0}>{tab.id === current && tab.content}</div>)}
  </div>;
}

/** Name lookups shared by the daily sections. */
export function useNames(names: SaveNameTables) {
  const item = (id: number) => lookupName(names, 'items', String(id)) ?? `#${id}`;
  const crop = (id: number) => lookupName(names, 'crops', String(id)) ?? tr('作物 {id}', { id });
  const animal = (id: number) => ANIMALS.find((entry) => entry.id === id)?.name ?? `#${id}`;
  const seasons = (list: number[]) => list.map((season) => GAME_SEASONS[season]).join(tr('、'));
  const number = (value: number) => new Intl.NumberFormat(activeLocale(), { maximumFractionDigits: 1 }).format(value);
  // The chestnut tree shares its crop name with the nut.
  const tree = (id: number) => ({ 1000: tr('栗子树'), 1001: tr('柳杉'), 1002: tr('松树'), 1003: tr('槲树'), 1004: tr('桧木') } as Record<number, string>)[id] ?? crop(id);
  return { item, crop, animal, seasons, number, tree };
}
export type Names = ReturnType<typeof useNames>;

/** A game clock time, `after` game seconds past `now`: the hour alone today, 凌晨 past midnight, then 明天 or a count of days. */
export function finishTime(now: number, after: number): string {
  const { hour, minute } = gameDate(now + after), time = `${hour}:${String(minute).padStart(2, '0')}`;
  // Game days turn over at 07:00, which is where whole days of game seconds start.
  const days = Math.floor((now + after) / 86_400) - Math.floor(now / 86_400);
  if (days > 1) return tr('{days} 天后', { days });
  if (days === 1) return tr('明天 {time}', { time });
  return gameDate(now).hour >= 7 && hour < 7 ? tr('凌晨 {time}', { time }) : time;
}

/** An item chip: icon, name and a count. */
export function ItemChip({ names, itemId, label, count, tone }: { names: SaveNameTables; itemId: number; label: string; count?: ReactNode; tone?: 'short' | 'done' }) {
  return <span className={`daily-item${tone ? ` is-${tone}` : ''}`}>
    <SaveIcon names={names} kind="items" value={String(itemId)} size={24} />
    <span>{label}</span>
    {count !== undefined && <b>{count}</b>}
  </span>;
}

/** A small "map" button that marks a target on the farm map. */
export function MapButton({ target, onMap }: { target: MapTarget | null; onMap: (target: MapTarget) => void }) {
  if (!target?.cells.length) return null;
  return <button type="button" className="daily-map-button" aria-label={tr('在地图上标出{name}', { name: target.label })} onClick={() => onMap(target)}>
    <Icon name="map" size={16} />{tr('地图')}
  </button>;
}

/** One plain sentence on where an item comes from. */
export function sourceText(source: ItemSource, name: Names): string {
  switch (source.kind) {
    case 'field': return source.days
      ? tr('田里有 {cells} 格{crop}，{days} 天后开始成熟', { cells: source.cells.length, crop: name.crop(source.crop), days: source.days })
      : tr('田里有 {cells} 格{crop}已经成熟', { cells: source.cells.length, crop: name.crop(source.crop) });
    case 'plant': return source.now
      ? tr('种{crop}，这季能种', { crop: name.crop(source.crop) })
      : tr('种{crop}，{seasons}季作物', { crop: name.crop(source.crop), seasons: name.seasons(source.seasons) });
    case 'fish': return !source.now ? tr('{seasons}季才钓得到', { seasons: name.seasons(source.seasons) })
      : source.night ? tr('只在深夜（0:00–7:00）钓得到')
      : source.today ? tr('这季钓得到') : tr('这季钓得到，但要等 7:00 换日以后');
    case 'wild': return source.now ? tr('这季在野外采得到') : tr('{season}季在野外采', { season: name.seasons([source.season]) });
    case 'animal': {
      const animals = source.species.map(name.animal).join(tr('、'));
      return source.owned ? tr('农场里的{animals}会产', { animals }) : tr('{animals}产，农场里还没有', { animals });
    }
    case 'trees': {
      const trees = source.crops.map(name.tree).join(tr('、'));
      const parts = [tr('砍{trees}：长成的一棵出 {low}–{high} 个，现在长成的有 {grown} 棵', { trees, low: TREE_WOOD[0], high: TREE_WOOD[1], grown: source.grown.length })];
      if (source.stumps) parts.push(tr('村子西北边的附身草丛有很多树桩，砍了也出木材（那里不在地图上）'));
      if (source.young) parts.push(tr('{young} 棵还在长', { young: source.young }));
      for (const [seed, count] of source.seeds) parts.push(tr('有 {count} 个{seed}可以种，约 10 天长成', { count, seed: name.item(seed) }));
      return parts.join(tr('；'));
    }
    case 'sap': {
      const tree = name.tree(source.tree), spare = Math.max(0, source.trees.length - source.collectors);
      if (!source.collectors) return tr('在长成的{tree}上放树液采集器，3 天收一次（长成的有 {count} 棵）', { tree, count: source.trees.length });
      return [
        tr('{count} 台树液采集器在收，每 3 天共 {count} 个', { count: source.collectors }),
        spare ? tr('还有 {count} 棵长成的{tree}没放采集器', { count: spare, tree }) : tr('长成的{tree}都放了采集器，要更多就得再种{tree}', { tree }),
      ].join(tr('；'));
    }
    case 'machine': return tr('{machine}：{inputs}，做 {count} 个要 {time}', {
      machine: name.item(source.machine), count: source.count, time: gameDuration(source.minutes * 60),
      inputs: source.inputs.map(([id, count]) => `${name.item(id)} × ${count}`).join(tr('、')),
    });
    case 'quarry': return source.reached
      ? tr('采石场第 {from}–{to} 层，每敲 100 块石头约得 {count} 个', { from: source.from, to: source.to, count: name.number(source.perHundred) })
      : tr('采石场第 {from}–{to} 层才有，每 100 块石头约 {count} 个（还没到过）', { from: source.from, to: source.to, count: name.number(source.perHundred) });
  }
}

/** Cells a source can be shown at on the map: crops in the field and the trees to fell or tap. */
export function sourceCells(source: ItemSource): number[] {
  return source.kind === 'field' ? source.cells : source.kind === 'trees' ? source.grown : source.kind === 'sap' ? source.trees : [];
}

/** What the map should mark for these sources: tree sources are labelled and counted as trees, anything else under `item`. */
export function sourceTarget(sources: ItemSource[], item: string, name: Names): MapTarget | null {
  const placed = sources.filter((source) => sourceCells(source).length);
  if (!placed.length) return null;
  const cells = [...new Set(placed.flatMap(sourceCells))];
  if (!placed.every((source) => source.kind === 'trees' || source.kind === 'sap')) return { label: item, cells };
  const trees = [...new Set(placed.flatMap((source) => source.kind === 'trees' ? source.crops : source.kind === 'sap' ? [source.tree] : []))];
  return { label: tr('长成的{trees}', { trees: trees.map(name.tree).join(tr('、')) }), cells, unit: 'trees' };
}
