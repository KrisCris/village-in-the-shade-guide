"""Mature-crop quantities from cropsharvest.dat, not item-name guesses."""
from dataclasses import replace
import struct

from .table import TableFormatError


def mature_quantity(record: bytes, item_id: int) -> int | None:
    def word(offset):
        if offset + 4 > len(record):
            raise TableFormatError('truncated crop harvest record')
        return struct.unpack_from('<I', record, offset)[0]

    # First state is growing/alive. Each growth stage has a threshold and a
    # variable number of 44-byte drops (one alternative per harvest action).
    if word(16) == 0 or word(20) != 1:
        return None
    cursor = 28
    previous = -1
    drops = []
    for _ in range(word(24)):
        threshold, count = word(cursor), word(cursor + 4)
        cursor += 8
        if threshold < previous or cursor + count * 44 > len(record):
            raise TableFormatError('invalid crop harvest stages')
        previous = threshold
        drops = [tuple(word(cursor + index * 44 + field) for field in (0, 8, 20, 24, 28)) for index in range(count)]
        cursor += count * 44
    alternatives = [drop for drop in drops if drop[0] == item_id and drop[1] in (1040, 1070)]
    if not alternatives or any(low != high or low <= 0 or chance != 100 for _, _, low, high, chance in alternatives):
        return None
    quantities = {drop[2] for drop in alternatives}
    return quantities.pop() if len(quantities) == 1 else None


def normalize_harvest_quantities(table, snapshot):
    if not table:
        return
    records = {struct.unpack_from('<I', record)[0]: record for record in table.records}
    item_ids = {item.id: item.numeric_id for item in snapshot.items.values()}
    for key, crop in snapshot.crops.items():
        record = records.get(crop.numeric_id)
        target = item_ids.get(crop.harvest_item_ids[0]) if crop.harvest_item_ids else None
        if record is not None and target is not None:
            snapshot.crops[key] = replace(crop, harvest_quantity=mature_quantity(record, target))
