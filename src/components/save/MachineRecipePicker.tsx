import { useMemo, useState } from 'react';
import { useProgressiveRows } from '../table/useProgressiveRows';
import { buildSaveSearchText, normalizeSearch } from '../../lib/saveSearch';
import { gameDuration, MACHINES } from '../../lib/saveMachines';
import type { SaveNameTables } from '../../lib/saveNames';
import { itemLabel } from './ItemGrid';
import RankPicker from './RankPicker';
import SaveDialog from './SaveDialog';
import SaveIcon from './SaveIcon';

type Recipe = (typeof MACHINES.processes)[number];

export function MachineRecipeSummary({ recipe, names, rank }: { recipe: Recipe; names: SaveNameTables; rank: number }) {
  return <>
    <SaveIcon names={names} kind="items" value={String(recipe.output)} size={36} rank={rank} />
    <span><b>{itemLabel(names, String(recipe.output))} × {recipe.count}</b><small>{recipe.inputs.map(input => `${itemLabel(names, String(input.itemId))} × ${input.count}`).join(' + ')} · {gameDuration(recipe.minutes * 60)}（游戏时间）</small></span>
  </>;
}

export default function MachineRecipePicker({ recipes, names, rank, onRankChange, onSelect, onClose, batch = false }: {
  recipes: Recipe[]; names: SaveNameTables; rank: number; onRankChange: (rank: number) => void;
  onSelect: (recipe: Recipe) => void; onClose: () => void; batch?: boolean;
}) {
  const [search, setSearch] = useState('');
  const indexed = useMemo(() => recipes.map(recipe => ({ ...recipe, searchText: buildSaveSearchText(
    itemLabel(names, String(recipe.output)), String(recipe.output),
    ...recipe.inputs.map(input => itemLabel(names, String(input.itemId))),
  ) })), [recipes, names]);
  const filtered = indexed.filter(recipe => recipe.searchText.includes(normalizeSearch(search)));
  const { visible, sentinel, more, loadMore } = useProgressiveRows(filtered, 40, search);
  return <SaveDialog title="选择加工配方" onClose={onClose}>
    <p>{batch ? '选好配方后，返回批量菜单填入空栏位。材料直接生成，不扣背包物品。' : '加入所需材料并开始计时，材料品质按下方选择。此操作不会扣除背包物品。'}</p>
    <RankPicker value={rank} onChange={onRankChange} />
    <input className="save-machine-search" type="search" autoFocus value={search} placeholder="成品、材料、拼音或首字母" aria-label="搜索加工配方" onChange={event => setSearch(event.target.value)} />
    <div className="save-recipe-options">{visible.map(recipe => <button type="button" key={recipe.id} onClick={() => onSelect(recipe)}>
      <MachineRecipeSummary recipe={recipe} names={names} rank={rank} />
    </button>)}</div>
    <div ref={sentinel}>{more && <button type="button" onClick={loadMore}>加载更多配方</button>}</div>
    {!filtered.length && <p>没有匹配的配方。</p>}
  </SaveDialog>;
}
