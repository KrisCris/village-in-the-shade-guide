import type { DailyCraft } from '../data/dailyPayload';
import type { DailyMachine } from '../lib/saveDaily';
import type { CellRow, CropRules } from './dailyDigest';

/**
 * Whether the machines on the farm can keep up with the produce in hand and
 * the harvest still to come, and which machines to build if not. Each kind of
 * produce goes to one recipe. The player's pick wins; otherwise produce is
 * placed in order of what processing adds to it, on the most valuable recipe
 * whose owned machines still have room, then on the most valuable owned one
 * even if it overflows, and only then on a machine not built yet, when that
 * adds at least NEW_MACHINE_GAIN per item over selling it raw.
 */
export interface MachineSpecRow { id: number; itemId: number; capacity: number; family: string; mode: string }
export interface ProcessRow { id: number; machines: number[]; inputs: Array<{ itemId: number; count: number }>; output: number; count: number; minutes: number }
export const NOT_PROCESSED = 0;
/** Extra value per item a recipe must add before the plan builds a kind of machine the farm does not have. */
export const NEW_MACHINE_GAIN = 20;

/** `machine` is the machine item that runs the recipe; `value` is the sale value per input item. */
export interface ProduceOption { process: number; output: number; family: string; machine: number; minutes: number; inputs: number; outputs: number; value: number }
export interface ProduceLine {
  itemId: number;
  /** Held after deliveries take theirs. */
  held: number;
  /** Expected from crops ripening within the horizon. */
  coming: number;
  rawPrice: number;
  options: ProduceOption[];
  /** The chosen recipe, or NOT_PROCESSED. */
  choice: number;
}
export interface BuildStep { machine: number; count: number; upgrade: boolean }
export interface FamilyLine {
  family: string;
  /** The first-level machine's item, used for its name and icon. */
  machine: number;
  machines: number;
  /** Machines with every slot empty. */
  idle: number;
  slots: number;
  /** Game minutes the machines are already committed to within the horizon. */
  busy: number;
  demand: number;
  /** Days to finish the current jobs and the assigned produce at today's capacity. */
  days: number;
  extraSlots: number;
  build: BuildStep[];
  /** The craft recipe is not unlocked yet: the shrine skill that unlocks it. */
  locked?: { skill: string | null };
}
export interface ProcessingPlan { horizon: number; produce: ProduceLine[]; families: FamilyLine[]; materials: Array<[itemId: number, count: number]> }

/** Days the plan looks ahead: the rest of the season, at least a week. */
export const MIN_HORIZON = 7;
const DAY_MINUTES = 1440;

/** Items the crops ripening within `horizon` turnovers yield, counting regrowth picks. */
export function expectedHarvest(rows: Array<CellRow & { days: number; left: number }>, crops: CropRules, horizon: number): Map<number, number> {
  const result = new Map<number, number>();
  const add = (items: Array<[number, number]> | undefined) => { for (const [id, count] of items ?? []) result.set(id, (result.get(id) ?? 0) + count); };
  for (const row of rows) {
    const rule = crops.get(row.crop);
    if (!rule || row.days > horizon) continue;
    add(rule.harvest);
    if (!rule.regrow?.days) continue;
    for (let day = row.days + rule.regrow.days; day <= Math.min(horizon, row.left); day += rule.regrow.days) add(rule.regrow.items);
  }
  return result;
}

