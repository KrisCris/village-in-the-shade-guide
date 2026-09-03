import type { MouseEvent } from 'react';
import { entityUrl } from '../../data/clientSearch';
import type { Entity } from '../../data/types';
import type { RelationRowModel } from '../../domain/relations';

const fallbackKinds = new Set(['items', 'crops', 'machines', 'processes']);

function isModifiedClick(event: MouseEvent) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export default function RelationRow({ row, onOpen }: { row: RelationRowModel; onOpen?: (entity: Entity) => void }) {
  const fallbackKind = fallbackKinds.has(row.entity.kind) ? row.entity.kind : 'default';
  const fallback = `/icons/fallback/${fallbackKind}.svg`;
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onOpen || isModifiedClick(event)) return;
    event.preventDefault();
    onOpen(row.entity);
  };
  return <a className="relation-row" href={entityUrl(row.entity)} onClick={handleClick}>
    <img src={row.entity.icon_path || fallback} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = fallback; }} alt="" width="52" height="52" loading="lazy" />
    <span className="relation-name"><strong>{row.entity.name.zh_hans}</strong><small>{row.entity.name.ja || row.entity.id}</small></span>
    {row.quantity != null && <b className="relation-quantity">×{row.quantity}</b>}
    <span className="relation-values">{row.buyPrice && <small>买入 {row.buyPrice}</small>}{row.sellPrice && <small>卖出 {row.sellPrice}</small>}</span>
    {row.chips.length > 0 && <span className="relation-chips">{row.chips.map((chip) => <small key={chip}>{chip}</small>)}</span>}
    {row.note && <small className="relation-note">{row.note}</small>}
  </a>;
}
