"""Extract what each dish restores, the Chawantei and festival menus, and the recipe sources besides villagers.

Traced by hand from Steam build 25640656; every step below is asserted, so a changed table or script stops the run.
- item.dat: after the u64 feature list (count at byte 384, one u64 per feature) and 48 more bytes comes the
  item's action-effect list. Each heal is {u64 effect, u32 1, u32 amount, u32 0} and ITEM_CONSUME (a bare u64)
  ends the list. Effect ids come from actioneffect.dat: ACT_EFFECT_HEAL_HP 2, ACT_EFFECT_HEAL_ST 3,
  ACT_EFFECT_ITEM_CONSUME 8. Every dish heals HP and then stamina; one heart is PLAYER_STATUS_HP_HEART_MAX HP.
- storesales.dat: the STORE_SALE_ID_RESTAURANT_* rows (store type STORE_RESTAURANT) carry the dish, then
  {u32 2, u64 GAME_FLAG_COOKING_RECIPE_N, u64 intangeble id}. No row has its own price, and the dishes with
  a buy price in item.dat are exactly the ones on these rows, so the buy price is the menu price.
- event_restaurant_order.lub (Chawantei): after the meal, while orderCount < RESTAURANT_ORDER_MAX the order
  popup shows the count; when the game hands over an intangeble id the recipe popup follows.
- EventAddOrderCount (village.exe 0x140498FD0 → 0x14014AD60) adds the count to the sale's counter, clamps it
  to the counter's maximum and, once the counter is full and the row's kind is 2, sets the row's recipe flag
  (bts at +0x90 of the flag set) and returns true. Chawantei adds 1 per order.
- event_holiday_festival.lub: the Yakisoba, Candy Apple and Ice Cream Float stalls sell the dish through
  CTask_Menu_SingleTransaction, then call EventAddOrderCount(sale, GAME_VALUE_TRANSACTION_NUM), so every
  piece bought counts. Their sale rows need GAME_FLAG_MAP_DIFF_FESTIVAL, which only the festival map sets.
  EVENT_ID_FESTIVAL_MAP_PREPARATION lists season 1 (summer) and day index 14, so the festival is Summer 15;
  the grounds open at 16:00 (EVENT_ID_FESTIVAL_START_TIME) and close at 20:00 (EVENT_ID_FESTIVAL_END_TIME).
- story_sub_oldman.lub: finishing QUEST_ID_OLD_MAN_01 gives the Mess Tin and sets GAME_FLAG_COOKING_RECIPE_03.
Together with the villager lessons and dinners, every cooking recipe has exactly one source.
"""
import argparse
import json
import re
import runpy
import struct
from pathlib import Path
from honogurashi_extractor.gamedir import add_game_dir
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups

parser = argparse.ArgumentParser(description=__doc__)
add_game_dir(parser)
parser.add_argument('--snapshot', type=Path, default=Path('data/generated/build-25640656'))
parser.add_argument('--output', type=Path, default=Path('data/sources/game-cooking.json'))
args = parser.parse_args()

lua = runpy.run_path('tools/inspect-lua54.py')
read_chunk, OPS = lua['read_chunk'], lua['OPS']
data = FafullfsArchive.open(args.game_dir / 'data.dat')


def table(name):
    t = read_table(data.read_entry(f'data/database/{name}.dat'))
    return list(zip(t.records, _string_groups(t)))


u32 = lambda row, offset: struct.unpack_from('<I', row, offset)[0]
u64 = lambda row, offset: struct.unpack_from('<Q', row, offset)[0]
snapshot = lambda kind: json.loads((args.snapshot / 'entities' / f'{kind}.json').read_text())
defines = {g[1]: g[4] for g in _string_groups(read_table(data.read_entry('data/database/gamedefine.dat'))) if len(g) > 4}
flag_ids = {g[0]: u32(r, 0) for r, g in table('gameflag')}
intangebles = {u32(r, 0): g[0] for r, g in table('intangeble')}
effects = {g[0]: u32(r, 0) for r, g in table('actioneffect')}
HEAL_HP, HEAL_ST, CONSUME = effects['ACT_EFFECT_HEAL_HP'], effects['ACT_EFFECT_HEAL_ST'], effects['ACT_EFFECT_ITEM_CONSUME']
assert (HEAL_HP, HEAL_ST, CONSUME) == (2, 3, 8), effects


def tokens(proto):
    """Instructions as (op, operand) with registers dropped."""
    k, out = proto['constants'], []
    for word in proto['code']:
        op = OPS[word & 127]
        b, c, bx = (word >> 16) & 255, word >> 24, word >> 15
        if op == 'GETTABUP': out.append((op, k[c]))
        elif op in ('GETFIELD', 'SETFIELD'): out.append((op, k[c] if op == 'GETFIELD' else k[b]))
        elif op == 'LOADK': out.append((op, k[bx]))
        else: out.append((op,))
    return out


