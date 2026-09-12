import { expect, it } from "vitest";
import type { Catalog, Entity } from "./types";
import { workflowPayload } from "./workflowPayload";
import { buildCatalog } from "./catalog";
import machines from "../../data/generated/build-24969282/entities/machines.json";
import processes from "../../data/generated/build-24969282/entities/processes.json";
import capacities from "../../data/sources/game-machine-capacities.json";

it("delivers verified slot counts for every device used by the game processing recipes", () => {
  const payload = workflowPayload(buildCatalog({ "/entities/machines.json": machines }));
  const referenced = new Set(processes.flatMap(recipe => recipe.machine_ids));
  expect(new Set(capacities.machines.map(machine => machine.item_id))).toEqual(referenced);
  for (const id of referenced) {
    expect(payload.find(e => e.id === id)?.capacity).toBe(
      capacities.machines.find(machine => machine.item_id === id)!.capacity,
    );
  }
  expect(payload.find(e => e.id === "ITEM_ID_GIMMICK_AGUNG_BARREL")?.capacity).toBe(1);
  expect(payload.find(e => e.id === "ITEM_ID_GIMMICK_AGUNG_BARREL_02")?.capacity).toBe(3);
  for (const id of ["ITEM_ID_GIMMICK_BEEHIVE", "ITEM_ID_GIMMICK_SAP_EXTRACTOR", "ITEM_ID_GIMMICK_SERICULTURE_BOX"])
    expect(payload.find(e => e.id === id)?.capacity).toBe(1);
  expect(payload.find(e => e.id === "ITEM_ID_GIMMICK_CRAFT_TABLE")?.capacity).toBeUndefined();
});
const e = (id: string, kind: string, extra = {}): Entity => ({
  id,
  kind,
  name: {
    zh_hans: id,
    zh_hant: "",
    ja: "",
    internal: id,
    aliases: [],
    review_status: "",
  },
  searchText: id,
  ...extra,
});
it("keeps second-stage recipes, auxiliary inputs, machines and grouped reserve demands", () => {
  const entities = [
    e("seed", "items"),
    e("raw", "items"),
    e("salt", "items"),
    e("pickled", "items"),
    e("final", "items"),
    e("crop", "crops", { seed_item_ids: ["seed"], harvest_item_ids: ["raw"] }),
    e("p1", "processes", {
      inputs: [
        { item_id: "raw", quantity: 1 },
        { item_id: "salt", quantity: 1 },
      ],
      output: { item_id: "pickled", quantity: 1 },
      machine_ids: ["m"],
    }),
    e("p2", "processes", {
      inputs: [{ item_id: "pickled", quantity: 2 }],
      output: { item_id: "final", quantity: 1 },
      machine_ids: ["m"],
    }),
    e("m", "machines"),
    e("BUNDLE_ID_SPRING_A", "activities", {
      inputs: [{ item_id: "final", quantity: 3 }],
    }),
    e("offer", "store-offers", { item_id: "salt" }),
  ];
  const result = workflowPayload({
    entities,
    byId: {},
    counts: {},
    buildId: "test",
    generatedAt: "",
  } as Catalog);
  expect(result.map((x) => x.id)).toEqual(
    expect.arrayContaining([
      "p1",
      "p2",
      "m",
      "salt",
      "offer",
      "BUNDLE_ID_SPRING_A",
    ]),
  );
  expect(result.find((x) => x.id === "BUNDLE_ID_SPRING_A")?.inputs).toEqual([
    { item_id: "final", quantity: 3 },
  ]);
});
it("retains shop offers for inventory and consumption items outside production recipes", () => {
  const entities = [
    e("gift", "items"),
    e("gift-shop", "store-offers", { item_id: "gift" }),
  ];
  expect(
    workflowPayload({
      entities,
      byId: {},
      counts: {},
      buildId: "test",
      generatedAt: "",
    }).map((e) => e.id),
  ).toContain("gift-shop");
});
it("retains excluded unlock flags alongside shop offer conditions", () => {
  const result = workflowPayload({
    entities: [e("offer", "store-offers", {
      item_id: "seed",
      excluded_flags: [999999],
      conditions: ["玩家解锁条件"],
    })],
    byId: {},
    counts: {},
    buildId: "test",
    generatedAt: "",
  });
  expect(result.find((e) => e.id === "offer")).toMatchObject({
    excluded_flags: [999999],
    conditions: ["玩家解锁条件"],
  });
});
