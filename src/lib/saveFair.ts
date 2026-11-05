import { flagEnabled, type ProgressEdits } from './saveProgress';
import { readSigned, type SerDocument, type SerNode } from './ser';
import { tr } from '../i18n/active';

/**
 * The monthly 评鉴会 on the 27th (event.dat EVENT_ID_FAIR_*).
 *
 * EVENT_ID_FAIR_SEND_LETTER adds LETTER_ID_FAIR_NOTICE (letter.dat 7) on the 19th. The
 * player's answer is that letter's `choiceIndex_`: -1 until answered, then 0 crops,
 * 1 livestock, 2 horses, in the letter's choice order. The game only lets the player
 * answer once.
 *
 * EVENT_ID_FAIR_MAP_PREPARATION runs on the 26th and calls EventSetFairFlagByReply
 * (village.exe 0x1402797b0). It clears GAME_FLAG_FAIR_CROPS / _LIVESTOCK / _HORSE and
 * GAME_FLAG_MAP_DIFF_FAIR / _FAIR_CROPS, takes the last fair letter in letterList_ and,
 * if it was answered, sets GAME_FLAG_FAIR_REPLYED; an unanswered letter gets a random
 * entry. It then sets the entry's flag and venue: crops use MAP_DIFF_FAIR_CROPS, the
 * other two MAP_DIFF_FAIR. The fair-day events read only these flags.
 */
export const FAIR_LETTER_ID = 7;
export const FAIR_REPLIED_FLAG = 600;
/** GAME_FLAG_FAIR_CROPS, _LIVESTOCK, _HORSE, indexed by the letter's choice. */
export const FAIR_ENTRY_FLAGS = [601, 602, 603] as const;
/** GAME_FLAG_MAP_DIFF_FAIR (livestock and horses) and GAME_FLAG_MAP_DIFF_FAIR_CROPS. */
const VENUE_FLAG = 70001, CROPS_VENUE_FLAG = 70006;
const venueFor = (entry: FairEntry) => entry === 0 ? CROPS_VENUE_FLAG : VENUE_FLAG;
export const FAIR_FLAGS: ReadonlySet<number> = new Set([FAIR_REPLIED_FLAG, ...FAIR_ENTRY_FLAGS, VENUE_FLAG, CROPS_VENUE_FLAG]);

export type FairEntry = 0 | 1 | 2;
export const FAIR_ENTRIES: FairEntry[] = [0, 1, 2];
export function fairEntryName(entry: number): string {
  return [tr('作物评鉴会'), tr('家畜评鉴会'), tr('马匹评鉴会')][entry] ?? tr('尚未回答');
}

/** `choiceIndex_` of the fair letter the next preparation will read, if the save holds one. */
export function fairLetterChoice(doc: SerDocument): SerNode | undefined {
  const list = doc.resolve('letterStatus_/p/letterList_');
  const letters = list ? doc.children(list) : [];
  for (let index = letters.length - 1; index >= 0; index--) {
    const id = doc.resolve('p/dataID_', letters[index]);
    if (id && readSigned(doc, id) === BigInt(FAIR_LETTER_ID)) return doc.resolve('p/choiceIndex_', letters[index]);
  }
  return undefined;
}

/** Once the preparation has run, the venue flag is on and the entry flags decide the fair. */
export function fairDayPrepared(doc: SerDocument, edits: ProgressEdits = {}): boolean {
  return flagEnabled(doc, VENUE_FLAG, edits) || flagEnabled(doc, CROPS_VENUE_FLAG, edits);
}
export function fairDayEntry(doc: SerDocument, edits: ProgressEdits = {}): FairEntry | undefined {
  return FAIR_ENTRIES.find(entry => flagEnabled(doc, FAIR_ENTRY_FLAGS[entry], edits));
}

/** Set the flags the way EventSetFairFlagByReply would for `entry`, recording only real changes. */
export function withFairDayEntry(doc: SerDocument, edits: ProgressEdits, entry: FairEntry): ProgressEdits {
  if (!FAIR_ENTRIES.includes(entry)) throw new Error(tr('评鉴会项目无效。'));
  const wanted = new Map<number, boolean>([
    [FAIR_REPLIED_FLAG, true],
    ...FAIR_ENTRY_FLAGS.map((flag, index) => [flag, index === entry] as [number, boolean]),
    [VENUE_FLAG, venueFor(entry) === VENUE_FLAG],
    [CROPS_VENUE_FLAG, venueFor(entry) === CROPS_VENUE_FLAG],
  ]);
  const flags = { ...edits.flags };
  for (const [id, on] of wanted) {
    if (flagEnabled(doc, id) === on) delete flags[id]; else flags[id] = on;
  }
  return { ...edits, flags };
}

/** A fair-day switch rewrites several flags but counts as one change. */
export function fairDayEditCount(edits: ProgressEdits): number {
  return Object.keys(edits.flags ?? {}).some(id => FAIR_FLAGS.has(Number(id))) ? 1 : 0;
}

/** Drop every pending fair flag edit, returning the save to its stored fair-day state. */
export function withoutFairDayEdits(edits: ProgressEdits): ProgressEdits {
  const flags = { ...edits.flags };
  for (const id of FAIR_FLAGS) delete flags[id];
  return { ...edits, flags };
}
