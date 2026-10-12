import {expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import EntityDetail from './EntityDetail';
import {I18nProvider} from '../../i18n/react';
import HomePortraits from '../art/HomePortraits';
import type {EntityDetailModel} from '../../domain/relations';

const model = {
  entity: {id:'example', kind:'items', name:{zh_hans:'测试物品', zh_hant:'測試物品', ja:'テスト', aliases:['开发别名']}, source:'开发来源'},
  facts:[], groups:[], locations:[], ingredientOptions:[], processingPlans:[], profit:null,
} as unknown as EntityDetailModel;

it('shows machines before plans and repeats only a different applicable set',()=>{
  const row=(id:string)=>({key:id,entity:{...model.entity,id,kind:'machines',name:{...model.entity.name,zh_hans:id}},chips:[],fixedPrice:false});
  const group=(ids:string[])=>({key:'machines' as const,label:'加工机械',rows:ids.map(row)});
  const example={...model,groups:[group(['机械甲','机械乙'])],processingPlans:[
    {...model,entity:{...model.entity,id:'plan1',duration_minutes:30},groups:[group(['机械乙','机械甲'])]},
    {...model,entity:{...model.entity,id:'plan2',duration_minutes:60},groups:[group(['机械甲'])]},
  ]} as EntityDetailModel;
  const html=renderToStaticMarkup(<EntityDetail model={example}/>);
  expect(html.indexOf('<h2>加工机械')).toBeLessThan(html.indexOf('<h2>加工方案'));
  expect(html.match(/<h2>加工机械/g)).toHaveLength(1);
  expect(html.match(/<h4>本方案适用机械/g)).toHaveLength(1);
});

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

it('lists other-language names under the title only on Chinese pages',()=>{
  expect(renderToStaticMarkup(<EntityDetail model={model}/>)).toContain('class="aliases"');
  expect(renderToStaticMarkup(<I18nProvider locale="ja"><EntityDetail model={model}/></I18nProvider>)).not.toContain('class="aliases"');
});
