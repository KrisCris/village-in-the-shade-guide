"""Crop and animal-product quality rules, read-only.

Harvest rank (village.exe 0x140177470, called with the seed item ID): a seed whose
counted item is in the save's brandCropsNameMap_ gives ITEM_RANK_BRAND; otherwise
the save's pHarvestStatus_ count for that item is compared with the seed's
needValue times HARVEST_COUNT_RATE_GOLD / SILVER / COPPER. The rank comes from the
count before the harvest, then every harvested unit adds 1 (0x1400f3500,
0x1400f4190), and counting starts once GAME_FLAG_STORY_01_022 is set.

item.dat: tagID@24 and needValue@28. A seed's tagID is the item its harvests are
counted under; a crop item's tagID points back to the seed that grows it, which is
how soybeans, bean sprouts, snow peas and mulberries share another crop's count.

Animal products (0x140117570) are not driven by a data table, so the odds below are
copied from that function's code.
"""
import argparse
import json
import struct
from decimal import ROUND_CEILING, Decimal
from pathlib import Path

from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.gamedir import add_game_dir
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.table import read_table

ROOT = Path(__file__).resolve().parents[1]
ITEMS = ROOT / 'data/generated/build-25640656/entities/items.json'
CROP_CATEGORIES = {'ITEM_CATEGORY_CROPS', 'ITEM_CATEGORY_FLOWER', 'ITEM_CATEGORY_FRUIT'}
DEFINES = ('HARVEST_COUNT_RATE_', 'ITEM_SELLING_PRICE_RATE_', 'ITEM_RANK_', 'LIVESTOCK_LOVE_RATE_MAX', 'LIVESTOCK_MOOD_THRESHOLD_')
FLAGS = ('GAME_FLAG_STORY_01_022', 'GAME_FLAG_FAIR_REPLYED', 'GAME_FLAG_FAIR_CROPS', 'GAME_FLAG_FAIR_LIVESTOCK', 'GAME_FLAG_FAIR_HORSE',
         'GAME_FLAG_FAIR_ENTRY', 'GAME_FLAG_FAIR_GET_S_RANK', 'GAME_FLAG_SALE_START_SEED_FIRST_FAIR', 'GAME_FLAG_SALE_START_SEED_AUT_FAIR')
FERTILIZER_ITEMS = {'FERTILIZER_NORMAL': 'ITEM_ID_FERTILIZER', 'FERTILIZER_MIDDLE_GRADE': 'ITEM_ID_FERTILIZER_MIDDLE_GRADE',
                    'FERTILIZER_HIGH_GRADE': 'ITEM_ID_FERTILIZER_HIGH_GRADE'}
# 0x140117570: love level = loveRate // 400 (// 300 with LIVESTOCK_FEATURE_LOVERATE_EASY), capped at 5;
# mood bands split at LIVESTOCK_MOOD_THRESHOLD_NORMAL and _GOOD. Percent per rank 0-3.
ANIMAL_ODDS = [
    [[100, 0, 0, 0], [100, 0, 0, 0], [100, 0, 0, 0]],
    [[100, 0, 0, 0], [90, 10, 0, 0], [80, 20, 0, 0]],
    [[80, 20, 0, 0], [70, 30, 0, 0], [60, 40, 0, 0]],
    [[0, 80, 20, 0], [0, 70, 30, 0], [0, 60, 40, 0]],
    [[0, 0, 90, 10], [0, 0, 80, 20], [0, 0, 70, 30]],
    [[0, 0, 0, 100], [0, 0, 0, 100], [0, 0, 0, 100]],
]


