"""Regression contracts for the seven-language supplemental catalogs."""
import json
import runpy
import struct
import sys
from pathlib import Path

import pytest

from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import TableContainer


ROOT = Path(__file__).resolve().parents[1]


def source(name):
    return json.loads((ROOT / 'data/sources' / f'game-{name}.json').read_text('utf8'))


def fixture_table(size, scalars, strings):
    row = bytearray(size)
    pool = bytearray()
    for offset, text in strings.items():
        encoded = text.encode('utf8')
        struct.pack_into('<II', row, offset, len(pool), len(encoded))
        pool.extend(encoded + b'\0')
    for offset, value in scalars.items():
        struct.pack_into('<I', row, offset, value)
    return TableContainer(1, size, (bytes(row),), (), bytes(pool), 7)


def block(offset, ja, traditional, simplified):
    return {offset+i*8: text for i, text in enumerate((ja, '', '', '', traditional, '', simplified))}


def run_extractor(monkeypatch, name, tables, args):
    class Archive:
        def read_entry(self, path):
            return tables.get(Path(path).stem, TableContainer(0, 0, (), (), b'', 7))
    monkeypatch.setattr(FafullfsArchive, 'open', lambda _: Archive())
    monkeypatch.setattr('honogurashi_extractor.table.read_table', lambda value: value)
    monkeypatch.setattr(sys, 'argv', [name, *args])
    runpy.run_path(str(ROOT / 'tools' / name), run_name='__main__')


@pytest.mark.parametrize('table,offset,count,item', [
    ('playercrothing',208,10,500010), ('playerheadaccessory',248,10,520010),
    ('playerneckaccessory',156,10,510000), ('playerbackaccessory',156,10,0),
    ('playerfronthairstyle',120,1,540001), ('playerbackhairstyle',144,1,540101),
])
def test_appearance_vectors_follow_seven_name_slots(monkeypatch, tmp_path, table, offset, count, item):
    # Native sample: the preceding field is an animation ID, not an item ID.
    row = fixture_table(offset+count*8+16, {0:2, offset-8:151, offset:item, offset+count*8:86000},
                        {8:'APPEARANCE_TEST', **block(16,'名称','','')})
    output = tmp_path/'appearance.json'
    run_extractor(monkeypatch,'extract-save-appearance.py',{table:row},
                  ['--game-dir',str(tmp_path),'--output',str(output)])
    result = json.loads(output.read_text('utf8'))['tables'][table][0]
    assert result['variants'] == ([{'color':0,'itemId':item}] if item else [])
    assert result['unlockFlag'] == 86000


def test_save_catalogs_preserve_official_names_and_native_step_thresholds(monkeypatch, tmp_path):
    tables = {
        'item': fixture_table(536,{0:660050,308:777,348:3},
                              {8:'ITEM_TEST',**block(32,'道具','舊工具','官方工具')}),
        'livestock': fixture_table(352,{0:2,72:5,76:1,96:1,100:1,104:11,168:7167,224:700010},
                                   {8:'LIVESTOCK_TEST',**block(16,'ヒヨコ','小雞','小鸡')}),
        'skilltree': fixture_table(244,{0:2,40:301,80:6204},
                                   {8:'SKILL_TEST',**block(116,'畝','田壟','田垄'),**block(172,'説明','說明','官方说明')}),
        'quest': fixture_table(536,{0:3,336:2,396:2,456:7},
                              {8:'QUEST_TEST',**block(20,'依頼','委託','委托'),**block(132,'説明','說明','官方说明'),
                               **block(340,'一','壹','第一步'),**block(400,'二','貳','第二步')}),
    }
    run_extractor(monkeypatch,'extract-save-v2-catalogs.py',tables,
                  ['--game-dir',str(tmp_path),'--output-dir',str(tmp_path)])
    load=lambda key: json.loads((tmp_path/f'game-save-{key}.json').read_text('utf8'))
    tool=load('tools')['tools'][0]
    assert (tool['level'],tool['name']) == (3,'官方工具')
    assert tool['nameTranslations']['zh-TW'] == '舊工具'
    animal=load('animals')['animals'][0]
    assert (animal['growDays'],animal['adultId'],animal['houseType'],animal['heartUnit']) == (5,1,1,300)
    assert animal['variants'][0]['itemId'] == 700010
    assert load('progression')['skills'][0]['description'] == '官方说明'
    quest=load('quests')['quests'][0]
    assert [(step['name'],step['level']) for step in quest['steps']] == [('第一步',2),('第二步',7)]
    assert quest['steps'][1]['nameTranslations']['ja'] == '二'


