export type Name = {
  zh_hans: string;
  zh_hant: string;
  ja: string;
  internal: string;
  aliases: string[];
  review_status: string;
};

export type Entity = Record<string, unknown> & {
  id: string;
  kind: string;
  name: Name;
  buy_price?: number | null;
  sell_price?: number | null;
  searchText: string;
};

export type Catalog = {
  buildId: string;
  generatedAt: string;
  entities: Entity[];
  byId: Record<string, Entity>;
  counts: Record<string, number>;
};

export const kindLabels: Record<string, string> = {
  items: '全部物品', crops: '作物', machines: '机械', processes: '加工',
  'craft-recipes': '制作配方', 'cooking-recipes': '料理', 'store-offers': '商店商品',
  characters: '角色', fish: '鱼类', livestock: '动物', facilities: '设施',
  'facility-releases': '设施解锁', quests: '委托', collectibles: '收集品',
  'hunt-rewards': '狩猎', weather: '天气',
};

export const primaryKinds = ['crops', 'machines', 'processes', 'cooking-recipes', 'fish', 'characters', 'items'];
