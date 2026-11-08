import visitor from '../../data/sources/game-mystery-visitor.json';
import { msg } from '../i18n/translate';

/**
 * The unnamed visitor of 1.30's "？？？" event (EVENT_ID_DLC_03_001, tools/extract-mystery-visitor.py).
 * character.dat has no row for him, so the catalog adds this one to the characters. His name is
 * the event's own nameplate (TALK_NAME_ID_UNKNOWN) in each language. The conditions below are
 * written from the event row; mysteryVisitor.test.ts fails if that row changes.
 */
export const visitorId = visitor.creature.id;
export const visitorGuide = '/guides/patch-1-30/#mystery';

export function visitorRow() {
  const names = visitor.nameplate.names;
  return {
    id: visitorId,
    name: {
      zh_hans: names['zh-CN'], zh_hant: names['zh-TW'], ja: names.ja, internal: visitorId,
      aliases: [...new Set([...Object.values(names), visitorId])], review_status: 'official', translations: names,
    },
    birthday_day: null,
    birthday_season: null,
    gift_items: [],
    description: msg('1.30 加入的人物，对话时名字只显示“？？？”。他只在“？？？”事件里出现一次：在村子南边的桥头和主角说了几句话，留下一句“打扰了，我会再来的。”就走了。游戏数据把这段事件标为追加角色的伏笔，这个版本中没有别的事件、对话或日程再用到他。'),
    location: msg('村子南边的桥头，电话亭附近'),
    conditions: [
      msg('仅限静谧田园模式'),
      msg('设定主角生日的隔天以后'),
      msg('7:00–16:59 走上村子南边的桥，或桥东边的小路'),
      msg('雷雨天不会发生'),
      msg('每个存档只发生一次'),
    ],
    guide_href: visitorGuide,
    guide_label: msg('出现地点的地图和全部对话见 1.30 更新页'),
    source: visitor.source,
  };
}
