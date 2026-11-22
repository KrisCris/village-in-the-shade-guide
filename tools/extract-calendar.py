"""Extract the village calendar: festivals, the monthly Evaluation, festival eves, weekdays and gift limits.

Read from event.dat, string.dat, gamedefine.dat and common.lub (Steam build 25640656); every value
below is asserted, so a changed table stops the run.
- event.dat rows: u32 type at byte 32, a count-prefixed u64 target list at 36, 32 fixed bytes, then the
  count-prefixed u64 required and excluded flag lists, a (year, season, day, operator) date gate and the
  count-prefixed u32 season and day lists (an empty season list means every season). Operator 4 is "from
  that date on", as for the late-night events in extract-anomalies.py.
- Each festival is EVENT_ID_<KEY>_SEND_LETTER (the invitation letter), _MAP_PREPARATION (the day before:
  it sets the venue flag unless GAME_FLAG_HOLIDAY_FORBID is on, otherwise _CANCEL runs) and
  _NOTICE_POPUP (the festival day). _START_TIME and _END_TIME carry the opening hours as event strings.
- string.dat STR_ID_CALENDAR_<KEY> are the names the in-game calendar shows; its _DETAIL blurbs give the same
  opening hours (the New Year's Festival's END_TIME is 22:59, shown there as 11 PM).
- common.lub isBeforeFestival is true on spring 11, summer 14, autumn 22, winter 27 and every 26th: the
  map-preparation days. event_check_late_night skips a late night on those days and forces one on days
  1 and 15 (see extract-anomalies.py for the weekly count).
- gamedefine.dat numbers WEEK_MONDAY … WEEK_SUNDAY 0-6. village.exe 0x140106930 (the game-time split)
  stores weekDay = (day of season - 1) mod 7 at +0x18, so day 1 of every season is a Monday.
- Gifts: village.exe 0x14029ac30 handles a gift. It sets a birthday flag when the villager's character.dat
  birthday season and day match today, refuses the gift when the villager's 'present' status value is
  already set (LOG_ERROR_PRESENT_DAY_LIMIT), and when 'wkpres' is 2 or more unless it is the birthday
  (LOG_ERROR_PRESENT_WEEK_LIMIT). It then adds 1 to 'present' and, except on the birthday, to 'wkpres'.
  ai_chara_template.dailyUpdate clears 'wkpres' on Mondays (see extract-dinner-parties.py). Saves keep
  both values in each villager's npcStatusList_ statusValueMap_.
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
from honogurashi_extractor.localization import NATIVE_LOCALES

parser = argparse.ArgumentParser(description=__doc__)
add_game_dir(parser)
parser.add_argument('--output', type=Path, default=Path('data/sources/game-calendar.json'))
args = parser.parse_args()

lua = runpy.run_path('tools/inspect-lua54.py')
read_chunk, OPS = lua['read_chunk'], lua['OPS']
data = FafullfsArchive.open(args.game_dir / 'data.dat')
SEASONS = ['spring', 'summer', 'autumn', 'winter']


def table(name):
    t = read_table(data.read_entry(f'data/database/{name}.dat'))
    return list(zip(t.records, _string_groups(t)))


u32 = lambda row, offset: struct.unpack_from('<I', row, offset)[0]
u64 = lambda row, offset: struct.unpack_from('<Q', row, offset)[0]
flags = {u32(r, 0): g[0] for r, g in table('gameflag')}
events = {g[0]: (r, g) for r, g in table('event')}


def event_dates(name):
    """Flag lists, date gate and season/day lists of an event.dat row."""
    row, strings = events[name]
    o = 36
    o += 4 + 8 * u32(row, o)
    o += 32
    lists = []
    for _ in range(2):
        n = u32(row, o)
        lists.append([flags[u64(row, o + 4 + 8 * i)] for i in range(n)])
        o += 4 + 8 * n
    gate = struct.unpack_from('<4I', row, o)
    o += 16
    days = []
    for _ in range(2):
        n = u32(row, o)
        days.append(list(struct.unpack_from(f'<{n}I', row, o + 4)))
        o += 4 + 4 * n
    return dict(requires=lists[0], excludes=lists[1], gate=gate, seasons=days[0], days=days[1], hours=strings[2] if len(strings) > 2 else '')


# Weekend names carry the calendar's colour tags (<c blue>土</c>); keep the text only.
untag = lambda text: re.sub(r'<c [a-z]+>|</c>', '', text)
strings = {g[0]: {locale: untag(text) for locale, text in zip(NATIVE_LOCALES, g[1:1 + len(NATIVE_LOCALES)])} for _, g in table('string')}
names = lambda key: strings[f'STR_ID_CALENDAR_{key}']


def clock(hours):
    start, end = hours.split('-')
    assert start == end, hours
    return start


FESTIVALS = [('SAKURA_VIEWING', 'SAKURA_VIEWING', 0), ('FESTIVAL', 'FESTIVAL', 1), ('HARVEST', 'HARVEST', 2), ('NEW_YEARS_EVE', 'NEW_YEARS_EVE', 3)]
festivals = []
for key, calendar_key, season in FESTIVALS:
    letter, prep, notice = (event_dates(f'EVENT_ID_{key}_{part}') for part in ('SEND_LETTER', 'MAP_PREPARATION', 'NOTICE_POPUP'))
    start, end = (event_dates(f'EVENT_ID_{key}_{part}')['hours'] for part in ('START_TIME', 'END_TIME'))
    for row in (letter, prep, notice):
        assert row['seasons'] == [season] and len(row['days']) == 1, (key, row)
        assert row['gate'] == letter['gate'], (key, row['gate'])
    assert prep['days'][0] + 1 == notice['days'][0], key
    assert 'GAME_FLAG_HOLIDAY_FORBID' in prep['excludes'], key
    year, gate_season, gate_day, operator = letter['gate']
    assert letter['gate'] == (0, 0, 0, 0) or (gate_season, gate_day, operator) == (season, 0, 4), (key, letter['gate'])
    festivals.append(dict(
        key=calendar_key, season=SEASONS[season], day=notice['days'][0], letter_day=letter['days'][0], from_year=year or 1,
        start=clock(start), end=clock(end), names=names(calendar_key),
    ))
assert [(f['season'], f['day'], f['from_year']) for f in festivals] == [('spring', 12, 2), ('summer', 15, 1), ('autumn', 23, 1), ('winter', 28, 1)], festivals

letter, prep, notice = (event_dates(f'EVENT_ID_FAIR_{part}') for part in ('SEND_LETTER', 'MAP_PREPARATION', 'NOTICE_POPUP'))
start, end = (event_dates(f'EVENT_ID_FAIR_{part}')['hours'] for part in ('START_TIME', 'END_TIME'))
for row in (letter, prep, notice):
    assert row['seasons'] == [] and len(row['days']) == 1 and row['gate'] == letter['gate'], row
assert (letter['days'][0], prep['days'][0], notice['days'][0]) == (19, 26, 27)
fair = dict(day=27, letter_day=19, start=clock(start), end=clock(end), names=names('FAIR'))

# isBeforeFestival: the EQI operands it compares the day with, season by season, then the shared day.
common = read_chunk(data.read_entry('data/script/common.lub'))
before = next(p for p in common['children'] if 'SEASON_WINTER' in p['constants'] and 'day' in p['constants'] and len(p['code']) < 50)
compares = [((word >> 16) & 255) - 127 for word in before['code'] if OPS[word & 127] == 'EQI']
assert compares == [11, 14, 22, 27, 26], compares
assert compares[:4] == [f['day'] - 1 for f in festivals] and compares[4] == fair['day'] - 1
late = read_chunk(data.read_entry('data/script/event_check_late_night.lub'))
found, todo = set(), [late]
while todo:
    proto = todo.pop()
    todo += proto['children']
    found |= {c for c in proto['constants'] if isinstance(c, str)}
assert {'isBeforeFestival', 'WEEK_MONDAY'} <= found
# The weekly check forces a late night when GameTimeGetTime().day is 1 or 15 (GETFIELD 'day', then EQI).
check = next(p for p in late['children'] if 'isBeforeFestival' in p['constants'])
code = check['code']
forced = [((code[i + 1] >> 16) & 255) - 127 for i in range(len(code) - 1)
          if OPS[code[i] & 127] == 'GETFIELD' and check['constants'][code[i] >> 24] == 'day' and OPS[code[i + 1] & 127] == 'EQI']
assert forced == [1, 15], forced

defines = {g[1]: g[4] for g in _string_groups(read_table(data.read_entry('data/database/gamedefine.dat'))) if len(g) > 4}
week = [d for d in ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY')]
assert [defines[f'WEEK_{d}'] for d in week] == [str(i) for i in range(7)] and defines['WEEK_DAY_MAX'] == '7'
assert strings['STR_ID_WEEK_MONDAY']['en'] == 'Mon'

logs = {g[0]: dict(zip(NATIVE_LOCALES, g[1:1 + len(NATIVE_LOCALES)])) for _, g in table('logtext')}
assert logs['LOG_ERROR_PRESENT_DAY_LIMIT']['en'] == 'Only one gift can be given per day.'
assert logs['LOG_ERROR_PRESENT_WEEK_LIMIT']['en'] == 'Only two gifts can be given per week.'

out = dict(
    source='Steam build 25640656: event.dat, string.dat, gamedefine.dat, logtext.dat; scripts common.lub (isBeforeFestival), '
           'event_check_late_night.lub; village.exe 0x140106930 (weekday), 0x14029ac30 (gift limits)',
    days_per_season=28,
    week=dict(first_day_weekday=0, weekday_names=[strings[f'STR_ID_WEEK_{d}'] for d in week]),
    birthday_label=strings['STR_ID_CALENDAR_BIRTHDAY'],
    festivals=festivals,
    fair=fair,
    eves=dict(every_season=[fair['day'] - 1], **{f['season']: [f['day'] - 1] for f in festivals}),
    late_night_days=forced,
    gifts=dict(per_day=1, per_week=2, birthday_outside_weekly=True, week_resets='monday',
               save_values=dict(today='present', week='wkpres', talked='talk')),
)
args.output.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('calendar:', len(festivals), 'festivals, Evaluation on day', fair['day'])
