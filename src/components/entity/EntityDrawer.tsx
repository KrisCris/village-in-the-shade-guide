import { useEffect, useMemo, useState } from 'react';
import type { Catalog, Entity } from '../../data/types';
import { resolveCatalogEntity } from '../../data/entityLookup';
import { buildEntityDetailModel } from '../../domain/relations';
import { useQuality } from '../quality/qualityPreference';
import EntityDetail from './EntityDetail';

export default function EntityDrawer({ initial, onClose }: { initial: Entity; onClose: () => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [stack, setStack] = useState<Entity[]>([initial]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [quality] = useQuality();
  useEffect(() => {
    const controller = new AbortController();
    fetch('/game-data.json', { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).then((data) => {
      const byId: Record<string, Entity> = {};
      for (const entity of data.entities as Entity[]) byId[entity.id] ??= { ...entity, searchText: '' };
      setCatalog({ ...data, generatedAt: '', byId });
    }).catch((error) => { if (error.name !== 'AbortError') setLoadFailed(true); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const current = stack.at(-1)!;
  const title = useMemo(() => stack.map((e) => e.name.zh_hans).join(' › '), [stack]);
  const model = useMemo(() => catalog ? buildEntityDetailModel(resolveCatalogEntity(catalog, current), catalog, quality) : null, [catalog, current, quality]);
  return <div className="drawer-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
      <header><button onClick={() => stack.length > 1 ? setStack(stack.slice(0, -1)) : onClose()}>{stack.length > 1 ? '← 返回' : '关闭'}</button><span>{title}</span><a href={`/data/${current.kind}/${encodeURIComponent(current.id)}/`}>独立页面 ↗</a></header>
      <div className="drawer-body">{model ? <EntityDetail model={model} onOpen={(next) => setStack([...stack, next])} /> : <p>{loadFailed ? '关联数据读取失败，请打开独立页面查看基础数据。' : '正在读取关联数据…'}</p>}</div>
    </aside>
    <style>{`
      .drawer-backdrop{position:fixed;inset:0;z-index:60;background:rgb(20 20 15 / 44%);display:flex;justify-content:flex-end}.drawer{width:min(720px,92vw);height:100%;background:var(--paper);box-shadow:-12px 0 40px rgb(0 0 0 / 20%);display:grid;grid-template-rows:auto 1fr}.drawer>header{display:flex;align-items:center;gap:1rem;padding:.7rem 1rem;border-bottom:1px solid var(--border);background:var(--paper-raised)}.drawer>header span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:.85rem}.drawer-body{overflow:auto;padding:1.5rem clamp(1rem,4vw,2.5rem) 4rem}
      @media(max-width:700px){.drawer{width:100vw}.drawer>header a{display:none}}
    `}</style>
  </div>;
}
