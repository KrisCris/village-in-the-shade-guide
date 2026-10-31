import type { DailyCraft } from '../data/dailyPayload';
import type { DailyMachine } from '../lib/saveDaily';

/**
 * Today's machine work and the machines worth adding. A slot runs one batch.
 * Slots that are empty, hold finished products or finish before the day ends
 * take the produce held after deliveries, the batch that adds most per item
 * over selling it raw going in first. The player's pick for an item keeps it
 * to that recipe, or out of the machines.
 *
 * Produce left over waits for its most valuable recipe on a machine the farm
 * has, or on one it can build when that adds at least NEW_MACHINE_GAIN per
 * item. A machine whose slots need more than BUILD_DAYS for their running jobs,
 * today's batches and that queue is one to add more of.
 */
export interface MachineSpecRow { id: number; itemId: number; capacity: number; family: string; mode: string }
export interface ProcessRow { id: number; machines: number[]; inputs: Array<{ itemId: number; count: number }>; output: number; count: number; minutes: number }
export const NOT_PROCESSED = 0;
/** Extra value per item a recipe must add before the plan builds a kind of machine the farm does not have. */
export const NEW_MACHINE_GAIN = 20;
/** Days of queued work past which the plan suggests more of a machine. */
export const BUILD_DAYS = 7;

/** `machine` is the machine item that runs the recipe; `value` is the sale value per input item. */
export interface ProduceOption { process: number; output: number; family: string; machine: number; minutes: number; inputs: number; outputs: number; value: number }
export interface ProduceLine {
  itemId: number;
  /** Held after deliveries take theirs, with today's harvest. */
  held: number;
  /** The part of `held` today's harvest brings. */
  harvest: number;
  rawPrice: number;
  /** Most valuable first. */
  options: ProduceOption[];
  /** The player's pick, a recipe or NOT_PROCESSED; absent when the plan decides. */
  pick?: number;
  /**
   * The plan's own recipe, as if nothing were picked: the one most of today's
   * batches use, else the one the item waits for, else NOT_PROCESSED.
   */
  best: number;
  /** What the plan's own batches today add over selling raw, as if nothing were picked. */
  planned: number;
  /** Items going into machines today. */
  today: number;
}
/** `count` items in `batches` slots; `gain` is the money over selling them raw. */
export interface FillLine { itemId: number; option: ProduceOption; batches: number; count: number; gain: number }
export interface MachineDay {
  family: string;
  /** The first-level machine's item, used for its name and icon. */
  machine: number;
  machines: number;
  slots: number;
  /** Slots to load now: empty ones and those holding finished products. */
  free: number;
  /** Slots holding finished products. */
  ready: number;
  /** Running slots that finish before the day ends, by game seconds from now. */
  later: Array<{ after: number; slots: number }>;
  /** Game seconds until the first running slot finishes, when that is after today. */
  next?: number;
  fill: FillLine[];
}
export interface BuildOption {
  /** The machine crafted: the first level, or the upgraded one. */
  machine: number;
  /** Upgrades a first-level machine already built. */
  upgrade: boolean;
  /** A new upgraded machine: this first-level one is crafted and upgraded at once, so `inputs` covers both recipes. */
  via?: number;
  /** Slots one craft adds. */
  slots: number;
  /** Materials for one, leaving out the machine an upgrade consumes; `held` is what is free after deliveries. */
  inputs: Array<{ itemId: number; count: number; held: number }>;
  /** How many the materials cover; upgrades are also limited to the first-level machines standing. */
  afford: number;
  /** The material that runs out first, when materials rather than the machines standing set `afford`. */
  limit?: number;
  /** Upgrades: first-level machines on the farm. */
  basics?: number;
}
export interface BuildLine {
  family: string;
  machine: number;
  machines: number;
  slots: number;
  /** Machines of this kind held in the backpack or storage, not yet placed. */
  stored: number;
  /** Days today's slots need for the running jobs, today's batches and the waiting produce. */
  days: number;
  /** Produce waiting for this machine, most items first; `gain` is per item over selling raw. */
  waiting: Array<{ itemId: number; count: number; option: ProduceOption; gain: number }>;
  /** Money one more slot adds per day, from the waiting produce that pays most per day. */
  perSlot: number;
  options: BuildOption[];
  /** The first-level machine's recipe is not unlocked yet: the shrine skill that unlocks it. */
  locked?: { skill: string | null };
}
export interface ProcessingPlan { produce: ProduceLine[]; machines: MachineDay[]; build: BuildLine[] }

const DAY_MINUTES = 1440;
export const optionGain = (line: Pick<ProduceLine, 'rawPrice'>, option: ProduceOption) => option.value - line.rawPrice;

