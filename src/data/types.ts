import type { Locale } from '../i18n/locales';
import { msg } from '../i18n/translate';

export type Name = {
  /**
   * Primary display name. Simplified Chinese in the default catalog; a
   * localized catalog (buildCatalog with a locale) puts that page language's
   * name here. The native strings stay in translations, zh_hant, ja and aliases.
   */
  zh_hans: string;
  zh_hant: string;
  ja: string;
  internal: string;
  aliases: string[];
  review_status: string;
  /**
   * Native game slots by locale (ja, zh-TW, ko, zh-CN, reserved slot-N). In a
   * localized catalog, zh-CN holds the Simplified Chinese display name.
   */
  translations?: Record<string, string>;
};

/** The name shown under the primary one: Japanese on Chinese pages, Simplified Chinese on Japanese pages. */
export function secondaryName(name: Name, locale: string): string {
  return locale === 'ja' ? name.translations?.['zh-CN'] || '' : name.ja || '';
}

export type Entity = Record<string, unknown> & {
  id: string;
  kind: string;
  name: Name;
  category_id?: string | null;
  category_numeric_id?: number | null;
  category_name?: Name | null;
  appearances?: Array<{ location_id: string; season: string; time_period: string; time_range?: string }>;
  buy_price?: number | null;
  sell_price?: number | null;
  quality_eligible?: boolean;
  quality_source?: string | null;
  icon_path?: string | null;
  searchText: string;
  cultivation_method?: string;
};

export type Catalog = {
  buildId: string;
  generatedAt: string;
  /** Display language of names and authored text in this catalog. */
  locale?: Locale;
  entities: Entity[];
  byId: Record<string, Entity>;
  counts: Record<string, number>;
};

/** Source strings; translate at the render site with t(kindLabels[kind]). */
export const kindLabels: Record<string, string> = {
  activities: msg('用途与解锁'),
  items: msg('全部物品'), crops: msg('作物'), machines: msg('机械'), processes: msg('加工'),
  'craft-recipes': msg('制作配方'), 'cooking-recipes': msg('料理'), 'store-offers': msg('商店商品'),
  characters: msg('角色'), fish: msg('鱼类'), livestock: msg('动物'), facilities: msg('设施'),
  'facility-releases': msg('设施解锁'), quests: msg('委托'), collectibles: msg('收集品'),
  'hunt-rewards': msg('狩猎'), weather: msg('天气'),
};

export const primaryKinds = ['crops', 'machines', 'processes', 'cooking-recipes', 'fish', 'characters', 'items'];
