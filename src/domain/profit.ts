export type ProfitResult = {
  inputCost: number;
  outputValue: number;
  net: number;
  durationDays: number | null;
  perDay: number | null;
  harvests?: number;
};

export function calculateProcessProfit(input: {
  inputCost: number;
  outputValue: number;
  durationMinutes?: number | null;
}): ProfitResult {
  const durationDays = input.durationMinutes == null ? null : input.durationMinutes / 1440;
  const net = input.outputValue - input.inputCost;
  return {
    inputCost: input.inputCost,
    outputValue: input.outputValue,
    net,
    durationDays,
    perDay: durationDays && durationDays > 0 ? net / durationDays : null,
  };
}

export function calculateCropProfit(input: { seedCost: number; harvestValue: number; harvests?: number; growthDays?: number | null; regrowDays?: number | null; seasonDays?: number }): ProfitResult {
  const seasonDays = input.seasonDays ?? 28;
  const fittedHarvests = input.growthDays
    ? input.regrowDays
      ? 1 + Math.max(0, Math.floor((seasonDays - input.growthDays) / input.regrowDays))
      : Math.max(1, Math.floor(seasonDays / input.growthDays))
    : 1;
  const harvests = Math.max(1, input.harvests ?? fittedHarvests);
  const outputValue = input.harvestValue * harvests;
  const inputCost = input.seedCost * (input.regrowDays ? 1 : harvests);
  const net = outputValue - inputCost;
  return { inputCost, outputValue, net, durationDays: input.growthDays ?? null, perDay: input.growthDays ? net / seasonDays : null, harvests };
}
