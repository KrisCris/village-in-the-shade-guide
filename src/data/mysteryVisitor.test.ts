import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import visitor from '../../data/sources/game-mystery-visitor.json';
import characters from '../../data/generated/build-25640656/entities/characters.json';
import { homePortraits, portraits } from '../components/art/portraitCatalog';
import { buildCatalog } from './catalog';
import { visitorGuide, visitorId } from './mysteryVisitor';

const catalog = (locale?: 'ja' | 'en') => buildCatalog({ '/entities/characters.json': characters }, '', locale);

describe('1.30 "???" visitor', () => {
  // The conditions in mysteryVisitor.ts and on the 1.30 page are written from these fields.
  it('matches the event row the page copy was written from', () => {
    expect(visitor.event).toMatchObject({
      id: 'EVENT_ID_DLC_03_001',
      version: 130,
      hours: '7:00-16:59',
      requires: ['GAME_FLAG_STORY_06_END', 'GAME_FLAG_BIRTHDAY_SETTING_DEMO'],
      excludes: ['GAME_FLAG_DLC_03_001', 'GAME_FLAG_BIRTHDAY_SETTING_DEMO_NEXT_DAY'],
      sets: ['GAME_FLAG_DLC_03_001'],
    });
    expect(visitor.event.weathers).toEqual(['WEATHER_ID_SUNNY', 'WEATHER_ID_RAIN', 'WEATHER_ID_CLOUDY', 'WEATHER_ID_SNOW']);
    expect(visitor.triggers.map((trigger) => trigger.side)).toEqual(['L', 'R']);
  });

  it('joins the characters under his in-game nameplate', () => {
    expect(characters.some((row) => row.id === visitorId)).toBe(false);
    const zh = catalog().byId[visitorId];
    expect(zh).toMatchObject({ kind: 'characters', guide_href: visitorGuide, birthday_day: null, gift_items: [] });
    expect(zh.name.zh_hans).toBe('？？？');
    expect(zh.name.aliases).toContain('???');
    expect(catalog('en').byId[visitorId].name.zh_hans).toBe('???');
    expect(catalog('ja').byId[visitorId].name.zh_hans).toBe('？？？');
  });

  it('translates his description, conditions and guide link', () => {
    const en = catalog('en').byId[visitorId];
    for (const text of [en.description, en.location, en.guide_label, ...(en.conditions as string[])]) {
      expect(text).toEqual(expect.any(String));
      expect(text).not.toMatch(/[一-鿿]/);
    }
  });

  it('stays off the residents, birthday and homepage lists', () => {
    const zh = catalog().byId[visitorId];
    expect(zh.icon_path).toBeUndefined();
    expect(zh.birthday_season).toBeNull();
    expect(homePortraits.some((portrait) => portrait.id === visitorId)).toBe(false);
  });

  it('shows his own animated portrait on his page', () => {
    const portrait = portraits.find((entry) => entry.id === visitorId)!;
    expect(portrait).toMatchObject({ resource: visitor.creature.portrait_model, pose: 10, face: 1000, home: false });
    const model = JSON.parse(readFileSync(`public/art/portraits/${portrait.resource}.json`, 'utf8')) as { animations: Array<[number]> };
    const ids = model.animations.map(([id]) => id & 65535);
    expect(ids).toContain(portrait.pose);
    expect(ids).toContain(portrait.face);
  });
});
