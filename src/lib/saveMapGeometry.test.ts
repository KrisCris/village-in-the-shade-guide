import { describe, expect, it } from 'vitest';
import { fromGrid, inSelection, selectionPolygon, footprint, polygonsOverlap } from './saveMapGeometry';

describe('isometric editing geometry', () => {
  it('selects a rectangle in field coordinates, rather than the screen bounding box', () => {
    const a=fromGrid({x:2,y:3}), b=fromGrid({x:5,y:7});
    expect(selectionPolygon(a,b)).toEqual([a,fromGrid({x:5,y:3}),b,fromGrid({x:2,y:7})]);
    expect(inSelection(fromGrid({x:4,y:6}),a,b)).toBe(true);
    expect(inSelection(fromGrid({x:1,y:6}),a,b)).toBe(false);
    expect(inSelection(fromGrid({x:4,y:6}),b,a)).toBe(true);
  });
  it('allows adjacent single-cell machines to share an edge, but rejects overlap', () => {
    const shape=(x:number,y:number)=>footprint({shapes:{}},{x,y})[0];
    expect(polygonsOverlap(shape(0,0),shape(45,45))).toBe(false);
    expect(polygonsOverlap(shape(0,0),shape(-45,45))).toBe(false);
    expect(polygonsOverlap(shape(0,0),shape(20,20))).toBe(true);
    expect(polygonsOverlap(shape(0,0),shape(0,0))).toBe(true);
  });
});
