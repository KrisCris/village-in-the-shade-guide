import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import type {Catalog} from '../data/types';
import {getCatalog} from '../data/repository';
import {buildCropGrowthModel, cropForEntity} from './cropGrowth';
import {buildEntityDetailModel} from './relations';
import {compactDetailModel} from '../data/detailPayload';
import EntityDetail from '../components/entity/EntityDetail';

const catalog: Catalog = getCatalog();
const byId = (id: string) => catalog.byId[id];
const growth = (id: string) => buildCropGrowthModel(byId(id), catalog)!;
const stageRows = (id: string) => growth(id).lanes.map(lane => [lane.title, lane.stages.map(stage => [stage.label, stage.gain])]);

it('gives every plantable crop stage art whose days match its growth and regrowth days', () => {
  const plantable = catalog.entities.filter(e => e.kind === 'crops' && ((e.seed_item_ids ?? []) as string[]).length);
  expect(plantable).toHaveLength(79);
  for (const crop of plantable) {
    const model = buildCropGrowthModel(crop, catalog);
    expect(model, crop.id).not.toBeNull();
    expect(model!.lanes[0].days, crop.id).toBe(crop.growth_days);
    if (typeof crop.regrow_days === 'number') expect(model!.lanes.at(-1)!.days, crop.id).toBe(crop.regrow_days);
    for (const lane of model!.lanes) for (const stage of lane.stages) expect(stage.art.length, crop.id).toBeGreaterThan(0);
  }
});

it('counts days between stages at 100 growth points a day and marks stages reached the same day', () => {
  expect(stageRows('CROPS_ID_ASPARAGUS')).toEqual([
    ['从种下到长成', [['种下', 0], ['第 1 天', 1], ['第 3 天', 2], ['第 5 天', 2], ['第 7 天', 2], ['第 9 天', 2]]],
    ['收获芦笋后', [['收获后', 0], ['第 1 天', 1], ['第 4 天', 3]]],
  ]);
  // 大头菜 passes 320 and 400 points on the same fourth day.
  expect(growth('CROPS_ID_TURNIP').lanes[0].stages.slice(-2).map(stage => [stage.points, stage.day, stage.gain])).toEqual([[320, 4, 1], [400, 4, 0]]);
});

it('names each regrowth by the harvest that starts it and shows what each stage yields', () => {
  const pea = growth('CROPS_ID_PEA');
  expect(pea.lanes.map(lane => [lane.title, lane.days])).toEqual([['从种下到长成', 12], ['收获荷兰豆后', 2], ['收获豌豆后', 2]]);
  expect(pea.lanes[0].stages.filter(stage => stage.yields.length).map(stage => [stage.day, stage.yields.map(row => [row.name, row.quantity])]))
    .toEqual([[10, [['荷兰豆', 3]]], [12, [['豌豆', 3]]]]);
  const edamame = growth('CROPS_ID_EDAMAME');
  expect(edamame.lanes[0].stages[1].yields.map(row => row.name)).toEqual(['豆芽菜']);
  expect(edamame.looks.map(look => [look.title, look.yields.map(row => `${row.name} ×${row.quantity}`)])).toEqual([
    ['枯萎后仍可收获', ['黄豆 ×6']], ['枯萎', []], ['异变', ['被诅咒的黄豆 ×1']],
  ]);
});

it('shows a fruit tree in all four seasons, starting with the season it bears in', () => {
  const apple = growth('CROPS_ID_APPLE_TREE');
  expect(apple.seasonal).toBe(true);
  expect([apple.season, apple.bearing]).toEqual([2, [2]]);
  expect(apple.grown!.art).toHaveLength(4);
  expect(new Set(apple.grown!.art.map(sprite => sprite.file)).size).toBe(4);
  const grown = apple.lanes[0].stages.at(-1)!;
  expect([grown.label, grown.yields.map(row => row.name), grown.note]).toEqual(['第 12 天', ['苹果'], '秋季结果']);
  expect(apple.looks.map(look => [look.title, look.note])).toEqual([['树桩', '砍倒长到第 8 天以上的树后'], ['树桩', '砍倒长成的树后']]);
  // Greenhouse trees look the same all year.
  const banana = growth('CROPS_ID_BANANA_TREE');
  expect([banana.seasonal, banana.grown, banana.lanes[0].stages.at(-1)!.note]).toEqual([false, null, '只能种在温室里，四季都结果']);
});

it('shows a shrub grown at the start of its season and its look out of season', () => {
  const tea = growth('CROPS_ID_TEA_TREE');
  expect(tea.lanes.map(lane => [lane.title, lane.days])).toEqual([['从种下到长成', 10], ['收获茶叶后', 2]]);
  expect(tea.looks.map(look => [look.title, look.yields.map(row => row.name)])).toEqual([['结果季开始时', ['茶叶']], ['不在结果季时', []], ['枯萎', []]]);
});

it('finds the crop from its seed and leaves other items alone', () => {
  const seed = byId('ITEM_ID_SEED_APPLE');
  expect(cropForEntity(seed, catalog)?.id).toBe('CROPS_ID_APPLE_TREE');
  expect(buildCropGrowthModel(seed, catalog)?.crop.name).toBe('苹果树');
  expect(buildCropGrowthModel(byId('ITEM_ID_CROPS_APPLE'), catalog)).toBeNull();
  expect(buildEntityDetailModel(byId('ITEM_ID_CROPS_APPLE'), catalog, 'normal').growth).toBeNull();
});

it('renders the stages on a seed page with a link to its crop', () => {
  const model = compactDetailModel(buildEntityDetailModel(byId('ITEM_ID_SEED_APPLE'), catalog, 'normal'));
  const html = renderToStaticMarkup(<EntityDetail model={model} />);
  expect(html).toContain('<h2>生长过程</h2>');
  expect(html).toContain('href="/data/crops/CROPS_ID_APPLE_TREE/"');
  expect(html).toContain('长成后的样子');
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  expect(html).toMatch(/aria-pressed="true">(?:(?!<\/button>).)*growth-season-name">秋/);
  expect(html).toContain('/maps/farm/sprites/');
});
