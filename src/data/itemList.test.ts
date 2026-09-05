import {expect,it} from 'vitest';
import {compactItemRow} from './itemList';
import type {Entity} from './types';
it('keeps full-list search and price data without shipping detail records',()=>{
 const item={id:'rice',kind:'items',name:{zh_hans:'稻米',zh_hant:'稻米',ja:'お米',internal:'rice',aliases:['daomi','dm'],review_status:'game'},searchText:'稻米 daomi dm',sell_price:67,quality_eligible:true,description:'long detail',map_locations:[{x:1,y:2}]} satisfies Entity;
 const row=compactItemRow(item);
 expect(row.searchText).toContain('daomi');
 expect(row.sell_price).toBe(67);
 expect(row.quality_eligible).toBe(true);
 expect(row.description).toBeUndefined();
 expect(row.map_locations).toBeUndefined();
 expect(row.name.aliases).toEqual([]);
});
