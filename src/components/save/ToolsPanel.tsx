import type { SaveContainer } from '../../lib/saveItems';
import type { SaveNameTables } from '../../lib/saveNames';
import { TOOLS, TOOL_RANGE_FIELDS } from '../../lib/saveTools';
import { itemLabel } from './ItemGrid';
import SaveIcon from './SaveIcon';

export default function ToolsPanel({ container, drafts, names, onDraft }: {
  container: SaveContainer; drafts: Record<number, string>; names: SaveNameTables; onDraft: (offset: number, value: string) => void;
}) {
  return <section className="save-container-panel"><header className="save-container-head"><h3>工具栏</h3><p className="save-container-meta">选择工具的升级版本</p></header>
    <div className="save-tool-cards">{container.slots.filter(slot => slot.item).map(({ item }) => {
      const current = drafts[item!.itemIdOffset] ?? item!.itemId;
      const tool = TOOLS.find(tool => String(tool.itemId) === item!.itemId);
      const choices = tool?.family ? TOOLS.filter(choice => choice.family === tool.family) : [];
      const selected = TOOLS.find(tool => String(tool.itemId) === current);
      const range = selected && TOOL_RANGE_FIELDS[selected.family];
      return <article className="save-tool-card" key={item!.itemIdOffset}>
        <div className="save-tool-title"><SaveIcon names={names} kind="items" value={current} size={44} /><div><strong>{itemLabel(names, current)}</strong>
          <small>{range ? (selected.family === 660010 ? `最大范围 ${selected.level} × ${selected.level} 格` : '升级时自动同步作业范围') : '已持有'}</small></div></div>
        {choices.length > 1 && <div className="save-tool-tiers" role="group" aria-label={`${itemLabel(names, item!.itemId)}升级`}>
          {choices.map(choice => <button type="button" key={choice.itemId} title={itemLabel(names, String(choice.itemId))} aria-label={itemLabel(names, String(choice.itemId))} aria-pressed={current === String(choice.itemId)} onClick={() => onDraft(item!.itemIdOffset, String(choice.itemId))}>
            <SaveIcon names={names} kind="items" value={String(choice.itemId)} size={28} /><span>{['', '普通', '铜', '铁', '金', '陨铁'][choice.level]}</span>
          </button>)}
        </div>}
      </article>;
    })}</div>
  </section>;
}
