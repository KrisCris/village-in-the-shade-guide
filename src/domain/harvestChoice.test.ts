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

it('notes the early pick only on the first 荷兰豆 output of the 豌豆 page', () => {
  const rows = buildEntityDetailModel(pea, catalog, 'normal').groups.find(g => g.key === 'outputs')!.rows;
  const noted = rows.filter(row => row.note);
  expect(noted.map(row => row.key)).toEqual(['outputs:1:960:ITEM_ID_CROPS_SNOW_PEAS:3']);
  expect(noted[0].note).toContain('只看卖出价时收豌豆更划算');
});

it('keeps harvest stages in the planner payload', () => {
  const small = plannerPayload(catalog).find((e: Entity) => e.id === 'CROPS_ID_PEA')!;
  const compact = {...catalog, byId: Object.fromEntries(plannerPayload(catalog).filter(e => e.kind === 'items').map(e => [e.id, e]))};
  expect(harvestOptions(small, compact, 'normal').map(o => o.item.id)).toEqual(['ITEM_ID_CROPS_SNOW_PEAS', 'ITEM_ID_CROPS_PEA']);
});
