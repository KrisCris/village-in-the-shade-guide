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
  href: string;
  /** An item category, or one item ID when the category's first icon does not fit. */
  icon: string;
}

/** The current patch guide sits above the topic groups. */
export const patchGuide: GuideLink = {title: msg('1.30 更新：生日、播种机与卫浴设备'), label: msg('1.30 新内容'), href: '/guides/patch-1-30/', icon: 'ITEM_ID_BIRTHDAY_CAKE'};

// Every written guide, shared by the sidebar and /guides/ so neither can drop one.
export const guideGroups: Array<{id: string; label: string; guides: GuideLink[]}> = [
  {id: 'farming', label: msg('农务与生产'), guides: [
    {title: msg('四季留货与交付'), label: msg('四季留货规划'), href: '/guides/season-plan/', icon: 'CROPS'},
    {title: msg('种植加工收益排行'), href: '/planner/', icon: 'PROCESSED_PRODUCT'},
    {title: msg('播种、跨季与菌类'), label: msg('播种与菌类'), href: '/guides/cultivation-plan/', icon: 'SEEDING'},
    {title: msg('料理材料与食谱'), label: msg('料理与食谱'), href: '/guides/cooking-plan/', icon: 'COOKING'},
    {title: msg('家畜解锁、品评会与产物'), label: msg('家畜与品评会'), href: '/guides/livestock-plan/', icon: 'ITEM_ID_LIVESTOCK_COW_NORMAL'},
    {title: msg('建筑、扩地与温室'), label: msg('建筑与扩地'), href: '/guides/buildings/', icon: 'ITEM_ID_BUNDLE_REWARD_08'},
  ]},
  {id: 'gathering', label: msg('钓鱼、采石与狩猎'), guides: [
    {title: msg('四季钓点与留货'), label: msg('四季钓点'), href: '/guides/fishing-spots/', icon: 'FISH'},
    {title: msg('采石场掉落分布'), href: '/guides/quarry/', icon: 'ORE'},
    {title: msg('狩猎执照与材料'), label: msg('狩猎'), href: '/guides/hunting-plan/', icon: 'HUNTING_LICENSE'},
  ]},
  {id: 'village', label: msg('推进与村民'), guides: [
    {title: msg('帮忙券与主线推进'), label: msg('帮忙券与主线'), href: '/guides/progression/', icon: 'FARM_TOOL'},
    {title: msg('生日、送礼与食谱传授'), label: msg('生日与送礼'), href: '/guides/residents/', icon: 'FLOWER'},
    {title: msg('祠堂能力与配方解锁'), label: msg('祠堂能力'), href: '/guides/skills/', icon: 'MACHINE'},
    {title: msg('服装与装饰获取'), label: msg('服装与装饰'), href: '/guides/appearance/', icon: 'CLOTHES'},
  ]},
  {id: 'night', label: msg('夜间探索'), guides: [
    {title: msg('夜间收集地图'), href: '/guides/collection-map/', icon: 'CURSE'},
    {title: msg('夜间交换与勾玉'), href: '/guides/night-preparation/', icon: 'KEYITEM'},
    {title: msg('咒物与心、活力上限'), label: msg('咒物与上限'), href: '/guides/cursed-items/', icon: 'ITEM_ID_CURSED_HEART_SCALE'},
    {title: msg('怪异出现条件与对策'), label: msg('怪异'), href: '/guides/anomalies/', icon: 'ITEM_ID_CURSED_TENGU_MODE'},
    {title: msg('深夜出没的妖怪'), href: '/guides/night-monsters/', icon: 'ITEM_ID_CURSED_RED_CANDLE'},
  ]},
];

/** The sidebar link to highlight: the longest href the page path starts with. */
export function currentLink(path: string, hrefs: string[]) {
  return hrefs.filter(href => path.startsWith(href)).sort((a, b) => b.length - a.length)[0];
}
