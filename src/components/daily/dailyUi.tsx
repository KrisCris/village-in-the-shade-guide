import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { ItemSource } from '../../domain/dailySources';
import { ANIMALS } from '../../lib/saveAnimals';
import { gameDuration } from '../../lib/saveMachines';
import { GAME_SEASONS } from '../../lib/saveTime';
import { lookupName, type SaveNameTables } from '../../lib/saveNames';
import SaveIcon from '../save/SaveIcon';
import { activeLocale, tr } from '../../i18n/active';

/** Cells to mark on the farm map; `trees` counts them as trees rather than field cells. */
export interface MapTarget { label: string; cells: number[]; unit?: 'trees' }

const ICONS = {
  today: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3.5h6v3H9z" /><path d="m9 13.5 2 2 4-4" /></>,
  deliver: <><path d="M3.5 7.5 12 3.2l8.5 4.3v9L12 20.8l-8.5-4.3z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v8.8" /></>,
  machine: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1" /></>,
  land: <><path d="M12 20.5v-8.5" /><path d="M12 12c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5z" /><path d="M12 14.5c0-3-2.5-5-6-5 0 3 2.5 5 6 5z" /><path d="M5 20.5h14" /></>,
  farm: <><path d="M3 11 12 4l9 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" /></>,
  map: <><path d="M3.5 6.5 9 4.2l6 2.3 5.5-2.3v13.3L15 19.8l-6-2.3-5.5 2.3z" /><path d="M9 4.2v13.3M15 6.5v13.3" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  alert: <><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2v.3" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  swap: <path d="M6.5 8h11l-3-3M17.5 16h-11l3 3" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
};
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg className="daily-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{ICONS[name]}</svg>;
}

/** Long lists show their first entries; a button reveals the rest in place. */
export function GrowList({ items, shown, className }: { items: ReactNode[]; shown: number; className: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <ul className={className}>{open ? items : items.slice(0, shown)}</ul>
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
export function Tabs({ label, tabs, initial }: { label: string; tabs: Array<{ id: string; label: string; count?: number; content: ReactNode }>; initial?: string }) {
  const [active, setActive] = useState(initial);
  const current = tabs.some((tab) => tab.id === active) ? active! : tabs[0]?.id;
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const base = useId();
  const keys = (event: KeyboardEvent, index: number) => {
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length];
    setActive(tab.id);
    buttons.current[tab.id]?.focus();
  };
  return <div className="daily-tabs">
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
    case 'fish': return source.now ? tr('这季钓得到') : tr('{seasons}季才钓得到', { seasons: name.seasons(source.seasons) });
    case 'wild': return source.now ? tr('这季能在山里采到') : tr('{season}季在山里采', { season: name.seasons([source.season]) });
    case 'animal': {
      const animals = source.species.map(name.animal).join(tr('、'));
      return source.owned ? tr('农场里的{animals}会产', { animals }) : tr('{animals}产，农场里还没有', { animals });
    }
    case 'trees': {
      const trees = source.crops.map(name.tree).join(tr('、'));
      const parts = [tr('砍{trees}：村里有 {grown} 棵长成的', { trees, grown: source.grown.length })];
      if (source.young) parts.push(tr('{young} 棵还在长', { young: source.young }));
      for (const [seed, count] of source.seeds) parts.push(tr('有 {count} 个{seed}可以种，约 10 天长成', { count, seed: name.item(seed) }));
      return parts.join(tr('；'));
    }
    case 'sap': return tr('在{tree}上放树液采集器，3 天收一次（村里有 {count} 棵长成的）', { tree: name.tree(source.tree), count: source.trees.length });
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
