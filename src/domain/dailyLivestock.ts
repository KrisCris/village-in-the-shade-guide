import type { DailyPayload, HouseOrder } from '../data/dailyPayload';
import type { DailyHouse } from '../lib/saveDaily';
import type { DeliveryPlan } from './dailyDeliveries';

/**
 * Animal housing and the animals deliveries call for. Production rates are not
 * verified (see the livestock guide), so nothing here estimates daily output:
 * it only points out products the deliveries still miss that no animal on the
 * farm makes, and whether a house of the right kind has room. When none has,
 * it names the carpenter's order that adds room: renovating the smallest house
 * first, then building another while the farm is under the limit.
 */
export interface HousingLine { type: number; houses: number; slots: number; used: number }
/** `room` is the free slots in houses of the right type; `housed` is false when the farm has no such house. */
export interface AnimalIdea {
  species: number;
  house: number;
  items: number[];
  bundles: number[];
  room: number;
  housed: boolean;
  /** The order that adds room when there is none; `locked` while its unlock flag is off. */
  order?: HouseOrder & { locked: boolean };
}

export function livestockPlan(houses: DailyHouse[], pending: DeliveryPlan[], animals: DailyPayload['animals'], orders: HouseOrder[] = [], unlocked: ReadonlySet<number> = new Set()): { housing: HousingLine[]; ideas: AnimalIdea[] } {
  const housing: HousingLine[] = [];
  for (const house of houses) {
    const line = housing.find((row) => row.type === house.type) ?? (housing.push({ type: house.type, houses: 0, slots: 0, used: 0 }), housing.at(-1)!);
    line.houses++;
    line.slots += house.slots;
    line.used += house.residents.length;
  }
  const ideas = new Map<number, AnimalIdea>();
  for (const plan of pending) {
    for (const line of plan.lines) {
      if (line.have >= line.remain) continue;
      const source = line.sources.find((entry) => entry.kind === 'animal' && !entry.owned);
      if (source?.kind !== 'animal') continue;
      // Several breeds give the same product; suggest the plainest one.
      const species = Math.min(...source.species), house = animals.find((animal) => animal.species === species)?.house ?? 0;
      const idea = ideas.get(species) ?? ideas.set(species, { species, house, items: [], bundles: [], room: 0, housed: false }).get(species)!;
      if (!idea.items.includes(line.itemId)) idea.items.push(line.itemId);
      if (!idea.bundles.includes(plan.spec.id)) idea.bundles.push(plan.spec.id);
    }
  }
  for (const idea of ideas.values()) {
    const line = housing.find((row) => row.type === idea.house);
    idea.room = line ? line.slots - line.used : 0;
    idea.housed = !!line;
    if (idea.room > 0) continue;
    const own = houses.filter((house) => house.type === idea.house);
    const smallest = Math.min(...own.map((house) => house.slots));
    const order = orders.find((entry) => entry.type === idea.house && entry.from !== null && entry.from === smallest)
      ?? orders.find((entry) => entry.type === idea.house && entry.from === null && own.length < entry.limit);
    if (order) idea.order = { ...order, locked: order.flag !== null && !unlocked.has(order.flag) };
  }
  return { housing: housing.sort((a, b) => a.type - b.type), ideas: [...ideas.values()].sort((a, b) => b.room - a.room || b.bundles.length - a.bundles.length) };
}
