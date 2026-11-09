"""Extract the 1.30 "？？？" event: the unnamed visitor by the village's south bridge.

Traced by hand from the scripts below (hashes in `reviewed`); re-trace when a hash changes.
- dlc_03_01.dlc_03_001 warps the player beside the anchor event_DLC_130_02_pos00, spawns
  CREATURE_ID_STORY_NPC_CHA_0170 with the nameplate TALK_NAME_ID_UNKNOWN, plays
  TALK_ID_90_3002_001_01..04 and lets him walk off. A player west of the anchor gets the
  _01 lines, one east of it the _02 lines; only the Spanish text differs between them.
  EventGainReward then grants the row's flag GAME_FLAG_DLC_03_001, which the row excludes,
  so the event plays once. No other 1.30 script reads that flag.
- event_player_birthday.event_player_birthday_setting is the birthday-setting scene; its
  event.dat row sets GAME_FLAG_BIRTHDAY_SETTING_DEMO and GAME_FLAG_BIRTHDAY_SETTING_DEMO_NEXT_DAY.
  gameflag.dat marks the second as reset at the day change (u32 at byte 28), so the visitor
  can come from the next day on.
event.dat row EVENT_ID_DLC_03_001: hours, required and excluded flag vectors at byte 80,
allowed weather IDs 28 bytes after them, game version (130) 16 bytes before the row end.
demolist.dat DEMO_ID_DLC_03_001_L/_R are mapevent_call_event zones (contactBegin); the
open-world map head places each as a quad of world points. Dialogue comes from talk.dat in
the game's seven text slots.
"""
import argparse
import hashlib
import json
import re
import runpy
import struct
import zlib
from pathlib import Path
from honogurashi_extractor.gamedir import add_game_dir
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.localization import NATIVE_LOCALES

parser = argparse.ArgumentParser(description=__doc__)
add_game_dir(parser)
parser.add_argument('--output', type=Path, default=Path('data/sources/game-mystery-visitor.json'))
args = parser.parse_args()

read_chunk = runpy.run_path('tools/inspect-lua54.py')['read_chunk']
data = FafullfsArchive.open(args.game_dir / 'data.dat')
reviewed = {
    'dlc_03_01': 'b1f9e4fc0aa95d9ee7a2791c33f314eb3d137509e224a07aef769dcac46c0d14',
    'event_player_birthday': 'dfe4df985d523a677c10b978f74f0883cc10ea4d282a85bfc0e25af986743596',
}
constants = {}
for name, digest in reviewed.items():
    raw = data.read_entry(f'data/script/{name}.lub')
    if hashlib.sha256(raw).hexdigest() != digest:
        raise ValueError(f'{name} changed; re-trace it before extracting')
    found, todo = set(), [read_chunk(raw)]
    while todo:
        proto = todo.pop()
        todo += proto['children']
        found |= {c for c in proto['constants'] if isinstance(c, str)}
    constants[name] = found

EVENT = 'EVENT_ID_DLC_03_001'
CREATURE = 'CREATURE_ID_STORY_NPC_CHA_0170'
NAMEPLATE = 'TALK_NAME_ID_UNKNOWN'
ANCHOR = 'event_DLC_130_02_pos00'
TALK = re.compile(r'TALK_ID_90_3002_001_0([1-4])_0([12])')
script = constants['dlc_03_01']
assert {'dlc_03_001', CREATURE, NAMEPLATE, ANCHOR} <= script, 'dlc_03_01 no longer names the visitor'
talk_ids = sorted(c for c in script if TALK.fullmatch(c))
assert len(talk_ids) == 8, talk_ids


def table(name):
    t = read_table(data.read_entry(f'data/database/{name}.dat'))
    return list(zip(t.records, _string_groups(t)))


def u32(row, offset):
    return struct.unpack_from('<I', row, offset)[0]


def u64(row, offset):
    return struct.unpack_from('<Q', row, offset)[0]


def u64_list(row, offset):
    count = u32(row, offset)
    return [u64(row, offset + 4 + 8 * i) for i in range(count)], offset + 4 + 8 * count


def slots(strings):
    return dict(zip(NATIVE_LOCALES, strings))


flag_rows = {u32(r, 0): (g[0], g[1], u32(r, 28)) for r, g in table('gameflag')}
flag = lambda value: flag_rows[value][0]
event_row, event_strings = next((r, g) for r, g in table('event') if g[0] == EVENT)
requires, cursor = u64_list(event_row, 80)
excludes, cursor = u64_list(event_row, cursor)
weather_ids, _ = u64_list(event_row, cursor + 28)
weather_names = {g[0] for _, g in table('weather')}
# Numeric weather IDs as in latenightevent.dat (see extract-anomalies.py); the rain-only
# hat-ghost events carry [2] in this same field.
WEATHER = {1: 'WEATHER_ID_SUNNY', 2: 'WEATHER_ID_RAIN', 3: 'WEATHER_ID_CLOUDY', 4: 'WEATHER_ID_SNOW',
           5: 'WEATHER_ID_THUNDERSTORM', 6: 'WEATHER_ID_PEACH_BLOSSOMS'}