export function planProcessing(input: {
  machines: DailyMachine[];
  specs: MachineSpecRow[];
  processes: ProcessRow[];
  prices: Readonly<Record<string, number>>;
  crafts: DailyCraft[];
  unlocked: ReadonlySet<number>;
  /** Held items free after deliveries. */
  free: ReadonlyMap<number, number>;
  coming: ReadonlyMap<number, number>;
  /** Produce the plan should consider: crops, fruit, flowers, wild plants and animal products. */
  isProduce: (itemId: number) => boolean;
  choices?: Readonly<Record<string, number>>;
  horizon: number;
}): ProcessingPlan {
  const { machines, specs, prices, crafts, unlocked, horizon } = input;
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

  const window = horizon * DAY_MINUTES;
  const room = new Map<string, number>();
  for (const [family, list] of owned) {
    const slots = list.reduce((sum, machine) => sum + (specByItem.get(machine.itemId)?.capacity ?? 0), 0);
    room.set(family, slots * window - list.reduce((sum, machine) => sum + machine.jobs.reduce((total, job) => total + Math.min(Math.max(job.remaining, 0) / 60, window), 0), 0));
  }

  const produce: ProduceLine[] = [];
  const items = [...new Set([...input.free.keys(), ...input.coming.keys()])].filter((id) => input.isProduce(id));
  for (const itemId of items) {
    const held = input.free.get(itemId) ?? 0, coming = input.coming.get(itemId) ?? 0;
    if (held + coming <= 0) continue;
    const options = input.processes.flatMap((process): ProduceOption[] => {
      const spec = specByGimmick.get(process.machines[0]);
      if (process.inputs.length !== 1 || process.inputs[0].itemId !== itemId || !spec) return [];
      return [{ process: process.id, output: process.output, family: spec.family, machine: spec.itemId, minutes: process.minutes, inputs: process.inputs[0].count, outputs: process.count,
        value: (prices[process.output] ?? 0) * process.count / process.inputs[0].count }];
    }).sort((a, b) => b.value - a.value || a.minutes - b.minutes);
    if (options.length) produce.push({ itemId, held, coming, rawPrice: prices[itemId] ?? 0, options, choice: NOT_PROCESSED });
  }
  const minutes = (line: ProduceLine, option: ProduceOption) => Math.floor((line.held + line.coming) / option.inputs) * option.minutes;
  const stake = (line: ProduceLine) => (line.held + line.coming) * Math.max(0, line.options[0].value - line.rawPrice);
  for (const line of [...produce].sort((a, b) => stake(b) - stake(a))) {
    const picked = input.choices?.[line.itemId];
    const worth = line.options.filter((option) => option.value > line.rawPrice);
    const mine = worth.filter((option) => owned.has(option.family));
    const option = picked !== undefined && (picked === NOT_PROCESSED || line.options.some((entry) => entry.process === picked))
      ? line.options.find((entry) => entry.process === picked)
      : mine.find((entry) => (room.get(entry.family) ?? 0) >= minutes(line, entry)) ?? mine[0]
        ?? worth.find((entry) => entry.value - line.rawPrice >= NEW_MACHINE_GAIN && usable(entry.family));
    line.choice = option?.process ?? NOT_PROCESSED;
    if (option) room.set(option.family, (room.get(option.family) ?? 0) - minutes(line, option));
  }
  produce.sort((a, b) => b.held + b.coming - a.held - a.coming || a.itemId - b.itemId);

  const demand = new Map<string, number>();
  for (const line of produce) {
    const option = line.options.find((entry) => entry.process === line.choice);
    if (option) demand.set(option.family, (demand.get(option.family) ?? 0) + Math.floor((line.held + line.coming) / option.inputs) * option.minutes);
  }
  const families: FamilyLine[] = [];
  const materials = new Map<number, number>();
  for (const family of new Set([...owned.keys(), ...demand.keys()])) {
    const list = owned.get(family) ?? [], levels = familyItems(family);
    const slots = list.reduce((sum, machine) => sum + (specByItem.get(machine.itemId)?.capacity ?? 0), 0);
    const busy = list.reduce((sum, machine) => sum + machine.jobs.reduce((total, job) => total + Math.min(Math.max(job.remaining, 0) / 60, window), 0), 0);
    const need = demand.get(family) ?? 0;
    const days = need + busy === 0 ? 0 : slots ? (need + busy) / slots / DAY_MINUTES : Infinity;
    const extraSlots = days <= horizon ? 0 : Math.ceil((need + busy) / window) - slots;
    const line: FamilyLine = { family, machine: levels[0]?.itemId ?? list[0]?.itemId ?? 0, machines: list.length, idle: list.filter((machine) => machine.jobs.every((job) => !job.output || !job.seconds)).length, slots, busy, demand: need, days, extraSlots, build: [] };
    if (extraSlots > 0) {
      const [basic, upgraded] = [levels[0], levels.find((spec) => spec.capacity > (levels[0]?.capacity ?? 1))];
      const basics = list.filter((machine) => machine.itemId === basic?.itemId).length;
      const gain = upgraded && basic ? upgraded.capacity - basic.capacity : 0;
      if (basic && craftable(basic.itemId)) {
        if (upgraded && gain > 0 && craftable(upgraded.itemId)) {
          // Upgrading a machine already standing is the cheapest slot; new ones are built and upgraded.
          const upgrades = Math.min(basics, Math.ceil(extraSlots / gain));
          const fresh = Math.max(0, Math.ceil((extraSlots - upgrades * gain) / upgraded.capacity));
          if (fresh) line.build.push({ machine: basic.itemId, count: fresh, upgrade: false });
          line.build.push({ machine: upgraded.itemId, count: upgrades + fresh, upgrade: true });
        } else line.build.push({ machine: basic.itemId, count: Math.ceil(extraSlots / basic.capacity), upgrade: false });
      } else if (basic) line.locked = { skill: craftOf.get(basic.itemId)?.skill ?? null };
      for (const step of line.build) {
        for (const [itemId, count] of craftOf.get(step.machine)?.inputs ?? []) {
          // The upgrade recipe consumes the first-level machine, which the plan already counts.
          if (!specByItem.has(itemId)) materials.set(itemId, (materials.get(itemId) ?? 0) + count * step.count);
        }
      }
    }
    families.push(line);
  }
  families.sort((a, b) => Number(b.extraSlots > 0) - Number(a.extraSlots > 0) || b.days - a.days);
  return { horizon, produce, families, materials: [...materials] };
}
