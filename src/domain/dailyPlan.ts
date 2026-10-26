import type { DailyPayload } from '../data/dailyPayload';
import type { Catalog } from '../data/types';
import { DAILY_CROPS, type DailySnapshot } from '../lib/saveDaily';
import { MACHINES } from '../lib/saveMachines';
import { MAP_DATA } from '../lib/saveMap';
import { dailyActions } from './dailyActions';
import { DAYS_PER_SEASON, ripening, type DailyDigest } from './dailyDigest';
import { freeAfterDeliveries, planDeliveries } from './dailyDeliveries';
import { livestockPlan } from './dailyLivestock';
import { planMaterials } from './dailyMaterials';
import { plantingIdeas } from './dailyPlanting';
import { expectedHarvest, MIN_HORIZON, planProcessing } from './dailyProcessing';
import type { SourceContext, SourceProcess } from './dailySources';

/** Item categories the processing plan treats as produce. */
const PRODUCE = new Set(['ITEM_CATEGORY_CROPS', 'ITEM_CATEGORY_FRUIT', 'ITEM_CATEGORY_FLOWER', 'ITEM_CATEGORY_WILD_VEGETABLE', 'ITEM_CATEGORY_LIVESTOCK_PRODUCT']);
const SOURCE_PROCESSES: SourceProcess[] = MACHINES.processes.map((process) => ({
  output: process.output, count: process.count, minutes: process.minutes,
  inputs: process.inputs.map((input): [number, number] => [input.itemId, input.count]),
  machine: MACHINES.machines.find((machine) => machine.id === process.machines[0])?.itemId ?? 0,
}));
const FAMILY_OF_PROCESS = new Map(MACHINES.processes.map((process) => [process.id, MACHINES.machines.find((machine) => machine.id === process.machines[0])?.family ?? '']));

/** Unlock flags the plan needs read from the save: machine recipes and animal house orders. */
export const planFlags = (payload: DailyPayload) => [...payload.crafts, ...payload.houses].flatMap((entry) => entry.flag === null ? [] : [entry.flag]);

/**
 * Every part of the daily page from one save: deliveries, machines, the
 * materials to build more, sowing, animals and today's list. `horizon` 0 is the
 * end of the season (at least a week); `itemCategory` names an item's
 * category so only produce is planned for processing.
 */
export function dailyPlan(input: {
  snapshot: DailySnapshot;
  digest: DailyDigest;
  payload: DailyPayload;
  /** The profit planner's entities, for the planting maths. */
  crops: Catalog;
  unlocked: ReadonlySet<number>;
  itemCategory: (itemId: number) => string | undefined;
  settings: { horizon: number; reserve: number; choices: Record<string, number> };
  /** Empty cells in the farm area. */
  vacant: number;
}) {
  const { snapshot, payload, unlocked, settings } = input;
  const horizon = settings.horizon || Math.max(DAYS_PER_SEASON - snapshot.date.day, MIN_HORIZON);
  const rows = ripening(snapshot, DAILY_CROPS);
  const held = new Map<number, number>();
  for (const stack of snapshot.held) held.set(stack.itemId, (held.get(stack.itemId) ?? 0) + stack.count);
  const context: SourceContext = {
    season: snapshot.date.season, crops: DAILY_CROPS, ripening: rows, payload, owned: new Set(snapshot.houses.flatMap((house) => house.residents)),
    trees: snapshot.trees, held, processes: SOURCE_PROCESSES, quarryReached: snapshot.quarryReached,
  };
  const deliveries = planDeliveries(payload.bundles, snapshot.bundles, snapshot.held, context, snapshot.catalogOpen);
  const free = freeAfterDeliveries(snapshot.held, deliveries);
  const processing = planProcessing({
    machines: snapshot.machines, specs: MACHINES.machines, processes: MACHINES.processes, prices: payload.prices, crafts: payload.crafts, unlocked, free,
    coming: expectedHarvest(rows, DAILY_CROPS, horizon), isProduce: (itemId) => PRODUCE.has(input.itemCategory(itemId) ?? ''), choices: settings.choices, horizon,
  });
  const materials = planMaterials(processing.materials, free, settings.reserve, { ...context, held: free });
  const needs = new Map<number, number>();
  for (const pending of deliveries.pending) for (const line of pending.lines) if (line.have < line.remain) needs.set(line.itemId, (needs.get(line.itemId) ?? 0) + line.remain - line.have);
  // Planting ideas count a recipe only when its machines are on the farm and have time to spare.
  const room = new Set(processing.families.filter((family) => family.machines > 0 && family.days <= horizon).map((family) => family.family));
  const planting = plantingIdeas({
    catalog: input.crops, date: snapshot.date, soils: MAP_DATA.cropRules as Record<string, { soils: number[] }>, heldSeeds: held, needs,
    canProcess: (process) => room.has(FAMILY_OF_PROCESS.get(process) ?? ''),
  });
  const livestock = livestockPlan(snapshot.houses, deliveries.pending, payload.animals, payload.houses, unlocked);
  const actions = dailyActions({ digest: input.digest, deliveries, processing, materials, planting, vacant: input.vacant, animals: livestock.ideas });
  return { horizon, deliveries, processing, materials, planting, livestock, actions };
}
