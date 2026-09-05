import type {Entity} from './types';

/** List-only payload. The drawer resolves the full entity by ID on demand. */
export function compactItemRow(item:Entity):Entity {
 const fields=['id','kind','searchText','icon_path','category_id','category_numeric_id','buy_price','sell_price','quality_eligible','duration_minutes','duration_max_minutes','growth_days','regrow_days','profit_per_day','cultivation_method','harvest_names'];
 return {
  ...Object.fromEntries(fields.filter(key=>item[key]!==undefined).map(key=>[key,item[key]])),
  id:item.id,kind:item.kind,searchText:item.searchText,
  name:{...item.name,aliases:[]},
  ...(item.category_name?{category_name:{...item.category_name,aliases:[]}}:{}),
 };
}
