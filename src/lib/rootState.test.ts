import {expect,it} from 'vitest';
import {carryRootState} from './rootState';
it('carries the live season and preferences onto the incoming page',()=>{
  const incoming:DOMStringMap={season:'spring',lang:'zh-CN'};
  carryRootState({season:'autumn',seasonPreference:'auto',theme:'night',particles:'off',seasonSwap:''},incoming);
  expect(incoming).toEqual({season:'autumn',seasonPreference:'auto',theme:'night',particles:'off',lang:'zh-CN'});
});
it('leaves the incoming value when the live page has none',()=>{
  const incoming:DOMStringMap={season:'spring'};
  carryRootState({},incoming);
  expect(incoming).toEqual({season:'spring'});
});
