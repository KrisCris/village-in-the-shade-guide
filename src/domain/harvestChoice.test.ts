import {expect, it} from 'vitest';
import type {Catalog, Entity} from '../data/types';
import {getCatalog} from '../data/repository';
import {harvestOptions} from './harvestChoice';
import {buildEntityDetailModel} from './relations';
import {plannerPayload} from '../data/plannerPayload';

const catalog: Catalog = getCatalog();
const pea = catalog.entities.find(e => e.id === 'CROPS_ID_PEA')!;

it('offers 荷兰豆 before 豌豆 with their regrowth points and sale value per day', () => {
  expect(harvestOptions(pea, catalog, 'normal').map(o => [o.item.id, o.firstPoints, o.regrowPoints, o.perDay])).toEqual([
    ['ITEM_ID_CROPS_SNOW_PEAS', 960, 100, 15],
    ['ITEM_ID_CROPS_PEA', 1200, 200, 21],
  ]);
});

it('ignores crops that regrow into a single item', () => {
  const edamame = catalog.entities.find(e => e.id === 'CROPS_ID_EDAMAME')!;
  expect(harvestOptions(edamame, catalog, 'normal')).toEqual([]);
});

it('lists each 豌豆 output once with its stages and notes the early pick on 荷兰豆', () => {
  const rows = buildEntityDetailModel(pea, catalog, 'normal').groups.find(g => g.key === 'outputs')!.rows;
  expect(rows.map(row => [row.entity.id, row.chips])).toEqual([
    ['ITEM_ID_CROPS_SNOW_PEAS', ['种下后约 10 天（成长点 960）', '再生约 1 天一次（成长点 100）']],
    ['ITEM_ID_CROPS_PEA', ['种下后约 12 天（成长点 1200）', '再生约 2 天一次（成长点 200）']],
  ]);
  const noted = rows.filter(row => row.note);
  expect(noted.map(row => row.entity.id)).toEqual(['ITEM_ID_CROPS_SNOW_PEAS']);
  expect(noted[0].note).toContain('收豌豆更划算');
});

it('keeps harvest stages in the planner payload', () => {
  const small = plannerPayload(catalog).find((e: Entity) => e.id === 'CROPS_ID_PEA')!;
  const compact = {...catalog, byId: Object.fromEntries(plannerPayload(catalog).filter(e => e.kind === 'items').map(e => [e.id, e]))};
  expect(harvestOptions(small, compact, 'normal').map(o => o.item.id)).toEqual(['ITEM_ID_CROPS_SNOW_PEAS', 'ITEM_ID_CROPS_PEA']);
});

it('shows a stage quantity only when an item yields different amounts by stage', () => {
  const crop = {...pea, harvest_stages: [
    {state: 1, growth_points: 650, item_id: 'ITEM_ID_CROPS_PEA', quantity: 2},
    {state: 4, growth_points: 400, item_id: 'ITEM_ID_CROPS_PEA', quantity: 3},
  ]} as Entity;
  const row = buildEntityDetailModel(crop, catalog, 'normal').groups.find(g => g.key === 'outputs')!.rows[0];
  expect(row.chips).toEqual(['种下后约 7 天（成长点 650） ×2', '再生约 4 天一次（成长点 400） ×3']);
  expect(row.quantity).toBeUndefined();
});
