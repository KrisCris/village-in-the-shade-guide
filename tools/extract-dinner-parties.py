"""Extract villager dinner invitations and the cooking recipe each dinner teaches.

Traced by hand from event_likeability_<villager>.lub (Steam build 25640656); every step below is
asserted against the bytecode or event.dat, so a changed script stops the run.
- EVENT_ID_NPC_LIKEABILITY_<V>_BEFORE_DINNER_PARTY is a talk event (type 3) on that villager,
  7:00-16:45. It requires <V>_LOVE_LEVEL3 and GAME_FLAG_STORY_02_END; the _HORROR_OFF copy requires
  GAME_FLAG_HORROR_OFF_MODE (Village in the Sunshine Mode) instead of the chapter. Both exclude festival
  days (GAME_FLAG_HOLIDAY), a likability event already under way, the villager's daily likability-talk
  flag, the day's invitation flag (_OCCURS) and _ALL_END. Allowed weathers: sunny, rain, cloudy, snow.
- <script>_before_dinner_party_check returns false while the villager's 'wkpres' value is below 2.
  ai_chara_template.dailyUpdate zeroes 'wkpres' on Mondays; village.exe 0x14029ae9f refuses a gift when
  it is already 2 and 0x14029afad adds 1 per gift (birthday gifts excluded), so it is the weekly gift
  count. With two gifts given, Random(100) < 10 starts the invitation (Random is 0-based, see
  extract-curse-items.py); otherwise it sets _OCCURS, a flag reset at the day change, so a villager
  rolls once per day.
- <script>_before_dinner_party: accepting (GAME_FLAG_POPUP_SELECT_1) sets _OK and picks one unplayed
  dinner with RandomRange(1, #candidates) by setting its _SELECT flag. Declining only ends the talk.
  EventGainReward sets _OCCURS either way.
- _DINNER_PARTY_CHECK_TIME (time event, 18:00) or _CHECK_SLEEP (going to bed first; it time-skips to
  18:00) starts the selected EVENT_ID_..._DINNER_PARTY_0N. That dinner's function shows
  INTANGEBLE_ID_RECIPE_N and sets GAME_FLAG_COOKING_RECIPE_N unconditionally, then sets _ALL_END once
  all three dinners are done.
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
parser.add_argument('--output', type=Path, default=Path('data/sources/game-dinner-parties.json'))
args = parser.parse_args()

lua = runpy.run_path('tools/inspect-lua54.py')
read_chunk, OPS = lua['read_chunk'], lua['OPS']
data = FafullfsArchive.open(args.game_dir / 'data.dat')


def table(name):
    t = read_table(data.read_entry(f'data/database/{name}.dat'))
    return list(zip(t.records, _string_groups(t)))


u32 = lambda row, offset: struct.unpack_from('<I', row, offset)[0]
u64 = lambda row, offset: struct.unpack_from('<Q', row, offset)[0]
flag_rows = {u32(r, 0): (g[0], u32(r, 28)) for r, g in table('gameflag')}
flag_ids = {name: value for value, (name, _) in flag_rows.items()}
events = {g[0]: (r, g) for r, g in table('event')}
WEATHER = {u32(r, 0): g[0] for r, g in table('weather')}


def flag_list(names):
    return struct.pack('<I', len(names)) + b''.join(struct.pack('<Q', flag_ids[n]) for n in names)


def tokens(proto):
    """Instructions as (op, operand) with registers dropped, so the 14 copies compare equal."""
    k, out = proto['constants'], []
    for word in proto['code']:
        op = OPS[word & 127]
        b, c, kbit, bx = (word >> 16) & 255, word >> 24, (word >> 15) & 1, word >> 15
        if op == 'GETTABUP': out.append((op, k[c]))
        elif op == 'LOADK': out.append((op, k[bx]))
        elif op == 'LOADI': out.append((op, bx - 65535))
        elif op in ('LTI', 'EQI'): out.append((op, b - 127, kbit))
        else: out.append((op,))
    return out


def contains(seq, part):
    return any(seq[i:i + len(part)] == part for i in range(len(seq) - len(part) + 1))


def closures(root):
    """Map each function name the chunk assigns to the index of its closure."""
    k, regs, out = root['constants'], {}, {}
    for word in root['code']:
        op = OPS[word & 127]
        a, b, c, bx = (word >> 7) & 255, (word >> 16) & 255, word >> 24, word >> 15
        if op == 'LOADK': regs[a] = k[bx]
        elif op == 'CLOSURE': regs[a] = ('closure', bx)
        elif op in ('SETFIELD', 'SETTABLE') and a == 0 and isinstance(regs.get(c), tuple):
            out[k[b] if op == 'SETFIELD' else regs[b]] = regs[c][1]
    return out


template = read_chunk(data.read_entry('data/script/ai_chara_template.lub'))
daily = template['children'][closures(template)['dailyUpdate']]
assert contains(tokens(daily), [('GETTABUP', 'WEEK_MONDAY'), ('EQ',), ('JMP',), ('GETTABUP', 'MapObjectSetStatusValue')])
assert 'wkpres' in daily['constants'], 'the weekly gift count is no longer reset on Mondays'

hosts, invitation = [], None
for name in sorted(events, key=lambda n: u64(events[n][0], 40)):
    match = re.fullmatch(r'EVENT_ID_NPC_LIKEABILITY_(\w+)_BEFORE_DINNER_PARTY', name)
    if not match:
        continue
    key = match[1]
    row, strings = events[name]
    script = strings[3]
    assert strings[6] == script and strings[4] == f'{script}_before_dinner_party_check', strings
    assert strings[7] == f'{script}_before_dinner_party' and strings[2] == '7:00-16:45', strings
    assert u32(row, 32) == 3, f'{name} is no longer a talk event'
    character = u64(row, 40)
    love = next(n for n in flag_ids if re.fullmatch(rf'GAME_FLAG_{key}_LOVE_LEVEL3', n))
    common = ['GAME_FLAG_LIKABILITY_EVENT', f'GAME_FLAG_TALK_{key}_LIKEABILITY_EVENT',
              f'GAME_FLAG_NPC_LIKEABILITY_{key}_DINNER_PARTY_OCCURS', f'GAME_FLAG_NPC_LIKEABILITY_{key}_DINNER_PARTY_ALL_END',
              'GAME_FLAG_HOLIDAY', 'GAME_FLAG_FORBID_LIKABILITY_EVENT']
    variants = {name: ([love, 'GAME_FLAG_STORY_02_END'], common + ['GAME_FLAG_HORROR_OFF_MODE']),
                f'{name}_HORROR_OFF': ([love, 'GAME_FLAG_HORROR_OFF_MODE'], common)}
    for event_id, (requires, excludes) in variants.items():
        variant, variant_strings = events[event_id]
        assert variant_strings[3:8] == strings[3:8] and u64(variant, 40) == character, event_id
        needle = flag_list(requires) + flag_list(excludes)
        assert variant.count(needle) == 1, f'{event_id} conditions changed'
        cursor = variant.find(needle) + len(needle) + 28
        weathers = [WEATHER[u64(variant, cursor + 4 + 8 * i)] for i in range(u32(variant, cursor))]
        assert weathers == ['WEATHER_ID_SUNNY', 'WEATHER_ID_RAIN', 'WEATHER_ID_CLOUDY', 'WEATHER_ID_SNOW'], weathers
        occurs = flag_ids[f'GAME_FLAG_NPC_LIKEABILITY_{key}_DINNER_PARTY_OCCURS']
        assert struct.pack('<Q', occurs) in variant[cursor:], f'{event_id} no longer marks the day'
    assert flag_rows[occurs][1] == 1, '_OCCURS is no longer reset at the day change'

    root = read_chunk(data.read_entry(f'data/script/{script}.lub'))
    functions = closures(root)
    proto = lambda function: root['children'][functions[function]]
    check = tokens(proto(f'{script}_before_dinner_party_check'))
    assert contains(check, [('LOADK', 'wkpres'), ('CALL',), ('LTI', 2, 0), ('JMP',), ('LOADFALSE',), ('RETURN1',)]), script
    assert contains(check, [('GETTABUP', 'Random'), ('LOADI', 100), ('CALL',), ('LTI', 10, 1), ('JMP',)]), script
    assert contains(check, [('GETTABUP', 'GameSetFlag'), ('GETUPVAL',), ('LOADK', f'GAME_FLAG_NPC_LIKEABILITY_{key}_DINNER_PARTY_OCCURS')]), script
    ask = tokens(proto(f'{script}_before_dinner_party'))
    assert contains(ask, [('GETTABUP', 'GameGetFlag'), ('GETTABUP', 'GAME_FLAG_POPUP_SELECT_1')]), script
    assert contains(ask, [('GETTABUP', 'RandomRange'), ('LOADI', 1), ('LEN',), ('CALL',)]), script
    sleep = tokens(proto(f'{script}_dinner_party_check_sleep'))
    assert ('GETTABUP', 'TaskCreate_TimeSkip') in sleep and 18 in proto(f'{script}_dinner_party_check_sleep')['constants'], script
    assert events[f'EVENT_ID_NPC_LIKEABILITY_{key}_DINNER_PARTY_CHECK_TIME'][1][2] == '18:00-18:00'

    dinners = []
    for number in (1, 2, 3):
        event_id = f'EVENT_ID_NPC_LIKEABILITY_{key}_DINNER_PARTY_0{number}'
        dinner_row, dinner_strings = events[event_id]
        selected = f'GAME_FLAG_NPC_LIKEABILITY_{key}_DINNER_PARTY_0{number}_SELECT'
        assert contains(ask, [('LOADK', selected)]), event_id
        assert dinner_row.count(flag_list([selected, f'GAME_FLAG_NPC_LIKEABILITY_{key}_DINNER_PARTY_TIME_CHECK'])) == 1, event_id
        function = dinner_strings[7]
        body = proto(function)
        recipe = [c for c in body['constants'] if isinstance(c, str) and c.startswith('GAME_FLAG_COOKING_RECIPE_')]
        popup = [c for c in body['constants'] if isinstance(c, str) and c.startswith('INTANGEBLE_ID_RECIPE_')]
        assert len(recipe) == 1 and len(popup) == 1, (function, recipe, popup)
        assert contains(tokens(body), [('GETTABUP', 'GameShowIntangeblePopup'), ('GETTABUP', popup[0]), ('CALL',),
                                       ('GETTABUP', 'GameSetFlag'), ('GETTABUP', recipe[0]), ('LOADTRUE',), ('CALL',)]), function
        dinners.append(dict(number=number, event_id=event_id, function=function,
                            recipe_unlock_flag=flag_ids[recipe[0]], popup_id=popup[0]))
    chara = next(c for c in proto(f'{script}_before_dinner_party_check')['constants'] if isinstance(c, str) and c.startswith('CHARA_ID_'))
    hosts.append(dict(character_numeric_id=character, chara_id=chara, script=script,
                      invitation_event_ids=list(variants), required_flag=flag_ids[love], dinners=dinners))
    invitation = dict(hours=strings[2], friendship_level=3, story_flag='GAME_FLAG_STORY_02_END',
                      sunshine_mode_flag='GAME_FLAG_HORROR_OFF_MODE', weekly_gifts=2, daily_chance_percent=10,
                      weathers=weathers, dinner_time='18:00')

assert len(hosts) == 14, len(hosts)
flags = [d['recipe_unlock_flag'] for h in hosts for d in h['dinners']]
assert len(set(flags)) == 42, 'two dinners teach the same recipe'
out = dict(
    source='Steam build 25640656: event.dat, gameflag.dat, weather.dat; scripts event_likeability_*.lub, ai_chara_template.lub; village.exe gift count',
    invitation=invitation,
    hosts=hosts,
)
args.output.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'dinner hosts: {len(hosts)}, recipes: {len(flags)}')
