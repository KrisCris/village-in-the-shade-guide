import struct
import pytest

from honogurashi_extractor.models import Item, Snapshot
from honogurashi_extractor.localization import build_name
from honogurashi_extractor.normalize_activities import normalize_activities
from honogurashi_extractor.table import read_table
from tests.fixtures.build_table import build_table


def table(size, fields, internal='TEST'):
    row = bytearray(size)
    for offset,value in {8:0,12:len(internal),**fields}.items(): struct.pack_into('<I',row,offset,value)
    strings = '\0'.join([internal,'名称','','','','名稱',''])+'\0'
    return read_table(build_table(records=[bytes(row)], strings=strings.encode()))


def snapshot():
    name = build_name(ja='木材',zh_hant='木材',internal='wood',overrides={})
    return Snapshot(items={'wood':Item('wood',230000,name,None,3)})


def test_building_materials_and_money_are_separate():
    state=snapshot()
    normalize_activities({'construction':table(332,{0:25,64:0,216:1000,220:230000,224:50})},state,{})
    activity=state.activities['TEST']
    assert activity.money_cost==1000
    assert [(q.item_id,q.quantity) for q in activity.inputs]==[('wood',50)]


@pytest.mark.parametrize('size',[480,576,624])
def test_lost_book_item_reference_is_relative_to_variable_record_tail(size):
    state=snapshot()
    normalize_activities({'lostbook':table(size,{0:3,size-52:230000})},state,{})
    assert state.activities['RETURN_TEST'].inputs[0].item_id=='wood'


def test_delivery_candidate_does_not_invent_a_recipient_or_deadline():
    state=snapshot()
    normalize_activities({'subquestitem':table(84,{0:1,20:230000,28:2})},state,{})
    activity=state.activities['TEST']
    assert activity.inputs[0].quantity==2
    assert activity.location==''
    assert '以当次委托为准' in activity.conditions[0]


def test_skill_retains_native_effect_description():
    state=snapshot()
    row=bytearray(200)
    struct.pack_into('<III',row,0,1,0,0)
    struct.pack_into('<I',row,12,10)
    strings='\0'.join(['SKILL_TEST','内部名','畝の技術','','','','田壟技術','','畝にできる','','','','再敲擊一次田地即可形成田壟',''])+'\0'
    skills=read_table(build_table(records=[bytes(row)],strings=strings.encode()))
    normalize_activities({'skilltree':skills},state,{})
    assert state.activities['SKILL_TEST'].description=='再敲擊一次田地即可形成田壟'
