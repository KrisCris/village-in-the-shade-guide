import {expect,it} from 'vitest';
import {listSceneProgress, listSceneFrame} from './listScene';

it('uses the complete result count, not the number of rows loaded so far',()=>{
  expect(listSceneProgress(25, .5, 100)).toBe(.255);
  expect(listSceneProgress(50, 0, 100)).toBe(.5);
  expect(listSceneProgress(99, 1, 100)).toBe(1);
});
it('cycles long lists at a capped interval, blending winter back into spring',()=>{
  expect(listSceneFrame(50,0,2856)).toEqual({from:1,to:2,mix:0});
  expect(listSceneFrame(175,0,2856)).toEqual({from:3,to:0,mix:.5});
  expect(listSceneFrame(200,0,2856)).toEqual({from:0,to:1,mix:0});
});
it('takes short lists from spring to winter once',()=>{
  expect(listSceneFrame(0,0,50)).toEqual({from:0,to:1,mix:0});
  expect(listSceneFrame(49,1,50)).toEqual({from:3,to:3,mix:0});
  expect(listSceneFrame(799,1,800)).toEqual({from:3,to:3,mix:0});
  expect(listSceneFrame(200,0,801)).toEqual({from:0,to:1,mix:0});
});
it('clamps outside the list and handles empty results',()=>{
  expect(listSceneProgress(0, -2, 100)).toBe(0);
  expect(listSceneProgress(120, 1, 100)).toBe(1);
  expect(listSceneProgress(0, 0, 0)).toBe(0);
});
