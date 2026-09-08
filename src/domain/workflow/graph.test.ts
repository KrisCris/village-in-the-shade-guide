import {expect,it} from 'vitest';
import {canConnect} from './graph';
import {entities,node} from './test-helpers';
it('allows only useful item flow and rejects duplicate/self/sink/source edges',()=>{
 const nodes=[node('a','inventory',{itemId:'seed'}),node('b','plant',{cropId:'crop'}),node('c','sale',{itemId:'crop-item'}),node('d','process',{recipeId:'recipe'})];
 expect(canConnect(nodes,[],'a','b',entities)).toBe(true);
 expect(canConnect(nodes,[],'b','c',entities)).toBe(true);
 for(const [a,b] of [['a','a'],['a','c'],['b','a'],['c','b'],['b','d']])expect(canConnect(nodes,[],a,b,entities)).toBe(false);
 expect(canConnect(nodes,[{id:'e',source:'a',target:'b'}],'a','b',entities)).toBe(false);
});
it('rejects an item-compatible cycle',()=>{
 const es=[...entities,{...entities.find(e=>e.id==='recipe')!,id:'loop',inputs:[{item_id:'bacon',quantity:1}]}];
 const nodes=[node('a','process',{recipeId:'loop'}),node('b','process',{recipeId:'loop'})];
 expect(canConnect(nodes,[{id:'e',source:'a',target:'b'}],'b','a',es)).toBe(false);
});