export function planProcessing(input: {
  machines: DailyMachine[];
  specs: MachineSpecRow[];
  processes: ProcessRow[];
  prices: Readonly<Record<string, number>>;
  crafts: DailyCraft[];
  unlocked: ReadonlySet<number>;
  /** Held items free after deliveries. */
  free: ReadonlyMap<number, number>;
  /** Produce today's harvest brings once deliveries take what they still lack; it can go in today too. */
  harvest?: ReadonlyMap<number, number>;
  /** Produce the plan should consider: crops, fruit, flowers, wild plants and animal products. */
  isProduce: (itemId: number) => boolean;
  choices?: Readonly<Record<string, number>>;
  /** Game seconds left today: slots finishing by then are loaded today. */
  dayLeft: number;
}): ProcessingPlan {
  const { machines, specs, prices, crafts, unlocked, free } = input;
  const specByGimmick = new Map(specs.filter((spec) => spec.mode === 'processing').map((spec) => [spec.id, spec]));
  const specByItem = new Map([...specByGimmick.values()].map((spec) => [spec.itemId, spec]));
  const craftOf = new Map(crafts.map((craft) => [craft.machine, craft]));
  const craftable = (itemId: number) => { const craft = craftOf.get(itemId); return !!craft && (craft.flag === null || unlocked.has(craft.flag)); };
  const owned = new Map<string, DailyMachine[]>();
  for (const machine of machines) {
    const spec = specByItem.get(machine.itemId);
    if (spec) owned.set(spec.family, [...owned.get(spec.family) ?? [], machine]);
  }
  const familyItems = (family: string) => [...specByItem.values()].filter((spec) => spec.family === family).sort((a, b) => a.capacity - b.capacity);
  const usable = (family: string) => owned.has(family) || familyItems(family).some((spec) => craftable(spec.itemId));
  const capacity = (list: DailyMachine[]) => list.reduce((sum, machine) => sum + (specByItem.get(machine.itemId)?.capacity ?? 0), 0);
  const running = (job: DailyMachine['jobs'][number]) => !!job.output && job.seconds > 0;

  const produce: ProduceLine[] = [];
  for (const itemId of new Set([...free.keys(), ...input.harvest?.keys() ?? []])) {
    const harvest = input.harvest?.get(itemId) ?? 0, held = Math.max(free.get(itemId) ?? 0, 0) + harvest;
    if (held <= 0 || !input.isProduce(itemId)) continue;
    const options = input.processes.flatMap((process): ProduceOption[] => {
      const spec = specByGimmick.get(process.machines[0]);
      if (process.inputs.length !== 1 || process.inputs[0].itemId !== itemId || !spec) return [];
      return [{ process: process.id, output: process.output, family: spec.family, machine: spec.itemId, minutes: process.minutes, inputs: process.inputs[0].count, outputs: process.count,
        value: (prices[process.output] ?? 0) * process.count / process.inputs[0].count }];
    }).sort((a, b) => b.value - a.value || a.minutes - b.minutes);
    if (!options.length) continue;
    const pick = input.choices?.[itemId];
    const valid = pick === NOT_PROCESSED || options.some((option) => option.process === pick);
    produce.push({ itemId, held, harvest, rawPrice: prices[itemId] ?? 0, options, ...(valid ? { pick } : {}), best: NOT_PROCESSED, planned: 0, today: 0 });
  }
  produce.sort((a, b) => b.held - a.held || a.itemId - b.itemId);
  // Every recipe that sells for more than the raw item, or the player's pick in their place.
  const paying = (line: ProduceLine) => line.options.filter((option) => option.value > line.rawPrice);
  const allowed = (line: ProduceLine) => line.pick === undefined ? paying(line) : line.options.filter((option) => option.process === line.pick);
  // Where produce left over waits: a recipe on a machine the farm has, else on one it can build that adds enough.
  const waitFor = (line: ProduceLine, options: ProduceOption[], picked: boolean) => options.find((option) => owned.has(option.family))
    ?? options.find((option) => usable(option.family) && (picked || optionGain(line, option) >= NEW_MACHINE_GAIN));

  const days: MachineDay[] = [];
  for (const [family, list] of owned) {
    const day: MachineDay = { family, machine: familyItems(family)[0]?.itemId ?? list[0].itemId, machines: list.length, slots: capacity(list), free: 0, ready: 0, later: [], fill: [] };
    let busy = 0, next = Infinity;
    for (const job of list.flatMap((machine) => machine.jobs).filter(running)) {
      busy++;
      if (job.remaining <= 0) { day.ready++; continue; }
      if (job.remaining > input.dayLeft) { next = Math.min(next, job.remaining); continue; }
      // Jobs loaded together finish together; group them by the minute.
      const after = Math.ceil(job.remaining / 60) * 60, group = day.later.find((entry) => entry.after === after);
      if (group) group.slots++;
      else day.later.push({ after, slots: 1 });
    }
    day.free = day.slots - busy + day.ready;
    // Slots finishing within the hour read as one round, at the time the last of them is done.
    day.later = day.later.sort((a, b) => a.after - b.after).reduce<MachineDay['later']>((rounds, entry) => {
      const last = rounds.at(-1);
      if (last && entry.after - last.after <= 3600) { last.slots += entry.slots; last.after = entry.after; } else rounds.push({ ...entry });
      return rounds;
    }, []);
    if (!day.free && !day.later.length && Number.isFinite(next)) day.next = next;
    days.push(day);
  }

  const openings = new Map(days.map((day) => [day.family, day.free + day.later.reduce((sum, entry) => sum + entry.slots, 0)]));
  const fill = bestFill(produce, allowed, openings);
  for (const { line, option, batches } of fill) {
    line.today += batches * option.inputs;
    days.find((day) => day.family === option.family)!.fill.push({ itemId: line.itemId, option, batches, count: batches * option.inputs, gain: batches * option.inputs * optionGain(line, option) });
  }
  for (const day of days) day.fill.sort((a, b) => b.gain - a.gain || b.count - a.count);
  // The plan's own choice for every item, picked ones included, so the player can see what it would do.
  const auto = produce.some((line) => line.pick !== undefined) ? bestFill(produce, paying, openings) : fill;
  for (const line of produce) {
    const uses = auto.filter((use) => use.line === line), [main] = [...uses].sort((a, b) => b.batches * b.option.inputs - a.batches * a.option.inputs);
    line.best = (main?.option ?? waitFor(line, paying(line), false))?.process ?? NOT_PROCESSED;
    line.planned = uses.reduce((sum, use) => sum + use.batches * use.option.inputs * optionGain(line, use.option), 0);
  }
  days.sort((a, b) => b.fill.reduce((sum, entry) => sum + entry.gain, 0) - a.fill.reduce((sum, entry) => sum + entry.gain, 0) || b.slots - a.slots);

  const waiting = new Map<string, BuildLine['waiting']>();
  for (const line of produce) {
    const left = line.held - line.today, option = waitFor(line, allowed(line), line.pick !== undefined);
    if (!option || left < option.inputs) continue;
    waiting.set(option.family, [...waiting.get(option.family) ?? [], { itemId: line.itemId, count: left, option, gain: optionGain(line, option) }]);
  }

  const build: BuildLine[] = [];
  for (const [family, queue] of waiting) {
    const list = owned.get(family) ?? [], levels = familyItems(family), slots = capacity(list);
    const day = days.find((entry) => entry.family === family);
    const work = list.flatMap((machine) => machine.jobs).filter(running).reduce((sum, job) => sum + Math.max(job.remaining, 0) / 60, 0)
      + (day?.fill ?? []).reduce((sum, entry) => sum + entry.batches * entry.option.minutes, 0)
      + queue.reduce((sum, entry) => sum + Math.floor(entry.count / entry.option.inputs) * entry.option.minutes, 0);
    const need = slots ? work / slots / DAY_MINUTES : Infinity;
    if (need <= BUILD_DAYS) continue;
    const [basic, upgraded] = [levels[0], levels.find((spec) => spec.capacity > (levels[0]?.capacity ?? 1))];
    const line: BuildLine = {
      family, machine: basic?.itemId ?? list[0]?.itemId ?? 0, machines: list.length, slots, days: need,
      stored: levels.reduce((sum, spec) => sum + (free.get(spec.itemId) ?? 0), 0),
      waiting: queue.sort((a, b) => b.count - a.count),
      perSlot: Math.max(...queue.map((entry) => entry.gain * entry.option.inputs / (entry.option.minutes / DAY_MINUTES))),
      options: [],
    };
    const recipe = (itemId: number) => (craftOf.get(itemId)?.inputs ?? []).filter(([id]) => !specByItem.has(id)).map(([id, count]) => ({ itemId: id, count, held: free.get(id) ?? 0 }));
    const afford = (inputs: BuildOption['inputs']) => inputs.length ? Math.min(...inputs.map((entry) => Math.floor(entry.held / entry.count))) : 0;
    const limit = (inputs: BuildOption['inputs'], count: number) => count === afford(inputs) ? inputs.find((entry) => Math.floor(entry.held / entry.count) === count)?.itemId : undefined;
    if (basic && craftable(basic.itemId)) {
      const canUpgrade = !!upgraded && craftable(upgraded.itemId);
      const basics = list.filter((machine) => machine.itemId === basic.itemId).length;
      if (upgraded && canUpgrade && basics) {
        const inputs = recipe(upgraded.itemId), count = Math.min(basics, afford(inputs)), short = limit(inputs, count);
        line.options.push({ machine: upgraded.itemId, upgrade: true, slots: upgraded.capacity - basic.capacity, inputs, afford: count, ...(short ? { limit: short } : {}), basics });
      }
      // A new upgraded machine holds more slots in the floor space of one.
      if (upgraded && canUpgrade) {
        const inputs: BuildOption['inputs'] = [];
        for (const entry of [...recipe(basic.itemId), ...recipe(upgraded.itemId)]) {
          const same = inputs.find((input) => input.itemId === entry.itemId);
          if (same) same.count += entry.count;
          else inputs.push({ ...entry });
        }
        const count = afford(inputs), short = limit(inputs, count);
        line.options.push({ machine: upgraded.itemId, upgrade: false, via: basic.itemId, slots: upgraded.capacity, inputs, afford: count, ...(short ? { limit: short } : {}) });
      }
      const inputs = recipe(basic.itemId), count = afford(inputs), short = limit(inputs, count);
      line.options.push({ machine: basic.itemId, upgrade: false, slots: basic.capacity, inputs, afford: count, ...(short ? { limit: short } : {}) });
    } else if (basic) line.locked = { skill: craftOf.get(basic.itemId)?.skill ?? null };
    build.push(line);
  }
  // Machines the farm has, longest queue first, then kinds it does not have yet.
  build.sort((a, b) => Number(!a.machines) - Number(!b.machines) || b.days - a.days || b.perSlot - a.perSlot);
  return { produce, machines: days, build };
}

