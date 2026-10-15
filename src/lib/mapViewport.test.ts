import {expect,it} from 'vitest';
import {MAP_HOME,zoomMap,clampMap,focusMap,panZoomMap,screenToMap} from './mapViewport';
it('centers a marker and only zooms in',()=>{
  const point={x:1800,y:2000};
  const next=focusMap(MAP_HOME,point.x,point.y);
  expect(next.width).toBeCloseTo(MAP_HOME.width/3);
  expect(next.x+next.width/2).toBeCloseTo(point.x);
  expect(next.y+next.height/2).toBeCloseTo(point.y);
  const closer=zoomMap(next,.5);
  expect(focusMap(closer,point.x,point.y).width).toBe(closer.width);
  const corner=focusMap(MAP_HOME,MAP_HOME.x,MAP_HOME.y);
  expect([corner.x,corner.y]).toEqual([MAP_HOME.x,MAP_HOME.y]);
});
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
it('keeps the pinched map point under the fingers on a letterboxed stage',()=>{
  const size={width:900,height:600},start=zoomMap(MAP_HOME,.5);
  const from={x:300,y:250},to={x:340,y:260};
  const anchor=screenToMap(start,size,from);
  const next=panZoomMap(start,size,from,to,.8);
  expect(next.width).toBeCloseTo(start.width*.8);
  const after=screenToMap(next,size,to);
  expect(after.x).toBeCloseTo(anchor.x);expect(after.y).toBeCloseTo(anchor.y);
  // Two moves in one frame compose from the latest view, not the rendered one.
  const twice=panZoomMap(next,size,to,{x:360,y:280},.9);
  expect(screenToMap(twice,size,{x:360,y:280}).x).toBeCloseTo(anchor.x);
  expect(panZoomMap(MAP_HOME,size,from,from,1)).toEqual(MAP_HOME);
});
