import type { DailyPayload } from '../data/dailyPayload';
import type { Catalog } from '../data/types';
import { DAILY_CROPS, type DailySnapshot } from '../lib/saveDaily';
import { MACHINES } from '../lib/saveMachines';
import { MAP_DATA } from '../lib/saveMap';
import { dailyActions } from './dailyActions';
import { collectPlan } from './dailyCollect';
import { DAYS_PER_SEASON, harvestToday, orchard, ripening, type DailyDigest } from './dailyDigest';
import { freeAfterDeliveries, planDeliveries } from './dailyDeliveries';
import { livestockPlan } from './dailyLivestock';
import { planMaterials } from './dailyMaterials';
import { plantingIdeas } from './dailyPlanting';
import { planProcessing } from './dailyProcessing';
import { itemSources, periodsLeft, type ItemSource, type SourceContext, type SourceProcess } from './dailySources';

/** Item categories the processing plan treats as produce. */
const PRODUCE = new Set(['ITEM_CATEGORY_CROPS', 'ITEM_CATEGORY_FRUIT', 'ITEM_CATEGORY_FLOWER', 'ITEM_CATEGORY_WILD_VEGETABLE', 'ITEM_CATEGORY_LIVESTOCK_PRODUCT']);
const SOURCE_PROCESSES: SourceProcess[] = MACHINES.processes.map((process) => ({
  output: process.output, count: process.count, minutes: process.minutes,
  inputs: process.inputs.map((input): [number, number] => [input.itemId, input.count]),
  machine: MACHINES.machines.find((machine) => machine.id === process.machines[0])?.itemId ?? 0,
}));
const FAMILY_OF_PROCESS = new Map(MACHINES.processes.map((process) => [process.id, MACHINES.machines.find((machine) => machine.id === process.machines[0])?.family ?? '']));
const SOURCE_FAMILIES = MACHINES.processes.map((process) => FAMILY_OF_PROCESS.get(process.id) ?? '');
const EXTRACTORS = new Set(MACHINES.machines.filter((machine) => machine.mode === 'extractor').map((machine) => machine.itemId));

/** Game seconds until today ends: midnight, or the 07:00 turnover for a save made after midnight. */
export const dayLeft = ({ hour, minute }: { hour: number; minute: number }) => ((hour < 7 ? 7 : 24) * 60 - hour * 60 - minute) * 60;

/** Unlock flags the plan needs read from the save: machine recipes, animal house orders and wild spawns that wait for the story. */
export const planFlags = (payload: DailyPayload) => [...[...payload.crafts, ...payload.houses].flatMap((entry) => entry.flag === null ? [] : [entry.flag]),
  ...Object.values(payload.wild).flatMap((spawn) => spawn.flag === undefined ? [] : [spawn.flag]),
  ...Object.values(payload.seeds).flatMap((seed) => seed.sales.flatMap((sale) => sale.flags))];

