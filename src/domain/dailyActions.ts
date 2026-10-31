import type { DailyDigest, StopGroup } from './dailyDigest';
import type { DeliveryDigest, DeliveryPlan } from './dailyDeliveries';
import type { CollectLine, CollectPlan } from './dailyCollect';
import type { AnimalIdea } from './dailyLivestock';
import type { MaterialLine } from './dailyMaterials';
import type { PlantingIdea } from './dailyPlanting';
import type { BuildLine, MachineDay, ProcessingPlan } from './dailyProcessing';
import type { ItemSource } from './dailySources';

/**
 * Today's to-do list, most pressing first: what is lost tonight, deliveries
 * that can be finished, trips that finish others, machine work, then the
 * longer jobs (building machines and gathering their materials, sowing empty
 * land, animals the deliveries call for), what the encyclopedia still lacks and
 * last the routine farm care.
 * After midnight (a save before the 07:00 turnover) houses are closed and only
 * the cursed fish bite, so the catalog deliveries and day fishing are `later`:
 * they wait for the morning.
 */
export type DailyAction =
  | { kind: 'wither'; groups: StopGroup[] }
  | { kind: 'deliver'; plans: DeliveryPlan[]; later?: boolean }
  /** A fishing or foraging trip that brings in everything some deliveries still miss. */
  | { kind: 'fetch'; trip: 'fish' | 'wild'; items: Array<[itemId: number, count: number]>; plans: DeliveryPlan[]; later?: boolean }
  /** Finished products to take out, and the machines with slots to load today; `harvest` is produce to pick first because storage alone falls short. */
  | { kind: 'machines'; outputs: number; fill: MachineDay[]; harvest: number[] }
  /** Machines with a long queue that can be built or upgraded; `short` lists what is missing for one where nothing is in stock. */
  | { kind: 'build'; lines: BuildLine[]; short: MaterialLine[] }
  /** One material, or several saps gathered the same way. */
  | { kind: 'gather'; lines: Array<{ material: MaterialLine; source: ItemSource }> }
  /** The best few crops for the empty land. */
  | { kind: 'plant'; ideas: PlantingIdea[]; vacant: number }
  | { kind: 'animal'; idea: AnimalIdea }
  /** Encyclopedia entries to fill today: fish on the hook in the periods left, and everything else. */
  | { kind: 'collect'; fish: number[]; lines: CollectLine[] }
  | { kind: 'routine'; harvest: number[]; water: number[]; hungry: number };

/** Sources that a trip today can act on, best first. */
const ACTIONABLE: ItemSource['kind'][] = ['quarry', 'trees', 'sap', 'fish', 'wild', 'machine', 'field', 'plant'];
export function leadSource(sources: ItemSource[]): ItemSource | undefined {
  return [...sources].filter((source) => ACTIONABLE.includes(source.kind) && !('now' in source && !source.now))
    .sort((a, b) => ACTIONABLE.indexOf(a.kind) - ACTIONABLE.indexOf(b.kind))[0];
}

