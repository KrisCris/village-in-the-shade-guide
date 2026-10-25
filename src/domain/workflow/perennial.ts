import type { Perennial } from "../../data/types";
import { bearingHarvests, type Harvest } from "../perennial";
import { SEASONS, seasonAt } from "./date";

export const seasonEnd = (day: number) => Math.ceil(day / 28) * 28;

/** Greenhouse-only trees list no outdoor seasons; they bear, and can be planted, all year. */
const allYear = (perennial: Perennial) =>
  perennial.kind === "fruit_tree" && perennial.greenhouse_only;
export const bearingSeasons = (perennial: Perennial) =>
  allYear(perennial) ? SEASONS : perennial.bearing_seasons;
export const plantingSeasons = (perennial: Perennial, seasons: string[]) =>
  allYear(perennial) && !seasons.length ? SEASONS : seasons;

/** Picks or shakes per plant for a perennial grown on `grownDay`, through `lastDay`, or null when its data is incomplete.
 * Outside its bearing seasons it waits, then bears again from the first day of the next one.
 * Consecutive bearing seasons form one span, so a tree is shaken on the span's last day, not at every season end. */
export function perennialHarvests(
  perennial: Perennial,
  pick: number | null | undefined,
  grownDay: number,
  lastDay: number,
): Harvest[] | null {
  if (!bearingHarvests(perennial, pick, 1, 0)) return null;
  const seasons = bearingSeasons(perennial),
    harvests: Harvest[] = [];
  const bears = (day: number) => seasons.includes(seasonAt(day));
  for (let day = grownDay; day <= lastDay; ) {
    let end = seasonEnd(day);
    if (bears(day)) {
      while (end < lastDay && bears(end + 1)) end = seasonEnd(end + 1);
      harvests.push(...bearingHarvests(perennial, pick, day, Math.min(end, lastDay))!);
    }
    day = end + 1;
  }
  return harvests;
}