/**
 * The batches that earn most over selling raw, within each machine's open
 * slots: a min-cost flow from the produce through its recipes to the machines,
 * one unit per batch, augmented while a path still adds money. A recipe the
 * player picked that sells for no more than the raw item still runs, after
 * everything that pays.
 */
function bestFill(produce: ProduceLine[], allowed: (line: ProduceLine) => ProduceOption[], openings: ReadonlyMap<string, number>) {
  interface Edge { to: number; cap: number; cost: number; back: number }
  const graph: Edge[][] = [];
  const node = () => graph.push([]) - 1;
  const link = (from: number, to: number, cap: number, cost: number) => {
    graph[from].push({ to, cap, cost, back: graph[to].length });
    graph[to].push({ to: from, cap: 0, cost: -cost, back: graph[from].length - 1 });
    return graph[from].at(-1)!;
  };
  const source = node(), sink = node(), machine = new Map<string, number>();
  for (const [family, open] of openings) if (open > 0) machine.set(family, node());
  for (const [family, id] of machine) link(id, sink, openings.get(family)!, 0);
  const uses: Array<{ line: ProduceLine; option: ProduceOption; edge: Edge }> = [];
  for (const line of produce) {
    const options = allowed(line).filter((option) => machine.has(option.family));
    if (!options.length) continue;
    const id = node();
    link(source, id, Math.floor(line.held / Math.min(...options.map((option) => option.inputs))), 0);
    for (const option of options) uses.push({ line, option, edge: link(id, machine.get(option.family)!, Infinity, -Math.max(optionGain(line, option) * option.inputs, 0.5)) });
  }
  for (;;) {
    const cost = graph.map(() => Infinity), via: Array<[from: number, index: number]> = [];
    cost[source] = 0;
    for (let changed = true, round = 0; changed && round < graph.length; round++) {
      changed = false;
      graph.forEach((edges, from) => {
        if (cost[from] === Infinity) return;
        edges.forEach((edge, index) => {
          if (edge.cap > 0 && cost[from] + edge.cost < cost[edge.to]) { cost[edge.to] = cost[from] + edge.cost; via[edge.to] = [from, index]; changed = true; }
        });
      });
    }
    if (!(cost[sink] < 0)) break;
    let push = Infinity;
    for (let at = sink; at !== source; at = via[at][0]) push = Math.min(push, graph[via[at][0]][via[at][1]].cap);
    for (let at = sink; at !== source; at = via[at][0]) {
      const edge = graph[via[at][0]][via[at][1]];
      edge.cap -= push;
      graph[edge.to][edge.back].cap += push;
    }
  }
  return uses.map(({ line, option, edge }) => ({ line, option, batches: graph[edge.to][edge.back].cap })).filter((use) => use.batches > 0);
}
