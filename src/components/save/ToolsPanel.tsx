import type { SaveContainer } from '../../lib/saveItems';
import type { SaveNameTables } from '../../lib/saveNames';
import { TOOLS, TOOL_RANGE_FIELDS } from '../../lib/saveTools';
import { itemLabel } from './ItemGrid';
import SaveIcon from './SaveIcon';
import { tr } from '../../i18n/active';

export default function ToolsPanel({ container, drafts, names, onDraft }: {
  container: SaveContainer; drafts: Record<number, string>; names: SaveNameTables; onDraft: (offset: number, value: string) => void;
}) {
  return <section className="save-container-panel"><header className="save-container-head"><h3>{tr('工具栏')}</h3><p className="save-container-meta">{tr('选择工具的升级版本')}</p></header>
    <div className="save-tool-cards">{container.slots.filter(slot => slot.item).map(({ item }) => {
      const current = drafts[item!.itemIdOffset] ?? item!.itemId;
      const tool = TOOLS.find(tool => String(tool.itemId) === item!.itemId);
      const choices = tool?.family ? TOOLS.filter(choice => choice.family === tool.family) : [];
      const selected = TOOLS.find(tool => String(tool.itemId) === current);
      const range = selected && TOOL_RANGE_FIELDS[selected.family];
      return <article className="save-tool-card" key={item!.itemIdOffset}>
        <div className="save-tool-title"><SaveIcon names={names} kind="items" value={current} size={44} /><div><strong>{itemLabel(names, current)}</strong>
          <small>{range ? (selected.family === 660010 ? tr('最大范围 {width} × {height} 格', { width: selected.level, height: selected.level }) : tr('升级时自动同步作业范围')) : tr('已持有')}</small></div></div>
        {choices.length > 1 && <div className="save-tool-tiers" role="group" aria-label={tr('{itemLabel}升级', { itemLabel: itemLabel(names, item!.itemId) })}>
          {choices.map(choice => <button type="button" key={choice.itemId} title={itemLabel(names, String(choice.itemId))} aria-label={itemLabel(names, String(choice.itemId))} aria-pressed={current === String(choice.itemId)} onClick={() => onDraft(item!.itemIdOffset, String(choice.itemId))}>
            <SaveIcon names={names} kind="items" value={String(choice.itemId)} size={28} /><span>{['', tr('普通'), tr('铜'), tr('铁'), tr('金'), tr('陨铁')][choice.level]}</span>
          </button>)}
        </div>}
      </article>;
    })}</div>
  </section>;
}
