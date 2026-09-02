export function checkCoverage(sources, mappings) {
  const sourceIds = new Set(sources.map((row) => String(row.sourceId)));
  const mappingIds = new Set(mappings.map((row) => String(row.sourceId)));
  return {
    unmappedSources: [...sourceIds].filter((id) => !mappingIds.has(id)),
    unknownSources: [...mappingIds].filter((id) => !sourceIds.has(id)),
    duplicateMappings: mappings.map((row) => String(row.sourceId)).filter((id, index, all) => all.indexOf(id) !== index),
    invalidTargets: mappings.filter((row) => !Array.isArray(row.targets) || !row.targets.length || row.targets.some((target) => !target.startsWith('/'))).map((row) => row.sourceId),
  };
}
