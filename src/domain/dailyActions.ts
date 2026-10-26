import type { DailyDigest, StopGroup } from './dailyDigest';
import type { DeliveryDigest, DeliveryPlan } from './dailyDeliveries';
import type { AnimalIdea } from './dailyLivestock';
import type { MaterialLine } from './dailyMaterials';
import type { PlantingIdea } from './dailyPlanting';
import { NOT_PROCESSED, type FamilyLine, type ProcessingPlan } from './dailyProcessing';
import type { ItemSource } from './dailySources';

/**
 * Today's to-do list, most pressing first: what is lost tonight, deliveries
 * that can be finished, trips that finish others, machine work, then the
 * longer jobs (building machines and gathering their materials, sowing empty
 * land, animals the deliveries call for) and last the routine farm care.
 */
export type DailyAction =
  | { kind: 'wither'; groups: StopGroup[] }
  | { kind: 'deliver'; plans: DeliveryPlan[] }
  /** A fishing or foraging trip today that brings in everything some deliveries still miss. */
  | { kind: 'fetch'; trip: 'fish' | 'wild'; items: Array<[itemId: number, count: number]>; plans: DeliveryPlan[] }
  /** Finished products to take out, and idle machines with the produce the plan gives them. */
  | { kind: 'machines'; outputs: number; fill: Array<{ family: FamilyLine; produce: number[] }> }
  | { kind: 'build'; families: FamilyLine[]; short: MaterialLine[] }
  /** One material, or several saps gathered the same way. */
  | { kind: 'gather'; lines: Array<{ material: MaterialLine; source: ItemSource }> }
  /** The best few crops for the empty land. */
  | { kind: 'plant'; ideas: PlantingIdea[]; vacant: number }
  | { kind: 'animal'; idea: AnimalIdea }
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
}): DailyAction[] {
  const { digest, deliveries, processing } = input;
  const actions: DailyAction[] = [];
  if (digest.seasonEnd.witherTomorrow.length) actions.push({ kind: 'wither', groups: digest.seasonEnd.witherTomorrow });
  if (deliveries.ready.length) actions.push({ kind: 'deliver', plans: deliveries.ready });
  const trips = new Map<'fish' | 'wild', Extract<DailyAction, { kind: 'fetch' }>>();
  for (const plan of deliveries.pending) {
    const missing = plan.lines.filter((line) => line.have < line.remain);
    const kinds = missing.map((line) => line.sources.find((entry) => (entry.kind === 'fish' || entry.kind === 'wild') && entry.now)?.kind as 'fish' | 'wild' | undefined);
    // Only lists that one trip finishes; a list that also waits on crops shows under deliveries.
    if (!missing.length || kinds.some((kind) => !kind) || new Set(kinds).size > 1) continue;
    const trip = trips.get(kinds[0]!) ?? trips.set(kinds[0]!, { kind: 'fetch', trip: kinds[0]!, items: [], plans: [] }).get(kinds[0]!)!;
    for (const line of missing) {
      const entry = trip.items.find(([itemId]) => itemId === line.itemId);
      if (entry) entry[1] += line.remain - line.have;
      else trip.items.push([line.itemId, line.remain - line.have]);
    }
    trip.plans.push(plan);
  }
  actions.push(...trips.values());
  const outputs = digest.machines.done.reduce((sum, row) => sum + row.count, 0);
  const fill = processing.families.flatMap((family) => {
    const produce = processing.produce.filter((line) => line.held > 0 && line.choice !== NOT_PROCESSED && line.options.find((option) => option.process === line.choice)?.family === family.family).map((line) => line.itemId);
    return family.idle && produce.length ? [{ family, produce }] : [];
  });
  if (outputs || fill.length) actions.push({ kind: 'machines', outputs, fill });
  const short = input.materials.filter((line) => line.short > 0);
  const building = processing.families.filter((family) => family.build.length);
  if (building.length) actions.push({ kind: 'build', families: building, short: short.filter((line) => !line.for) });
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
  const harvest = digest.harvest.flatMap((group) => group.cells);
  if (harvest.length || digest.chores.water.length || digest.chores.hungry) actions.push({ kind: 'routine', harvest, water: digest.chores.water, hungry: digest.chores.hungry });
  return actions;
}
