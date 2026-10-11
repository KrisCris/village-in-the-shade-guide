/**
 * The village minimap covers the openworld map head. Build 25311578 renamed it
 * from map_0000_spr to map_0000_ver120_spr; other heads (map_2160 藪, map_2170
 * 峠) use their own coordinate spaces and cannot be drawn on the minimap.
 */
export const isVillageMap = (map: string) => /(^|\/)map_0000(_ver\d+)?_spr\.ymwr/.test(map);
