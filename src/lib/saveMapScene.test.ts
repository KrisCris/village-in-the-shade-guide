import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeSave } from './saveEditor';
import { parseSaveModel } from './saveModel';
import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import {
  buildFarmScene,
  cropSequence,
  FARM_CELLS,
  FARM_REGIONS,
  FARM_SCENE,
  fitCamera,
  pickFarmCell,
  screenToWorld,
  worldToScreen,
  zoomCamera,
  type MapArt
} from './saveMapScene';

describe('farm viewport geometry', () => {
  it('keeps the cursor world position unchanged when zooming', () => {
    const camera = fitCamera([8100, 19300, 13600, 26600], 1200, 800),
      cursor = { x: 173, y: 592 };
    const before = screenToWorld(cursor, camera, 1200, 800),
      after = screenToWorld(cursor, zoomCamera(camera, 2, cursor, 1200, 800), 1200, 800);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(worldToScreen(before, camera, 1200, 800)).toEqual(cursor);
  });
  it('picks the native diamond cell without rotating the ground a second time', () => {
    for (const c of FARM_CELLS) {
      expect(pickFarmCell(c)?.id).toBe(c.id);
      expect(pickFarmCell({ x: c.x + 20, y: c.y + 20 })?.id).toBe(c.id);
    }
    expect(pickFarmCell({ x: 0, y: 0 })).toBeUndefined();
    expect(FARM_REGIONS.map((r) => r.id)).toEqual([1, 2, 4, 8]);
  });
  it('uses growth thresholds within each normal, regrowing or stump state', () => {
    const entity = {
      model: 'test',
      seasons: [],
      states: {
        1: [
          [0, 10],
          [100, 20],
          [500, 60]
        ],
        6: [[0, 540]]
      }
    };
    expect(cropSequence(entity, 1, 99)).toBe(10);
    expect(cropSequence(entity, 1, 100)).toBe(20);
    expect(cropSequence(entity, 6, 1000)).toBe(540);
    expect(cropSequence(entity, 1, 0, true)).toBe(60);
  });
});

describe.skipIf(!hasPrivateSaveFixtures)('native farm scene from a save copy', () => {
  const model = () =>
    parseSaveModel(decodeSave(new Uint8Array(readFileSync('tests/gamesave/save.004')), 'copy'));
  const art = () => JSON.parse(readFileSync('public/maps/farm/manifest.json', 'utf8')) as MapArt;
  it('provides scene artwork for saved crops, houses and facilities', () => {
    const scene = buildFarmScene(model().doc, {}, art(), 3);
    expect(scene.length).toBeGreaterThan(500);
    expect(scene.filter((s) => !s.art).map((s) => `${s.kind}:${s.id}`)).toEqual([]);
    expect(scene.some((s) => s.art!.w > 800)).toBe(true);
  });
  it('removes a cleared crop and renders a newly planted seed using the same stable cell ID', () => {
    const doc = model().doc,
      assets = art(),
      before = buildFarmScene(doc, {}, assets, 3),
      crop = before.find((s) => s.kind === 'crop' && FARM_CELLS.some((c) => c.id === s.cell))!;
    const cleared = buildFarmScene(
      doc,
      { cells: { [`${FARM_SCENE}:${crop.cell}`]: { crop: null } } },
      assets,
      3
    );
    expect(cleared.some((s) => s.key === crop.key)).toBe(false);
    const planted = buildFarmScene(
      doc,
      { cells: { [`${FARM_SCENE}:${crop.cell}`]: { crop: 1 } } },
      assets,
      3
    ).find((s) => s.key === crop.key)!;
    expect(planted.art).toEqual(assets.crops[1].seasons[3][cropSequence(assets.crops[1], 1, 0)!]);
  });
});
