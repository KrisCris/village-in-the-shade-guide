import struct
import pytest

from honogurashi_extractor.harvest import mature_quantity, harvest_stages
from honogurashi_extractor.table import TableFormatError


def record(low=3, high=3, chance=100):
    row = bytearray(140)
    values = {16:1,20:1,24:2,28:0,32:0,36:900,40:2,
              44:100150,52:1070,64:low,68:high,72:chance,
              88:100150,96:1040,108:low,112:high,116:chance}
    for offset,value in values.items(): struct.pack_into('<I',row,offset,value)
    return bytes(row)


def test_alternative_harvest_actions_are_not_added_together():
    assert mature_quantity(record(), 100150) == 3

def test_stage_reader_keeps_growth_threshold_and_deduplicates_actions():
    assert harvest_stages(record()) == [{'state':1,'growth_points':900,'item_numeric_id':100150,'quantity':3}]


def test_random_yield_or_unrelated_item_is_not_a_fixed_quantity():
    assert mature_quantity(record(high=5), 100150) is None
    assert mature_quantity(record(chance=50), 100150) is None
    assert mature_quantity(record(), 100160) is None


def test_truncated_drop_array_is_rejected():
    with pytest.raises(TableFormatError): mature_quantity(record()[:100],100150)
