import type { ReactNode } from 'react';
import type { ItemSource } from '../../domain/dailySources';
import { ANIMALS } from '../../lib/saveAnimals';
import { gameDuration } from '../../lib/saveMachines';
import { GAME_SEASONS } from '../../lib/saveTime';
import { lookupName, type SaveNameTables } from '../../lib/saveNames';
import SaveIcon from '../save/SaveIcon';
import { activeLocale, tr } from '../../i18n/active';

const SHOWN = 5;

/** Long lists show their first rows and fold the rest away. */
export function ShortList({ rows, shown = SHOWN }: { rows: ReactNode[]; shown?: number }) {
  return <>
    <ul className="daily-list">{rows.slice(0, shown)}</ul>
    {rows.length > shown && <details className="daily-more">
      <summary>{tr('其余 {count} 项', { count: rows.length - shown })}</summary>
      <ul className="daily-list">{rows.slice(shown)}</ul>
    </details>}
  </>;
}

export function Card({ title, tone, children, className }: { title: string; tone?: 'warning'; children: ReactNode; className?: string }) {
  return <section className={`card daily-card${tone ? ` is-${tone}` : ''}${className ? ` ${className}` : ''}`} aria-label={title}><h3>{title}</h3>{children}</section>;
}

/** A page section with a heading, a one-line summary and optional controls. */
export function Section({ id, title, summary, controls, children }: { id: string; title: string; summary?: ReactNode; controls?: ReactNode; children: ReactNode }) {
  return <section id={id} className="daily-section" aria-labelledby={`${id}-title`}>
    <header className="daily-section-head">
      <div>
        <h2 id={`${id}-title`}>{title}</h2>
        {summary && <p>{summary}</p>}
      </div>
      {controls && <div className="daily-controls">{controls}</div>}
    </header>
    {children}
  </section>;
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
      const parts = [tr('砍{trees}：地图上有 {grown} 棵长成的', { trees, grown: source.grown.length })];
      if (source.young) parts.push(tr('{young} 棵还在长', { young: source.young }));
      for (const [seed, count] of source.seeds) parts.push(tr('有 {count} 个{seed}可以种，约 10 天长成', { count, seed: name.item(seed) }));
      return parts.join(tr('；'));
    }
    case 'sap': return tr('在{tree}上放树液采集器，3 天收一次（地图上有 {count} 棵长成的）', { tree: name.tree(source.tree), count: source.trees.length });
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
