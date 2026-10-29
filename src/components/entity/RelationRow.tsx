import { withBase } from '../../lib/sitePath';
import { useState, type MouseEvent } from 'react';
import { entityUrl } from '../../data/clientSearch';
import { secondaryName, showsJapaneseName, type Entity } from '../../data/types';
import type { RelationRowModel } from '../../domain/relations';
import { useI18n } from '../../i18n/react';

function isModifiedClick(event: MouseEvent) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export default function RelationRow({ row, onOpen, compact=false }: { row: RelationRowModel; onOpen?: (entity: Entity) => void; compact?:boolean }) {
  const { t, href, locale } = useI18n();
  const [hasIcon, setHasIcon] = useState(Boolean(row.entity.icon_path));
  const secondary = showsJapaneseName(locale) ? secondaryName(row.entity.name, locale) || row.entity.id : '';
  const chips=compact?row.chips.filter(chip=>chip!==t('加工原料')):row.chips;
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onOpen || isModifiedClick(event)) return;
    event.preventDefault();
    onOpen(row.entity);
  };
  return <a className={`relation-row ${hasIcon ? 'has-icon' : 'no-icon'}`} href={href(entityUrl(row.entity))} onClick={handleClick}>
    {hasIcon && <img src={withBase(row.entity.icon_path!)} onError={() => setHasIcon(false)} alt="" width="52" height="52" loading="lazy" />}
    <span className="relation-name"><strong>{row.entity.name.zh_hans}</strong>{secondary && <small>{secondary}</small>}</span>
    {row.quantity != null && <b className="relation-quantity">×{row.quantity}</b>}
    <span className="relation-values">{row.buyPrice && <small>{row.buyLabel ?? t('买入')} {row.buyPrice}</small>}{row.sellPrice && <small>{row.sellLabel ?? t('卖出')} {row.sellPrice}</small>}</span>
    {chips.length > 0 && <span className="relation-chips">{chips.map((chip) => <small key={chip}>{chip}</small>)}</span>}
    {row.note && <small className="relation-note">{row.note}</small>}
  </a>;
}