def contains(seq, part):
    return any(seq[i:i + len(part)] == part for i in range(len(seq) - len(part) + 1))


def functions(path):
    root = read_chunk(data.read_entry(path))
    stack, out = [root], []
    while stack:
        proto = stack.pop()
        out.append(proto)
        stack.extend(proto['children'])
    return out


# item.dat: what eating a dish restores. Prices pin the record layout against the extracted snapshot.
items = {row['id']: row for row in snapshot('items')}
categories = {u32(r, 0): g[0] for r, g in table('itemcategory')}
dishes = []
for r, g in table('item'):
    if categories.get(u32(r, 320)) != 'ITEM_CATEGORY_COOKING':
        continue
    item = items[g[0]]
    assert u32(r, 336) == item['sell_price'] and u32(r, 332) == (item['buy_price'] or 0), g[0]
    p = 388 + 8 * u32(r, 384) + 48
    heals = {}
    while (effect := u64(r, p)) != CONSUME:
        assert effect in (HEAL_HP, HEAL_ST) and u32(r, p + 8) == 1 and u32(r, p + 16) == 0, f'{g[0]}: effect list changed'
        heals[effect] = u32(r, p + 12)
        p += 20
    dishes.append({'item_id': g[0], 'hp': heals.get(HEAL_HP, 0), 'stamina': heals.get(HEAL_ST, 0)})
recipes = snapshot('cooking-recipes')
dish_ids = {row['item_id'] for row in dishes}
assert {r['output']['item_id'] for r in recipes} <= dish_ids
assert all(d['hp'] > 0 and d['stamina'] > 0 for d in dishes if d['item_id'].startswith('ITEM_ID_COOKING_')), 'a dish stopped healing'

# storesales.dat: the menu rows and the recipe each one teaches.
item_numeric = {row['numeric_id']: row['id'] for row in items.values()}
recipe_flag = {r['output']['item_id']: r['unlock_flag'] for r in recipes}
restaurant_store = int(defines['STORE_RESTAURANT'])
festival_sales = {}
for proto in functions('data/script/event_holiday_festival.lub'):
    k = proto['constants']
    if 'EventAddOrderCount' not in k:
        continue
    sale = next(c for c in k if isinstance(c, str) and c.startswith('STORE_SALE_ID_RESTAURANT_'))
    dish = next(c for c in k if isinstance(c, str) and c.startswith('ITEM_ID_COOKING_'))
    popup = next(c for c in k if isinstance(c, str) and c.startswith('INTANGEBLE_ID_RECIPE_'))
    seq = tokens(proto)
    assert contains(seq, [('GETTABUP', dish), ('GETTABUP', 'GameCheckRequiredMoney')]), sale
    assert contains(seq, [('LOADK', 'CTask_Menu_SingleTransaction')]), sale
    assert contains(seq, [('GETTABUP', 'GameGetValue'), ('GETTABUP', 'GAME_VALUE_TRANSACTION_NUM')]), sale
    assert contains(seq, [('GETTABUP', 'EventAddOrderCount'), ('GETTABUP', sale), ('MOVE',), ('CALL',), ('TEST',), ('JMP',)]), sale
    assert contains(seq, [('GETTABUP', 'GameShowIntangeblePopup'), ('GETTABUP', popup)]), sale
    festival_sales[sale] = (dish, popup)
assert len(festival_sales) == 3, festival_sales

order = [p for p in functions('data/script/event_restaurant_order.lub') if 'RESTAURANT_ORDER_MAX' in p['constants']]
assert len(order) == 1
seq = tokens(order[0])
assert contains(seq, [('GETFIELD', 'intangebleID'), ('GETFIELD', 'orderCount')])
assert contains(seq, [('GETTABUP', 'RESTAURANT_ORDER_MAX'), ('LT',), ('JMP',), ('GETTABUP', 'DATA_ID_NONE'), ('EQ',), ('JMP',), ('GETTABUP', 'EventOpenRestaurantOrderPopup')])
assert contains(seq, [('GETTABUP', 'EventMealAtRestaurant')]) and contains(seq, [('GETTABUP', 'GameShowIntangeblePopup'), ('MOVE',), ('CALL',)])

