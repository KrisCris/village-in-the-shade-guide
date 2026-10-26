import type { Catalog, Entity, Perennial } from '../data/types';
import { format, msg, type Translate } from '../i18n/translate';

/** Left, top, right and bottom around the plant's ground point. */
export type GrowthBox = [number, number, number, number];
/** A farm-map sprite placed by its top-left corner; paint is where its visible pixels are. */
export type GrowthSprite = { file: string; x: number; y: number; w: number; h: number; paint: GrowthBox };
/**
 * One crop in data/sources/game-crop-growth.json. Each crops.dat form lists its
 * stages as [growth points, form after a harvest or axe cut (0 removes the
 * plant), sprite or spring-to-winter sprites].
 */
export type CropGrowthSource = Record<string, Array<[number, number, GrowthSprite | GrowthSprite[]]>>;

export type GrowthYield = { id: string; kind: string; name: string; icon?: string | null; quantity?: number };
export type GrowthStage = { points: number; day: number; gain: number; label: string; art: GrowthSprite[]; yields: GrowthYield[]; note?: string };
export type GrowthLane = { key: string; title: string; days: number; stages: GrowthStage[] };
export type GrowthLook = { key: string; title: string; note?: string; art: GrowthSprite[]; frame: GrowthBox; yields: GrowthYield[] };
export type CropGrowthModel = {
  crop: GrowthYield;
  /** Painted bounds of every stage in every season: lanes draw all stages at this one scale. */
  frame: GrowthBox;
  /** Stage art differs by season (outdoor fruit trees); art arrays then run spring to winter. */
  seasonal: boolean;
  /** Season index shown first: the first bearing season, else spring. */
  season: number;
  bearing: number[];
  lanes: GrowthLane[];
  /** The grown plant in each season, when its art changes with the season. */
  grown: { art: GrowthSprite[]; frame: GrowthBox } | null;
  looks: GrowthLook[];
};

/** The planner's baseline: a watered crop gains 100 growth points a day. */
export const GROWTH_POINTS_PER_DAY = 100;
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export const seasonLabels: Record<string, string> = { spring: msg('春'), summer: msg('夏'), autumn: msg('秋'), winter: msg('冬') };

// crops.dat forms (cropsform.dat): 1 growing, 2 withered, 3 disaster, 4/5 regrowing
// after a harvest, 6/7 stumps, 9 withered but harvestable, 10 waiting for its season.
const REGROW_FORMS = [4, 5];
const STUMP_FORMS = [6, 7];
const LOOK_FORMS = [4, 10, 9, 2, 3, 6, 7];
const lookTitles: Record<number, string> = {
  2: msg('枯萎'), 3: msg('异变'), 4: msg('结果季开始时'), 6: msg('树桩'), 7: msg('树桩'), 9: msg('枯萎后仍可收获'), 10: msg('不在结果季时'),
};

type HarvestStage = { state: number; growth_points: number; item_id: string; quantity: number };

const growthDay = (points: number) => Math.ceil(points / GROWTH_POINTS_PER_DAY);
const sprites = (art: GrowthSprite | GrowthSprite[]) => Array.isArray(art) ? art : [art];
const frameOf = (art: GrowthSprite[]): GrowthBox => [
  Math.min(...art.map((sprite) => sprite.paint[0])), Math.min(...art.map((sprite) => sprite.paint[1])),
  Math.max(...art.map((sprite) => sprite.paint[2])), Math.max(...art.map((sprite) => sprite.paint[3])),
];

/** The crop a seed or sapling grows into. */
export function cropForEntity(entity: Entity, catalog: Catalog): Entity | undefined {
  if (entity.kind === 'crops') return entity;
  if (entity.kind !== 'items') return undefined;
  return catalog.entities.find((row) => row.kind === 'crops' && ((row.seed_item_ids ?? []) as string[]).includes(entity.id));
}