def test_refreshed_supplemental_references_resolve():
    entities=ROOT/'data/generated/build-25311578/entities'
    load=lambda name: json.loads((entities/f'{name}.json').read_text('utf8'))
    items={item['numeric_id']:item['id'] for item in load('items')}
    item_ids=set(items.values())
    flags={row['id'] for row in source('save-progression')['flags']}
    animals=source('save-animals')['animals']
    animal_ids={row['id'] for row in animals}
    assert len(animals)==36
    assert all(not row['adultId'] or row['adultId'] in animal_ids for row in animals)
    for row in animals:
        assert all(not v['itemId'] or v['itemId'] in items for v in row['variants'])
    for row in source('livestock-products')['animals']:
        assert set(row['product_item_ids']+row['variant_item_ids']) <= item_ids
    for rows in source('save-appearance')['tables'].values():
        for row in rows:
            assert all(v['itemId'] in items for v in row['variants'])
            assert not row['unlockFlag'] or row['unlockFlag'] in flags
    for row in source('recipe-documents')['documents']:
        assert {row['document_item_id'],row['target_item_id']} <= item_ids
    character_ids={row['numeric_id'] for row in load('characters')}
    for row in source('recipe-lessons')['lessons']:
        assert row['character_numeric_id'] in character_ids
        assert {row['recipe_unlock_flag'],row['required_flag'],*row['excluded_flags']} <= flags
    for row in source('night-exchanges')['exchanges']:
        assert set(row['input_item_ids']+row['reward_item_ids']) <= item_ids
    kappa=source('kappa-exchange')
    assert {kappa['input_item_id'],*(r['item_id'] for r in kappa['rewards'])} <= item_ids
    unlocks=source('save-unlocks')
    bundle_ids={row['id'] for row in unlocks['bundles']}
    for group in unlocks['groups']:
        assert set(group['bundles']) <= bundle_ids
        assert not group['flag'] or group['flag'] in flags
        assert not group['reward'] or group['reward'] in items
    for bundle in unlocks['bundles']:
        assert all(row['itemId'] in items for row in bundle['items'])
        assert not bundle['reward'] or bundle['reward'] in items
    for row in unlocks['nodes']:
        assert set(row['showFlags']) <= flags
        assert not row['flag'] or row['flag'] in flags
    machines=source('save-machines')
    machine_ids={row['id'] for row in machines['machines']}
    for row in machines['processes']:
        assert set(row['machines']) <= machine_ids
        assert row['output'] in items
        assert all(material['itemId'] in items for material in row['inputs'])
    capacities={row['gimmick_numeric_id']:row['capacity'] for row in source('machine-capacities')['machines']}
    assert len(capacities)==29
    assert all(row['capacity']==capacities[row['id']] for row in machines['machines'] if row['id'] in capacities)
    for row in source('save-progression')['recipes']:
        assert row['flag'] in flags and row['itemId'] in items
    for row in source('save-placements')['placements']:
        assert set(row['requires']+row['excludes']) <= flags
    for row in source('map-markers')['markers']:
        if row['kind']=='book':
            assert row['item_numeric_id'] in items
            assert not row['prerequisite_flag'] or row['prerequisite_flag'] in flags
    for row in source('save-map')['objects']:
        assert not row['itemId'] or row['itemId'] in items
        assert set(row['requires']+row['excludes']) <= flags
    assert set(source('save-map')['cropRules'])=={str(row['numeric_id']) for row in load('crops')}


def test_farmland_keeps_historical_geometry_separate_from_current_cells():
    catalog=source('farmland')
    current=[row for row in catalog['shapes'] if row['map_ids']==['MAP_ID_OPENWORLD']]
    legacy=[row for row in catalog['legacy_shapes'] if row['map_ids']==['MAP_ID_OPENWORLD']]
    assert len(current)==6 and len(legacy)==4
    assert sum(row['count'] for row in current)==2818
    assert all(row['build_id']=='24969282' for row in legacy)
    assert all('_ver120_' in row['map'] for row in current)
    assert all('_ver120_' not in row['map'] for row in legacy)
    assert len({row['id'] for row in catalog['shapes']})==len(catalog['shapes'])
    assert all(row['count']==len({tuple(cell) for cell in row['cells']}) for row in catalog['shapes'])