/**
 * Every part of the daily page from one save: deliveries, what goes in the
 * machines today, the machines to add and what they cost, sowing, animals,
 * what is left to collect and today's list. `itemCategory` names an item's
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
  /** Items the encyclopedia never lists. */
  hidden: ReadonlySet<number>;
  settings: { choices: Record<string, number> };
  /** Empty cells in the farm area. */
  vacant: number;
}) {
  const { snapshot, payload, unlocked, settings } = input;
  const rows = ripening(snapshot, DAILY_CROPS);
  const held = new Map<number, number>();
  for (const stack of snapshot.held) held.set(stack.itemId, (held.get(stack.itemId) ?? 0) + stack.count);
  const collectors = new Map<number, number>();
  for (const machine of snapshot.machines) if (EXTRACTORS.has(machine.itemId)) for (const job of machine.jobs) if (job.output) collectors.set(job.output, (collectors.get(job.output) ?? 0) + 1);
  const context: SourceContext = {
    season: snapshot.date.season, periods: periodsLeft(snapshot.date.hour), daysLeft: DAYS_PER_SEASON - snapshot.date.day, crops: DAILY_CROPS, ripening: rows, payload, owned: new Set(snapshot.houses.flatMap((house) => house.residents)),
    trees: snapshot.trees, held, processes: SOURCE_PROCESSES, quarryReached: snapshot.quarryReached, collectors, unlocked, orchard: orchard(snapshot, DAILY_CROPS),
  };
  const deliveries = planDeliveries(payload.bundles, snapshot.bundles, snapshot.held, context, snapshot.catalogOpen);
  const free = freeAfterDeliveries(snapshot.held, deliveries);
  const needs = new Map<number, number>();
  for (const pending of deliveries.pending) for (const line of pending.lines) if (line.have < line.remain) needs.set(line.itemId, (needs.get(line.itemId) ?? 0) + line.remain - line.have);
  // Today's ripe crops and fruit can go in the machines today too, once the deliveries that still lack them take theirs.
  const fruit = (crop: number) => {
    const id = (input.crops.entities.find((entity) => entity.kind === 'crops' && entity.numeric_id === crop)?.harvest_item_ids as string[] | undefined)?.[0];
    return id ? input.crops.byId[id]?.numeric_id as number | undefined : undefined;
  };
  const harvest = new Map([...harvestToday(snapshot.cells, input.digest.harvest, DAILY_CROPS, fruit)]
    .map(([itemId, count]): [number, number] => [itemId, count - (needs.get(itemId) ?? 0)]).filter(([, count]) => count > 0));
  const processing = planProcessing({
    machines: snapshot.machines, specs: MACHINES.machines, processes: MACHINES.processes, prices: payload.prices, crafts: payload.crafts, unlocked, free, harvest,
    isProduce: (itemId) => PRODUCE.has(input.itemCategory(itemId) ?? ''), choices: settings.choices, dayLeft: dayLeft(snapshot.date),
  });
  // Where to get the material that runs out first for each machine, and what one of each machine nothing is in stock for would take.
  const sources = new Map<number, ItemSource[]>();
  for (const option of processing.build.flatMap((line) => line.options)) {
    for (const entry of option.inputs) {
      if ((entry.held < entry.count || entry.itemId === option.limit) && !sources.has(entry.itemId)) sources.set(entry.itemId, itemSources(entry.itemId, { ...context, held: free }));
    }
  }
  const blocked = new Map<number, number>();
  for (const line of processing.build) {
    if (!line.options.length || line.options.some((option) => option.afford > 0)) continue;
    // The cheapest way in: an upgrade or one first-level machine, not both crafts at once.
    for (const entry of line.options.find((option) => !option.via)!.inputs) blocked.set(entry.itemId, (blocked.get(entry.itemId) ?? 0) + entry.count);
  }
  const materials = planMaterials([...blocked], free, { ...context, held: free });
  // Planting ideas count a recipe only when its machines are on the farm and keep up with what is held.
  const room = new Set(processing.machines.filter((machine) => !processing.build.some((line) => line.family === machine.family)).map((machine) => machine.family));
  const planting = plantingIdeas({
    catalog: input.crops, date: snapshot.date, soils: MAP_DATA.cropRules as Record<string, { soils: number[] }>, heldSeeds: held, needs,
    canProcess: (process) => room.has(FAMILY_OF_PROCESS.get(process) ?? ''),
  });
  const livestock = livestockPlan(snapshot.houses, deliveries.pending, payload.animals, payload.houses, unlocked);
  // Products count when the farm has the machine and the stock left after deliveries covers one batch.
  const families = new Set(processing.machines.map((machine) => machine.family));
  const collect = collectPlan({
    fishing: payload.fishing, registered: new Set(snapshot.encyclopedia), hidden: input.hidden, needs,
    context: { ...context, held: free, processes: SOURCE_PROCESSES.filter((_, index) => families.has(SOURCE_FAMILIES[index])) },
  });
  const actions = dailyActions({ digest: input.digest, deliveries, processing, materials, planting, vacant: input.vacant, animals: livestock.ideas, collect });
  return { deliveries, processing, sources, materials, planting, livestock, collect, actions };
}
