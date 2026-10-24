import {expect, it} from 'vitest';
import type {CropProcessingResult} from '../../domain/cropProcessing';
import {firstDirection, groupPlannerRows} from './plannerRows';

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
