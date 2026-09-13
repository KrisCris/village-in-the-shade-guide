import {expect,it} from 'vitest';
import {MAP_HOME,zoomMap,clampMap} from './mapViewport';
it('zooms around the pointer and limits zoom',()=>{
  const next=zoomMap(MAP_HOME,.5,.25,.75);
  expect(next.x+next.width*.25).toBe(MAP_HOME.x+MAP_HOME.width*.25);
  expect(next.y+next.height*.75).toBe(MAP_HOME.y+MAP_HOME.height*.75);
  expect(zoomMap(MAP_HOME,50)).toEqual(MAP_HOME);
  expect(zoomMap(MAP_HOME,.001).width).toBe(MAP_HOME.width/6);
});
it('keeps the view inside the map',()=>{
  const next=clampMap({...zoomMap(MAP_HOME,.5),x:-999,y:99999});
  expect(next.x).toBe(MAP_HOME.x);expect(next.y+next.height).toBe(MAP_HOME.y+MAP_HOME.height);
});