menu = {}
for r, g in table('storesales'):
    sale = g[0]
    if not sale.startswith('STORE_SALE_ID_RESTAURANT_'):
        continue
    assert u32(r, 24) == restaurant_store, sale
    dish = item_numeric[u32(r, 16)]
    flag = recipe_flag[dish]
    tail = struct.pack('<I', 2) + struct.pack('<Q', flag)
    assert r.count(tail) == 1, f'{sale}: recipe unlock changed'
    popup = intangebles[u64(r, r.index(tail) + len(tail))]
    assert re.fullmatch(r'INTANGEBLE_ID_RECIPE_\d+', popup), (sale, popup)
    venue = 'festival' if sale in festival_sales else 'restaurant'
    if venue == 'festival':
        assert festival_sales[sale] == (dish, popup), sale
        assert u32(r, 28) == 1 and u64(r, 32) == flag_ids['GAME_FLAG_MAP_DIFF_FESTIVAL'], f'{sale} is no longer festival-only'
    entry = menu.setdefault(dish, {'item_id': dish, 'venue': venue, 'price': items[dish]['buy_price'],
                                   'recipe_unlock_flag': flag, 'popup_id': popup, 'sale_ids': []})
    assert (entry['venue'], entry['recipe_unlock_flag'], entry['popup_id']) == (venue, flag, popup), sale
    entry['sale_ids'].append(sale)
sold = {row['id'] for row in items.values() if row['category_id'] == 'ITEM_CATEGORY_COOKING' and row['buy_price']}
assert sold == set(menu), 'a dish has a buy price but no menu row, or the other way round'

# Festival day and hours.
events = {g[0]: (r, g) for r, g in table('event')}
prep = events['EVENT_ID_FESTIVAL_MAP_PREPARATION'][0]
assert [u32(prep, o) for o in (104, 108, 112, 116)] == [1, 1, 1, 14], 'the festival moved'
start, end = (events[f'EVENT_ID_FESTIVAL_{n}_TIME'][1][2].split('-')[0] for n in ('START', 'END'))
assert (start, end) == ('16:00', '20:00'), (start, end)

# Rokkaku's Errand.
quests = []
for proto in functions('data/script/story_sub_oldman.lub'):
    k = proto['constants']
    if 'GAME_FLAG_COOKING_RECIPE_03' not in k:
        continue
    seq = tokens(proto)
    assert 'QUEST_ID_OLD_MAN_01' in k and contains(seq, [('GETTABUP', 'GameShowIntangeblePopup'), ('GETTABUP', 'INTANGEBLE_ID_RECIPE_03')])
    assert contains(seq, [('GETTABUP', 'GameSetFlag'), ('GETTABUP', 'GAME_FLAG_COOKING_RECIPE_03'), ('LOADTRUE',), ('CALL',)])
    # The same scene hands over a Mess Kit.
    assert contains(seq, [('GETTABUP', 'GameAddInventoryItem'), ('GETTABUP', 'ITEM_ID_GIMMICK_MESSTIN'), ('LOADI',), ('CALL',)])
    quests.append({'quest_id': 'QUEST_ID_OLD_MAN_01', 'recipe_unlock_flag': flag_ids['GAME_FLAG_COOKING_RECIPE_03'], 'popup_id': 'INTANGEBLE_ID_RECIPE_03', 'reward_item_id': 'ITEM_ID_GIMMICK_MESSTIN'})
assert len(quests) == 1

# Every recipe has exactly one source.
lessons = json.loads(Path('data/sources/game-recipe-lessons.json').read_text())['lessons']
dinners = json.loads(Path('data/sources/game-dinner-parties.json').read_text())['hosts']
sources = [l['recipe_unlock_flag'] for l in lessons] + [d['recipe_unlock_flag'] for h in dinners for d in h['dinners']]
sources += [m['recipe_unlock_flag'] for m in menu.values()] + [q['recipe_unlock_flag'] for q in quests]
assert sorted(sources) == sorted(r['unlock_flag'] for r in recipes), 'a recipe has no source or more than one'

output = {
    'source': 'item.dat action effects, storesales.dat, event_restaurant_order.lub, event_holiday_festival.lub, story_sub_oldman.lub; village.exe EventAddOrderCount',
    'player': {'hp_per_heart': int(defines['PLAYER_STATUS_HP_HEART_MAX']), 'hp_max': int(defines['PLAYER_STATUS_HP_MAX_VALUE']),
               'stamina_per_bar': int(defines['PLAYER_STATUS_ST_GAUGE_MAX']), 'stamina_max': int(defines['PLAYER_STATUS_ST_MAX_VALUE'])},
    'orders_to_learn': int(defines['RESTAURANT_ORDER_MAX']),
    'festival': {'season': 'summer', 'day': 15, 'hours': f'{start}-{end}'},
    'dishes': dishes,
    'menu': sorted(menu.values(), key=lambda m: items[m['item_id']]['numeric_id']),
    'quests': quests,
}
args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(f"dishes: {len(dishes)}, menu: {len(menu)} ({sum(m['venue'] == 'festival' for m in menu.values())} at the festival), quests: {len(quests)}")
