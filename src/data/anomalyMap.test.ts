import { describe, expect, it } from 'vitest';
import { MINIMAP_SIZE, mapFrame, mapPins } from './anomalyMap';

const projection = { offset_x: 0, offset_y: 0, scale_divisor: 1 };

describe('anomaly map crop', () => {
  it('pads a single point to a landscape frame of the minimum width', () => {
    const frame = mapFrame([{ x: 2000, y: 2000 }]);
    expect(frame.width).toBe(380);
    expect(frame.width / frame.height).toBeGreaterThanOrEqual(1);
    expect(frame.width / frame.height).toBeLessThanOrEqual(16 / 9 + 0.01);
    expect(frame.x).toBeLessThan(2000);
    expect(frame.x + frame.width).toBeGreaterThan(2000);
  });

  it('widens tall groups and stays inside the image', () => {
    const tall = mapFrame([{ x: 100, y: 100 }, { x: 120, y: 2000 }]);
    expect(tall.width).toBeGreaterThanOrEqual(tall.height);
    expect(tall.x).toBe(0);
    const edge = mapFrame([{ x: MINIMAP_SIZE - 5, y: MINIMAP_SIZE - 5 }]);
    expect(edge.x + edge.width).toBeLessThanOrEqual(MINIMAP_SIZE);
    expect(edge.y + edge.height).toBeLessThanOrEqual(MINIMAP_SIZE);
  });

  it('places pins in percent and continues numbering across layers', () => {
    const { pins } = mapPins([
      { label: 'a', color: '#fff', shape: 'number', points: [{ x: 1000, y: 1000 }, { x: 1300, y: 1100 }] },
      { label: 'b', color: '#000', shape: 'number', points: [{ x: 1100, y: 1200 }], start: 3 },
      { label: 'c', color: '#000', shape: 'dot', points: [{ x: 1200, y: 1000 }] },
    ], projection);
    expect(pins.map((p) => p.text)).toEqual(['1', '2', '3', undefined]);
    for (const pin of pins) {
      expect(pin.left).toBeGreaterThan(0);
      expect(pin.left).toBeLessThan(100);
      expect(pin.top).toBeGreaterThan(0);
      expect(pin.top).toBeLessThan(100);
    }
  });
});

describe('anomaly map areas', () => {
  const area = { label: 'area', color: '#f00', shape: 'area' as const, size: 100, points: [{ x: 1000, y: 1000 }, { x: 1100, y: 1000 }, { x: 1300, y: 1000 }, { x: 1000, y: 1100 }] };

  it('frames the far edges of the squares and draws no pins', () => {
    const { frame, pins, regions } = mapPins([area], projection);
    expect(pins).toEqual([]);
    expect(frame.x).toBeLessThanOrEqual(1000);
    expect(frame.x + frame.width).toBeGreaterThanOrEqual(1400);
    expect(frame.y + frame.height).toBeGreaterThanOrEqual(1200);
    expect(regions).toHaveLength(1);
  });

  it('merges touching squares in a row into one rectangle', () => {
    const { regions } = mapPins([area], projection);
    expect(regions[0].path.match(/M/g)).toHaveLength(3);
    expect(regions[0].color).toBe('#f00');
  });

  it('keeps pins of other layers beside the areas', () => {
    const { pins, regions } = mapPins([area, { label: 'gate', color: '#fff', shape: 'square', points: [{ x: 1050, y: 1050 }] }], projection);
    expect(pins).toHaveLength(1);
    expect(regions).toHaveLength(1);
  });
});
