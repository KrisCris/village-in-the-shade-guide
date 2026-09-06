import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import EntityDetail from './EntityDetail';
import HomePortraits from '../art/HomePortraits';
import type {EntityDetailModel} from '../../domain/relations';

const model = {
  entity: {id:'example', kind:'items', name:{zh_hans:'测试物品', zh_hant:'測試物品', ja:'テスト', aliases:['开发别名']}, source:'开发来源'},
  facts:[], groups:[], locations:[], ingredientOptions:[], processingPlans:[], profit:null,
} as unknown as EntityDetailModel;

it('keeps diagnostic details available during development',()=>{
  const html=renderToStaticMarkup(<EntityDetail model={model}/>);
  expect(html).toContain('别名与数据来源');
  expect(html).toContain('开发来源');
  expect(html).toContain('测试物品');
});

it('offers an animated portrait for a supported character but not an item',()=>{
  const character={...model,entity:{...model.entity,kind:'characters',id:'CHARA_ID_GENERAL_STORE_MANAGER'}};
  const html=renderToStaticMarkup(<EntityDetail model={character}/>);
  expect(html).toContain('<canvas');
  expect(html).toContain('立绘可能涉及');
  expect(html).not.toContain('暂停立绘');
  expect(renderToStaticMarkup(<HomePortraits/>)).not.toContain('暂停角色轮播');
  expect(renderToStaticMarkup(<EntityDetail model={model}/>)).not.toContain('<canvas');
});

it('does not put avatar attribution in the character introduction',()=>{
  const character={...model,entity:{...model.entity,kind:'characters',portrait_source:'https://nippon1.jp/consumer/honogurashi/character.html'}};
  expect(renderToStaticMarkup(<EntityDetail model={character}/>)).not.toContain('发行商官方人物页');
});