assert set(WEATHER.values()) <= set(weather_names), weather_names
version = u32(event_row, len(event_row) - 16)
assert [flag(v) for v in requires] == ['GAME_FLAG_STORY_06_END', 'GAME_FLAG_BIRTHDAY_SETTING_DEMO'], requires
assert [flag(v) for v in excludes] == ['GAME_FLAG_DLC_03_001', 'GAME_FLAG_BIRTHDAY_SETTING_DEMO_NEXT_DAY'], excludes
assert version == 130 and event_strings[2] == '7:00-16:59', (version, event_strings)
next_day = next(v for v in excludes if flag(v) == 'GAME_FLAG_BIRTHDAY_SETTING_DEMO_NEXT_DAY')
assert flag_rows[next_day][2] == 1, 'the next-day flag is no longer reset at the day change'
# EventGainReward grants the row's count-prefixed flag list; it holds the event's own flag.
once = next(v for v in excludes if flag(v) == 'GAME_FLAG_DLC_03_001')
assert struct.pack('<IQ', 1, once) in event_row[cursor:], 'the event no longer sets its own flag'
setting_row = next(r for r, g in table('event') if g[0] == 'EVENT_ID_PLAYER_BIRTHDAY_SETTING_DEMO_00')
assert struct.pack('<Q', next_day) in setting_row[100:], 'the birthday scene no longer sets the next-day flag'
assert 'event_player_birthday_setting' in constants['event_player_birthday']

creature = next(g for _, g in table('creature') if g[0] == CREATURE)
portrait = next(g for _, g in table('anime') if g[0] == 'ANIME_ID_BU_0170')
nameplate = next(g for _, g in table('talknameplate') if g[0] == NAMEPLATE)
blank = lambda text: not text.strip('　 ')
lines = {}
for _, strings in table('talk'):
    if strings[0] in talk_ids:
        rest, found, i = strings[1:], [], 0
        while i < len(rest):
            # A spoken line fills all seven text slots; staging commands leave them blank.
            block = rest[i:i + len(NATIVE_LOCALES)]
            if len(block) == len(NATIVE_LOCALES) and not any(map(blank, block)):
                found.append(slots(block))
                i += len(NATIVE_LOCALES)
            else:
                i += 1
        lines[strings[0]] = found
assert sorted(lines) == talk_ids and all(lines.values()), lines

maps = FafullfsArchive.open(args.game_dir / 'data/map_1_00.dat')
map_name = next(g[2] + '.head' for _, g in table('map') if g[0] == 'MAP_ID_OPENWORLD')
head = maps.read_entry(map_name)
if head.startswith(b'YKCMP_V1'):
    head = zlib.decompress(head[20:])
anchor = re.search(re.escape(ANCHOR).encode() + rb'\x00', head)
anchor_x, anchor_y = struct.unpack_from('<ii', head, anchor.start() + 32)
triggers = []
for record, strings in table('demolist'):
    if strings[0].startswith('DEMO_ID_DLC_03_001_'):
        assert strings[2] == 'mapevent_call_event' and 'contactBegin' in strings and EVENT in strings, strings
        key = struct.pack('<Q', u64(record, 0))
        assert head.count(key) == 1, strings[0]
        # The zone's four corners follow the placement 80 bytes later.
        corners = struct.unpack_from('<8i', head, head.find(key) + 80)
        quad = [[corners[i], corners[i + 1]] for i in range(0, 8, 2)]
        assert all(abs(x - anchor_x) < 1500 and abs(y - anchor_y) < 1500 for x, y in quad), quad
        triggers.append(dict(demo_id=strings[0], name_ja=strings[1], side=strings[0][-1],
                             center=[round(sum(p[0] for p in quad) / 4), round(sum(p[1] for p in quad) / 4)], quad=quad))
assert [t['side'] for t in triggers] == ['L', 'R'], triggers

steps = []
for step in sorted({TALK.fullmatch(i)[1] for i in talk_ids}):
    west, east = (f'TALK_ID_90_3002_001_0{step}_0{side}' for side in '12')
    steps.append(dict(talk_ids=[west, east], lines=lines[west], east_lines=None if lines[east] == lines[west] else lines[east]))

out = dict(
    source=f'Steam build 25640656: event.dat, gameflag.dat, creature.dat, anime.dat, talknameplate.dat, talk.dat, demolist.dat, map.dat → {map_name}; scripts ' + ', '.join(f'{k}.lub' for k in reviewed),
    reviewed_scripts=reviewed,
    creature=dict(id=CREATURE, name_ja=creature[1], portrait_model=portrait[2], portrait_name_ja=portrait[1]),
    nameplate=dict(id=NAMEPLATE, names=slots(nameplate[2:2 + len(NATIVE_LOCALES)])),
    event=dict(
        id=EVENT, name_ja=event_strings[1], version=version, hours=event_strings[2],
        requires=[flag(v) for v in requires], excludes=[flag(v) for v in excludes],
        sets=[flag(once)], weathers=[WEATHER[v] for v in weather_ids],
    ),
    anchor=dict(name=ANCHOR, x=anchor_x, y=anchor_y),
    triggers=triggers,
    dialogue=steps,
)
args.output.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('visitor event:', len(steps), 'dialogue steps,', len(triggers), 'trigger zones')
