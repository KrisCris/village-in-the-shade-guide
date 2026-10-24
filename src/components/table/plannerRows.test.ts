import {expect, it} from 'vitest';
import type {CropProcessingResult} from '../../domain/cropProcessing';
import {canPlantAhead, firstDirection, groupPlannerRows, listedIn} from './plannerRows';
import {getCatalog} from '../../data/repository';

const option=(crop:string, process:string, netPerDay:number, finishDay:number)=>({crop:{id:crop,name:{zh_hans:crop}},process:{id:process},netPerDay,netPerSeed:netPerDay,finishDay,monthNet:netPerDay} as unknown as CropProcessingResult);

it('keeps each crop once, led by its best option, and orders crops by that option', () => {
  const rows=[option('a','x',10,30),option('b','y',20,40),option('a','z',30,20)];
  const groups=groupPlannerRows(rows,'netPerDay','desc','zh');
  expect(groups.map(group=>group.options.map(row=>row.process!.id))).toEqual([['z','x'],['y']]);
  expect(groupPlannerRows(rows,'finishDay','asc','zh').map(group=>group.options[0].process!.id)).toEqual(['z','y']);
});

it('starts sell-out time shortest first and money columns largest first', () => {
  expect([firstDirection('finishDay'),firstDirection('name'),firstDirection('netPerDay')]).toEqual(['asc','asc','desc']);
});

it('lists perennials in their bearing season and greenhouse trees in every season', () => {
  const catalog=getCatalog();
  const crop=(id:string)=>catalog.entities.find(e=>e.kind==='crops'&&e.id===id)!;
  const seasons=['spring','summer','autumn','winter'];
  expect(seasons.filter(season=>listedIn(crop('CROPS_ID_APPLE_TREE'),season))).toEqual(['autumn']);
  expect(seasons.filter(season=>listedIn(crop('CROPS_ID_MULBERRY'),season))).toEqual(['summer']);
  expect(seasons.filter(season=>listedIn(crop('CROPS_ID_BANANA_TREE'),season))).toEqual(seasons);
  expect(seasons.filter(season=>listedIn(crop('CROPS_ID_BLUEBERRY'),season))).toEqual(crop('CROPS_ID_BLUEBERRY').seasons);
});

it('plants perennials ahead except in the first spring of the game', () => {
  expect([canPlantAhead(1,'spring'),canPlantAhead(1,'summer'),canPlantAhead(2,'spring')]).toEqual([false,true,true]);
});
