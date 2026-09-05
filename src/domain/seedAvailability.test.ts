import {expect,it} from 'vitest';
import {seedAvailability} from './seedAvailability';
import type {Entity} from '../data/types';
const name={zh_hans:'测试',zh_hant:'測試',ja:'',internal:'test',aliases:[],review_status:'test'};
const crop:Entity={id:'crop',kind:'crops',name,searchText:'测试',seed_item_ids:['seed']};
const offer:Entity={id:'offer',name,searchText:'测试',kind:'store-offers',item_id:'seed',seasons:['autumn'],required_flags:[526],conditions:['第二年秋起'],location:'田上杂货店'};
it('requires both the release year and sale season',()=>{
 expect(seedAvailability(crop,[offer],1,'autumn').available).toBe(false);
 expect(seedAvailability(crop,[offer],2,'autumn').available).toBe(true);
 expect(seedAvailability(crop,[offer],3,'spring').available).toBe(false);
});
it('keeps additional unlock conditions visible and does not invent missing shop stock',()=>{
 expect(seedAvailability(crop,[{...offer,required_flags:[526,534],conditions:['第二年秋起','温室建筑解锁后']}],2,'autumn').conditions).toContain('温室建筑解锁后');
 expect(seedAvailability(crop,[],3,'autumn').available).toBe(false);
});