export function dailyActions(input: {
  digest: DailyDigest;
  deliveries: DeliveryDigest;
  processing: ProcessingPlan;
  materials: MaterialLine[];
  planting: PlantingIdea[];
  vacant: number;
  animals: AnimalIdea[];
  collect?: CollectPlan;
}): DailyAction[] {
  const { digest, deliveries, processing } = input;
  const night = digest.hoursToTurnover > 0;
  const actions: DailyAction[] = [];
  if (digest.seasonEnd.witherTomorrow.length) actions.push({ kind: 'wither', groups: digest.seasonEnd.witherTomorrow });
  // The catalog is handed in at the village head's house, which cannot be entered after midnight.
  const indoors = (plan: DeliveryPlan) => night && plan.spec.list === 'catalog';
  const handIn = deliveries.ready.filter((plan) => !indoors(plan)), morning = deliveries.ready.filter(indoors);
  if (handIn.length) actions.push({ kind: 'deliver', plans: handIn });
  const trips = new Map<string, Extract<DailyAction, { kind: 'fetch' }>>();
  for (const plan of deliveries.pending) {
    const missing = plan.lines.filter((line) => line.have < line.remain);
    // Day fish missed tonight can still be caught tomorrow, unless the season ends at this turnover.
    const sources = missing.map((line) => line.sources.find((entry): entry is Extract<ItemSource, { kind: 'fish' | 'wild' }> =>
      entry.kind === 'wild' ? entry.now : entry.kind === 'fish' && (entry.today || entry.now && digest.daysLeft > 0)));
    // Only lists that one trip finishes; a list that also waits on crops shows under deliveries.
    if (!missing.length || sources.some((source) => !source) || new Set(sources.map((source) => source!.kind)).size > 1) continue;
    const kind = sources[0]!.kind, later = sources.some((source) => source!.kind === 'fish' && !source!.today), key = `${kind}:${later}`;
    const trip = trips.get(key) ?? trips.set(key, { kind: 'fetch', trip: kind, items: [], plans: [], ...(later ? { later } : {}) }).get(key)!;
    for (const line of missing) {
      const entry = trip.items.find(([itemId]) => itemId === line.itemId);
      if (entry) entry[1] += line.remain - line.have;
      else trip.items.push([line.itemId, line.remain - line.have]);
    }
    trip.plans.push(plan);
  }
  actions.push(...[...trips.values()].filter((trip) => !trip.later));
  const outputs = digest.machines.done.reduce((sum, row) => sum + row.count, 0);
  const fill = processing.machines.filter((machine) => machine.fill.length);
  const picks = processing.produce.filter((line) => line.today > line.held - line.harvest).map((line) => line.itemId);
  if (outputs || fill.length) actions.push({ kind: 'machines', outputs, fill, harvest: picks });
  const short = input.materials.filter((line) => line.short > 0);
  const building = processing.build.filter((line) => line.options.length);
  if (building.length) actions.push({ kind: 'build', lines: building, short: short.filter((line) => !line.for) });
  // The deepest shortfall is the first thing to fetch: ore before the bars made from it.
  const saps: Array<{ material: MaterialLine; source: ItemSource }> = [];
  for (const material of short.filter((line) => !short.some((other) => other.for === line.itemId))) {
    const source = leadSource(material.sources);
    if (source?.kind === 'sap') saps.push({ material, source });
    else if (source) actions.push({ kind: 'gather', lines: [{ material, source }] });
  }
  if (saps.length) actions.push({ kind: 'gather', lines: saps });
  if (input.vacant > 0 && input.planting.length) actions.push({ kind: 'plant', ideas: input.planting.slice(0, 3), vacant: input.vacant });
  for (const idea of input.animals.filter((entry) => entry.room > 0).slice(0, 1)) actions.push({ kind: 'animal', idea });
  // Delivery shortfalls already have their trips above; this one is for the encyclopedia.
  const fish = [...new Set(input.collect?.spots.flatMap((spot) => spot.catches.filter((entry) => entry.missing).map((entry) => entry.itemId)))];
  const lines = input.collect?.lines.filter((line) => line.missing) ?? [];
  if (fish.length || lines.length) actions.push({ kind: 'collect', fish, lines });
  // Crops that wither tomorrow already lead the list; routine care covers the rest.
  const urgent = new Set(digest.seasonEnd.witherTomorrow.flatMap((group) => group.cells));
  const harvest = digest.harvest.flatMap((group) => group.cells).filter((cell) => !urgent.has(cell));
  if (harvest.length || digest.chores.water.length || digest.chores.hungry) actions.push({ kind: 'routine', harvest, water: digest.chores.water, hungry: digest.chores.hungry });
  if (morning.length) actions.push({ kind: 'deliver', plans: morning, later: true });
  actions.push(...[...trips.values()].filter((trip) => trip.later));
  return actions;
}
