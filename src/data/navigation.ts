import {kindLabels, primaryKinds} from './types';
import {msg} from '../i18n/translate';

// Shared by the database landing page and sidebar so their entries stay aligned.
// Labels are translation keys; pages pass them through t().
export const databaseLinks = [
  ...primaryKinds.filter(kind => kind !== 'items').map(kind => ({
    kind, label: kindLabels[kind], href: `/data/${kind}/`,
  })),
  {kind: 'items', label: msg('物品分类'), href: '/categories/'},
  {kind: 'items', label: msg('全部物品'), href: '/data/items/'},
];

export const plannerLinks = [
  {label: msg('收益规划'), href: '/planner/'},
  {label: msg('每日规划'), href: '/planner/today/'},
  {label: msg('生产工作流'), href: '/planner/workflow/'},
];

export interface GuideLink {
  /** Card title on /guides/. */
  title: string;
  /** Shorter sidebar label; defaults to the title. */
  label?: string;
  /** One line under the title on guide cards. */
  description: string;
  href: string;
  /** An item category, or one item ID when the category's first icon does not fit. */
  icon: string;
}

/** The current patch guide sits above the topic groups. */
export const patchGuide: GuideLink = {title: msg('1.30 更新：生日、播种机与卫浴设备'), label: msg('1.30 新内容'), description: msg('主角生日、播种机和卫浴设备怎样解锁'), href: '/guides/patch-1-30/', icon: 'ITEM_ID_BIRTHDAY_CAKE'};

// Every written guide, shared by the sidebar, /guides/, the home page and the
// related-guide links so none of them can drop one.
export const guideGroups: Array<{id: string; label: string; guides: GuideLink[]}> = [
  {id: 'farming', label: msg('农务与生产'), guides: [
    {title: msg('四季留货与交付'), label: msg('四季留货规划'), description: msg('每季供奉和交付目录要留多少货'), href: '/guides/season-plan/', icon: 'CROPS'},
    {title: msg('种植加工收益排行'), description: msg('按每天收益比较作物和加工品'), href: '/planner/', icon: 'PROCESSED_PRODUCT'},
    {title: msg('播种、跨季与菌类'), label: msg('播种与菌类'), description: msg('每季种什么，毛豆、稻米和果树怎么安排'), href: '/guides/cultivation-plan/', icon: 'SEEDING'},
    {title: msg('料理材料与食谱'), label: msg('料理与食谱'), description: msg('配方用料和可以替换的材料'), href: '/guides/cooking-plan/', icon: 'COOKING'},
    {title: msg('家畜解锁、品评会与产物'), label: msg('家畜与品评会'), description: msg('家畜什么时候能买、怎么照料、产什么'), href: '/guides/livestock-plan/', icon: 'ITEM_ID_LIVESTOCK_COW_NORMAL'},
    {title: msg('建筑、扩地与温室'), label: msg('建筑与扩地'), description: msg('向木助订的扩地、改建、温室和养鱼池'), href: '/guides/buildings/', icon: 'ITEM_ID_BUNDLE_REWARD_08'},
  ]},
  {id: 'gathering', label: msg('钓鱼、采石与狩猎'), guides: [
    {title: msg('四季钓点与留货'), label: msg('四季钓点'), description: msg('每个钓点各时段的鱼、上钩概率和交付要留的鱼'), href: '/guides/fishing-spots/', icon: 'FISH'},
    {title: msg('采石场掉落分布'), description: msg('每层石头掉什么、概率多少'), href: '/guides/quarry/', icon: 'ORE'},
    {title: msg('狩猎执照与材料'), label: msg('狩猎'), description: msg('执照预算、狩猎证明报酬和狩猎工具'), href: '/guides/hunting-plan/', icon: 'HUNTING_LICENSE'},
  ]},
  {id: 'village', label: msg('推进与村民'), guides: [
    {title: msg('帮忙券与主线推进'), label: msg('帮忙券与主线'), description: msg('帮忙券任务和道路开放顺序'), href: '/guides/progression/', icon: 'FARM_TOOL'},
    {title: msg('生日、送礼与食谱传授'), label: msg('生日与送礼'), description: msg('村民生日、喜好和传授的食谱'), href: '/guides/residents/', icon: 'FLOWER'},
    {title: msg('祠堂能力与配方解锁'), label: msg('祠堂能力'), description: msg('祠堂能力树、学习材料和解锁的配方'), href: '/guides/skills/', icon: 'MACHINE'},
    {title: msg('服装与装饰获取'), label: msg('服装与装饰'), description: msg('服装、饰品和发型从哪里拿'), href: '/guides/appearance/', icon: 'CLOTHES'},
  ]},
  {id: 'night', label: msg('夜间探索'), guides: [
    {title: msg('夜间收集地图'), description: msg('遗失图书、机械部件、玉手箱和狐狸神社的位置'), href: '/guides/collection-map/', icon: 'CURSE'},
    {title: msg('夜间交换与勾玉'), description: msg('交换怪异要的物品和换到的勾玉'), href: '/guides/night-preparation/', icon: 'KEYITEM'},
    {title: msg('咒物与心、活力上限'), label: msg('咒物与上限'), description: msg('在龙神渊和狐狸神社提高心和活力上限'), href: '/guides/cursed-items/', icon: 'ITEM_ID_CURSED_HEART_SCALE'},
    {title: msg('怪异出现条件与对策'), label: msg('怪异'), description: msg('深夜怪异的出现条件、解决方法和奖励'), href: '/guides/anomalies/', icon: 'ITEM_ID_CURSED_TENGU_MODE'},
    {title: msg('深夜出没的妖怪'), description: msg('深夜妖怪的出现范围、伤害和躲法'), href: '/guides/night-monsters/', icon: 'ITEM_ID_CURSED_RED_CANDLE'},
  ]},
];

export const allGuides = [patchGuide, ...guideGroups.flatMap(group => group.guides)];

/** The topic group a guide page belongs to, for its related-guide links. */
export function guideGroupOf(path: string) {
  return guideGroups.find(group => group.guides.some(guide => guide.href === path));
}

/** Top-level sections. The header shows them as tabs; the sidebar lists the current one in full. */
export const sections = [
  {id: 'database', label: msg('资料库'), href: '/data/', paths: ['/data/', '/categories/']},
  {id: 'planner', label: msg('规划'), href: '/planner/', paths: ['/planner/']},
  {id: 'guides', label: msg('攻略'), href: '/guides/', paths: ['/guides/']},
] as const;
export type SectionId = (typeof sections)[number]['id'];

/** The section a page belongs to; search and the save editor belong to none. */
export function currentSection(path: string): SectionId | undefined {
  return sections.find(section => section.paths.some(prefix => path.startsWith(prefix)))?.id;
}

/** The sidebar link to highlight: the longest href the page path starts with. */
export function currentLink(path: string, hrefs: string[]) {
  return hrefs.filter(href => path.startsWith(href)).sort((a, b) => b.length - a.length)[0];
}

type CatalogEntity = {id: string; kind: string; category_id?: string | null; icon_path?: string | null};
/** Icon for a guide card: the item with that ID, or the first item with an icon in that category. */
export function guideIcon(entities: CatalogEntity[], key: string) {
  const items = entities.filter(entity => entity.kind === 'items');
  return (key.startsWith('ITEM_ID_') ? items.find(entity => entity.id === key) : items.find(entity => entity.category_id === `ITEM_CATEGORY_${key}` && entity.icon_path))?.icon_path ?? undefined;
}
