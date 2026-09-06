import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {defaultFace,animationTime,poseOptions,type Model} from './portraitData';
import {portraits} from './portraitCatalog';
const read=(id:string)=>JSON.parse(readFileSync(`public/art/portraits/${id}.json`,'utf8')) as Model;
it('resolves every selected homepage body and expression in its native resource',()=>{
  for(const portrait of portraits){const model=read(portrait.resource),ids=model.animations.map(a=>a[0]&65535);
    expect(ids,portrait.name).toContain(portrait.pose);expect(ids,portrait.name).toContain(portrait.face);
  }
});
it('chooses a documented shouting expression rather than normal for the woodcutter shout',()=>{
  expect(defaultFace(read('BU_0040'),11)).toBe(1200);
});
it('keeps hatless injured face layers compatible with the vendor body',()=>{
  expect(defaultFace(read('BU_0150'),21)).toBe(1370);
  expect(defaultFace(read('BU_0150'),23)).toBe(1590);
});
it('does not offer the girls parrot accessory animations as body poses',()=>{
  expect(poseOptions(read('BU_0110'))).not.toContain(100);
  expect(poseOptions(read('BU_0110'))).toContain(10);
});
it('allows a long expression to progress beyond a shorter body cycle',()=>{
  expect(animationTime(250,200)).toBe(50);
  expect(animationTime(250,800)).toBe(250);
  expect(animationTime(-20,800)).toBe(780);
});
