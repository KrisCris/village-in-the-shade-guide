/** One row of a placementcreature.dat table, as written by tools/extract-hunting.py. */
export interface SpawnRow { animal: string; season: number; chance: number | null; count: number[] }
export interface SpawnOdds {
  animal: string;
  /** Chance that at least one of this animal is placed in the table's spots that day. */
  atLeastOne: number;
  /** Average number placed per day. */
  expected: number;
}

interface State { free: number; seen: string[]; p: number }

/**
 * Exact odds of one table's daily roll in one season, following village.exe 0x1402C4900:
 * rows run in order while spots are free; a row for another season is skipped, a row with a
 * chance needs rand(100) < chance, the count is uniform over count[0]..count[1] and is cut to the
 * free spots. Animals are listed in the order their rows first appear.
 */
export function tableOdds(rows: SpawnRow[], spots: number, season: number): SpawnOdds[] {
  let states: State[] = [{ free: spots, seen: [], p: 1 }];
  const expected = new Map<string, number>();
  for (const row of rows) {
    if (row.season !== season) continue;
    if (!expected.has(row.animal)) expected.set(row.animal, 0);
    const pass = row.chance === null ? 1 : row.chance / 100;
    const [low, high] = row.count;
    const merged = new Map<string, State>();
    const add = (state: State) => {
      const key = `${state.free}|${state.seen.join(',')}`;
      const old = merged.get(key);
      if (old) old.p += state.p; else merged.set(key, { ...state });
    };
    for (const state of states) {
      if (state.free === 0) { add(state); continue; }
      if (pass < 1) add({ ...state, p: state.p * (1 - pass) });
      for (let n = low; n <= high; n++) {
        const placed = Math.min(n, state.free);
        const p = state.p * pass / (high - low + 1);
        expected.set(row.animal, expected.get(row.animal)! + p * placed);
        const seen = placed && !state.seen.includes(row.animal) ? [...state.seen, row.animal].sort() : state.seen;
        add({ free: state.free - placed, seen, p });
      }
    }
    states = [...merged.values()];
  }
  return [...expected].map(([animal, count]) => ({
    animal,
    atLeastOne: states.filter((state) => state.seen.includes(animal)).reduce((sum, state) => sum + state.p, 0),
    expected: count,
  }));
}

/** Seasons (0 = spring … 3 = winter) in which a table can place the animal at all. */
export const seasonsOf = (rows: SpawnRow[], animal: string) =>
  [0, 1, 2, 3].filter((season) => rows.some((row) => row.season === season && row.animal === animal && row.count[1] > 0 && row.chance !== 0));
