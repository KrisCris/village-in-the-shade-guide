import data from '../../data/sources/game-save-tools.json';
import type { SaveModel } from './saveModel';

export const TOOLS = data.tools;
export const TOOL_RANGE_FIELDS: Record<number, string> = {
  660000: 'wateringCanRangeLevel_', 660010: 'mullberryRangeLevel_', 660080: 'plowRangeLevel_',
};

/** Native upgrade routine assigns ItemData.level to the selected range.
 * Do this only when the tool changes: smaller ranges in an untouched save are valid. */
export function linkedToolDrafts(model: SaveModel, drafts: Record<number, string>): Record<number, string> {
  const result = { ...drafts };
  for (const container of model.containers.filter(container => container.kind === 'tool')) for (const { item } of container.slots) {
    if (!item || drafts[item.itemIdOffset] === undefined || drafts[item.itemIdOffset] === item.itemId) continue;
    const before = TOOLS.find(tool => String(tool.itemId) === item.itemId);
    const after = TOOLS.find(tool => String(tool.itemId) === drafts[item.itemIdOffset]);
    if (!before || !after || !before.family || before.family !== after.family) throw new Error('工具栏只能更换同类工具的升级版本。');
    const path = TOOL_RANGE_FIELDS[after.family];
    const range = path && model.doc.resolve(`pPlayerStatus_/p/${path}`);
    if (range) result[range.offset] = String(after.level);
  }
  return result;
}

/** A linked range and its tool form one undo operation. */
export function undoToolDraft(model: SaveModel, drafts: Record<number, string>, offset: number): Record<number, string> {
  const next = { ...drafts };
  delete next[offset];
  for (const container of model.containers.filter(container => container.kind === 'tool')) for (const { item } of container.slots) {
    if (!item) continue;
    const tool = TOOLS.find(tool => String(tool.itemId) === item.itemId);
    const path = tool && TOOL_RANGE_FIELDS[tool.family];
    const range = path && model.doc.resolve(`pPlayerStatus_/p/${path}`);
    if (range && (range.offset === offset || item.itemIdOffset === offset)) {
      delete next[range.offset]; delete next[item.itemIdOffset];
    }
  }
  return next;
}