export function buildCropGrowthModel(entity: Entity, catalog: Catalog, t: Translate = format): CropGrowthModel | null {
  const crop = cropForEntity(entity, catalog);
  const source = crop?.growth as CropGrowthSource | null | undefined;
  if (!crop || !source?.['1']) return null;
  const perennial = crop.perennial as Perennial | null | undefined;
  const harvests = (crop.harvest_stages ?? []) as HarvestStage[];
  const lite = (row: Entity, quantity?: number): GrowthYield => ({ id: row.id, kind: row.kind, name: row.name.zh_hans, icon: row.icon_path, ...(quantity ? { quantity } : {}) });
  const yieldsAt = (form: number, points: number) => {
    const rows = new Map<string, GrowthYield>();
    for (const stage of harvests) {
      const item = catalog.byId[stage.item_id];
      if (item && stage.state === form && stage.growth_points === points) rows.set(item.id, lite(item, stage.quantity));
    }
    return [...rows.values()];
  };
  const stagesOf = (form: number) => source[String(form)] ?? [];
  const bearing = (perennial?.bearing_seasons ?? []).map((season) => SEASONS.indexOf(season as typeof SEASONS[number])).filter((index) => index >= 0);
  const bearingText = bearing.map((index) => t(seasonLabels[SEASONS[index]])).join(t('、'));

  const lane = (form: number, title: string): GrowthLane => {
    let previous = 0;
    const stages = stagesOf(form).map(([points, , art], index): GrowthStage => {
      const day = growthDay(points);
      const stage = {
        points, day, gain: index ? day - previous : 0, art: sprites(art), yields: yieldsAt(form, points),
        label: index ? t('第 {day} 天', { day }) : form === 1 ? t('种下') : t('收获后'),
      };
      previous = day;
      return stage;
    });
    const last = stages.at(-1);
    // Fruit trees have no harvest table here: shaking a grown tree drops fruit in its bearing seasons.
    if (form === 1 && last && !harvests.some((stage) => stage.state === 1)) {
      last.yields = ((crop.harvest_item_ids ?? []) as string[]).flatMap((id) => catalog.byId[id] ? [lite(catalog.byId[id])] : []);
      if (perennial?.kind === 'fruit_tree') last.note = perennial.greenhouse_only ? t('只能种在温室里，四季都结果') : t('{seasons}季结果', { seasons: bearingText });
    }
    return { key: String(form), title, days: last?.day ?? 0, stages };
  };

  // Each harvest moves the plant to the form its stage names; a lane per regrowth form.
  const leadsTo = (target: number) => [1, ...REGROW_FORMS].flatMap((form) => stagesOf(form).filter(([, next]) => next === target).map(([points]) => ({ form, points })));
  const regrowth = REGROW_FORMS.filter((form) => stagesOf(form).length > 1).map((form) => {
    const sources = leadsTo(form);
    const first = sources.some((row) => row.form === 1) ? sources.filter((row) => row.form === 1) : sources;
    const names = [...new Set(first.flatMap((row) => yieldsAt(row.form, row.points).map((item) => item.name)))];
    return lane(form, names.length ? t('收获{items}后', { items: names.join(t('、')) }) : t('收获后再长'));
  });

  const grownStage = stagesOf(1).at(-1);
  const looks = LOOK_FORMS.flatMap((form): GrowthLook[] => {
    const stages = stagesOf(form);
    if (stages.length !== 1 || (REGROW_FORMS.includes(form) && perennial?.kind !== 'shrub')) return [];
    const cut = STUMP_FORMS.includes(form) ? stagesOf(1).find(([, next]) => next === form) : undefined;
    const art = sprites(stages[0][2]);
    return [{
      key: String(form), title: t(lookTitles[form]), art, frame: frameOf(art), yields: yieldsAt(form, 0),
      ...(cut ? { note: cut === grownStage ? t('砍倒长成的树后') : t('砍倒长到第 {day} 天以上的树后', { day: growthDay(cut[0]) }) } : {}),
    }];
  });

  const lanes = [lane(1, t('从种下到长成')), ...regrowth];
  return {
    crop: lite(crop),
    frame: frameOf(lanes.flatMap((row) => row.stages.flatMap((stage) => stage.art))),
    seasonal: Object.values(source).some((stages) => stages.some(([, , art]) => Array.isArray(art))),
    season: bearing.length < SEASONS.length ? bearing[0] ?? 0 : 0,
    bearing,
    lanes,
    grown: grownStage && Array.isArray(grownStage[2]) ? { art: grownStage[2], frame: frameOf(grownStage[2]) } : null,
    looks,
  };
}
