import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from 'react';
import type { Catalog, Entity } from '../../data/types';
import { resolveCatalogEntity } from '../../data/entityLookup';
import { buildEntityDetailModel } from '../../domain/relations';
import { useQuality } from '../quality/qualityPreference';
import EntityDetail from './EntityDetail';
import { clampDrawerWidth, DRAWER_DEFAULT_WIDTH, DRAWER_MIN_WIDTH, DRAWER_MOBILE_BREAKPOINT, DRAWER_WIDTH_KEY, storedDrawerWidth } from './drawerSizing';

export default function EntityDrawer({ initial, onClose }: { initial: Entity; onClose: () => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [stack, setStack] = useState<Entity[]>([initial]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [width, setWidth] = useState(DRAWER_DEFAULT_WIDTH);
  const dragging = useRef(false);
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
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    setWidth(storedDrawerWidth(window.localStorage.getItem(DRAWER_WIDTH_KEY), window.innerWidth));
    const onResize = () => setWidth((current) => clampDrawerWidth(current, window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      document.body.style.userSelect = '';
    };
  }, []);

  const resizeTo = (clientX: number) => setWidth(clampDrawerWidth(window.innerWidth - clientX, window.innerWidth));
  const persistWidth = (next: number) => {
    if (window.innerWidth > DRAWER_MOBILE_BREAKPOINT) window.localStorage.setItem(DRAWER_WIDTH_KEY, String(next));
  };
  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    if (window.innerWidth <= DRAWER_MOBILE_BREAKPOINT) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.userSelect = 'none';
    resizeTo(event.clientX);
  };
  const moveResize = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) resizeTo(event.clientX);
  };
  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.userSelect = '';
    const next = clampDrawerWidth(window.innerWidth - event.clientX, window.innerWidth);
    setWidth(next);
    persistWidth(next);
  };
  const resizeWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === 'ArrowLeft' ? 32 : event.key === 'ArrowRight' ? -32 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = clampDrawerWidth(width + delta, window.innerWidth);
    setWidth(next);
    persistWidth(next);
  };
  const current = stack.at(-1)!;
  const title = useMemo(() => stack.map((e) => e.name.zh_hans).join(' › '), [stack]);
  const model = useMemo(() => catalog ? buildEntityDetailModel(resolveCatalogEntity(catalog, current), catalog, quality) : null, [catalog, current, quality]);
  return <div className="drawer-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <aside className="drawer" role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
      <div className="drawer-resizer" role="separator" aria-label="调整详情栏宽度" aria-orientation="vertical" aria-valuemin={DRAWER_MIN_WIDTH} aria-valuenow={width} tabIndex={0} onPointerDown={startResize} onPointerMove={moveResize} onPointerUp={finishResize} onPointerCancel={finishResize} onKeyDown={resizeWithKeyboard} />
      <header><button onClick={() => stack.length > 1 ? setStack(stack.slice(0, -1)) : onClose()}>{stack.length > 1 ? '← 返回' : '关闭'}</button><span>{title}</span><a href={`/data/${current.kind}/${encodeURIComponent(current.id)}/`}>独立页面 ↗</a></header>
      <div className="drawer-body">{model ? <EntityDetail model={model} onOpen={(next) => setStack([...stack, next])} /> : <p>{loadFailed ? '关联数据读取失败，请打开独立页面查看基础数据。' : '正在读取关联数据…'}</p>}</div>
    </aside>
    <style>{`
      .drawer-backdrop{position:fixed;inset:0;z-index:60;background:rgb(20 20 15 / 44%);display:flex;justify-content:flex-end}.drawer{position:relative;height:100%;max-width:100vw;background:var(--paper);box-shadow:-12px 0 40px rgb(0 0 0 / 20%);display:grid;grid-template-rows:auto 1fr}.drawer-resizer{position:absolute;z-index:2;inset:0 auto 0 -7px;width:14px;cursor:col-resize;touch-action:none}.drawer-resizer::after{content:'';position:absolute;inset:0 auto 0 6px;width:2px;background:transparent}.drawer-resizer:hover::after,.drawer-resizer:focus-visible::after{background:var(--green)}.drawer>header{display:flex;align-items:center;gap:1rem;padding:.7rem 1rem;border-bottom:1px solid var(--border);background:var(--paper-raised)}.drawer>header span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:.85rem}.drawer-body{overflow:auto;padding:1.5rem clamp(1rem,4vw,2.5rem) 4rem}
      @media(max-width:700px){.drawer{width:100vw!important}.drawer-resizer{display:none}.drawer>header a{display:none}}
    `}</style>
  </div>;
}