def table(archive, name):
    data = read_table(archive.read_entry(f'data/database/{name}.dat'), language_count=7)
    return list(zip(data.records, _string_groups(data), strict=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_game_dir(parser)
    parser.add_argument('--output', type=Path, default=ROOT / 'data/sources/game-crop-quality.json')
    args = parser.parse_args()
    archive = FafullfsArchive.open(args.game_dir / 'data.dat')
    u32 = lambda record, offset: struct.unpack_from('<I', record, offset)[0]
    u64 = lambda record, offset: struct.unpack_from('<Q', record, offset)[0]

    gamedefine = read_table(archive.read_entry('data/database/gamedefine.dat'))
    defines = {row[1]: row[4] for row in _string_groups(gamedefine) if len(row) >= 5 and row[1].startswith(DEFINES)}
    rates = {rank: Decimal(defines[f'HARVEST_COUNT_RATE_{rank.upper()}']) for rank in ('copper', 'silver', 'gold')}
    flags = {group[0]: dict(numeric_id=u64(record, 0), description_ja=group[1]) for record, group in table(archive, 'gameflag') if group[0] in FLAGS}
    assert set(flags) == set(FLAGS), set(FLAGS) - set(flags)
    fertilizers = []
    for record, group in table(archive, 'fertilizer'):
        fertilizers.append(dict(id=group[0], numeric_id=u64(record, 0), item_id=FERTILIZER_ITEMS[group[0]], rate_percent=u32(record, 16)))

    catalog = {item['numeric_id']: item for item in json.loads(ITEMS.read_text(encoding='utf-8'))}
    links = {u64(record, 0): (u32(record, 24), u32(record, 28)) for record, _ in table(archive, 'item')}
    seeds = {}
    for numeric_id, (tag, need) in links.items():
        item = catalog.get(numeric_id)
        if not item or item['category_id'] != 'ITEM_CATEGORY_SEEDING' or not tag:
            continue
        assert need and tag in catalog, item['id']
        seeds[numeric_id] = dict(
            seed_item_id=item['id'], count_item_id=catalog[tag]['id'], count_item_numeric_id=tag, need=need,
            **{rank: int((rate * need).to_integral_value(ROUND_CEILING)) for rank, rate in rates.items()},
            harvest_item_ids=[])
    for numeric_id, (tag, _) in sorted(links.items()):
        item = catalog.get(numeric_id)
        if item and item['category_id'] in CROP_CATEGORIES and tag in seeds:
            seeds[tag]['harvest_item_ids'].append(item['id'])
    for seed in seeds.values():
        assert seed['count_item_id'] in seed['harvest_item_ids'], seed['seed_item_id']
        seed['harvest_item_ids'].sort(key=lambda item_id: item_id != seed['count_item_id'])

    output = dict(
        source='Steam build 25640656 gamedefine.dat, item.dat tagID@24 / needValue@28, fertilizer.dat rate@16, gameflag.dat; village.exe for the rules',
        build='25640656',
        harvest_count_rates={rank: float(rate) for rank, rate in rates.items()},
        sell_price_rates={rank: float(defines[f'ITEM_SELLING_PRICE_RATE_{rank.upper()}']) for rank in ('normal', 'copper', 'silver', 'gold', 'brand')},
        item_ranks={name: int(value) for name, value in defines.items() if name.startswith('ITEM_RANK_')},
        flags=flags,
        fertilizers=fertilizers,
        seeds=sorted(seeds.values(), key=lambda seed: seed['count_item_numeric_id']),
        animal_products=dict(
            source='village.exe 0x140117570 (rank roll), 0x140118080 (shown rank); feature bit 3 is LIVESTOCK_FEATURE_BRAND',
            love_rate_max=int(defines['LIVESTOCK_LOVE_RATE_MAX']), love_rate_max_easy=int(defines['LIVESTOCK_LOVE_RATE_MAX_EASY']),
            love_rate_per_level=400, love_rate_per_level_easy=300,
            mood_threshold_normal=int(defines['LIVESTOCK_MOOD_THRESHOLD_NORMAL']), mood_threshold_good=int(defines['LIVESTOCK_MOOD_THRESHOLD_GOOD']),
            note='odds[love level 0-5][mood <= normal, <= good, > good] = percent for normal, copper, silver, gold; brand animals always give brand',
            odds=ANIMAL_ODDS),
        save=dict(
            harvest_counts='pHarvestStatus_/p/nowValue_: Map<i64 count_item_numeric_id, i32 harvested units>',
            brand_crops='brandCropsNameMap_: Map<i64 count_item_numeric_id, string brand name>',
            brand_livestock='brandLivestockNameMap_: Map<livestock type, string brand name>; each S-ranked animal also gets LIVESTOCK_FEATURE_BRAND',
        ),
    )
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(len(seeds), 'seeds,', sum(len(seed['harvest_item_ids']) for seed in seeds.values()), 'harvest items,', len(fertilizers), 'fertilizers ->', args.output)


if __name__ == '__main__':
    main()
