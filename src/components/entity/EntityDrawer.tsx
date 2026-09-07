import { withBase } from '../../lib/sitePath';
import {createPortal} from 'react-dom';
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
  const dialog = useRef<HTMLElement>(null);
  const [quality] = useQuality();
  useEffect(()=>{
    const body=document.body,root=document.documentElement,y=window.scrollY;
    const previousFocus=document.activeElement as HTMLElement|null;
    const saved={position:body.style.position,top:body.style.top,width:body.style.width,overflow:body.style.overflow};
    body.style.position='fixed';body.style.top=`-${y}px`;body.style.width='100%';body.style.overflow='hidden';
    dialog.current?.querySelector<HTMLButtonElement>('.drawer-close')?.focus({preventScroll:true});
    return()=>{
      Object.assign(body.style,saved);
      if(document.body===body){
        const behavior=root.style.scrollBehavior;root.style.scrollBehavior='auto';
        window.scrollTo({top:y,behavior:'instant'});root.style.scrollBehavior=behavior;
        if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
      }
    };
  },[]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(withBase('/game-data.json'), { signal: controller.signal }).then((response) => {
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
  if(typeof document==='undefined')return null;
  return createPortal(<div className="drawer-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
    <aside ref={dialog} className="drawer" role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
      <div className="drawer-resizer" role="separator" aria-label="调整详情栏宽度" aria-orientation="vertical" aria-valuemin={DRAWER_MIN_WIDTH} aria-valuenow={width} tabIndex={0} onPointerDown={startResize} onPointerMove={moveResize} onPointerUp={finishResize} onPointerCancel={finishResize} onKeyDown={resizeWithKeyboard} />
      <header><button className="drawer-close" onClick={onClose}>关闭</button>{stack.length>1&&<button onClick={()=>setStack(stack.slice(0,-1))}>← 返回</button>}<span>{title}</span><a href={withBase(`/data/${current.kind}/${encodeURIComponent(current.id)}/`)}>独立页面 ↗</a></header>
      <div className="drawer-body" key={current.id}>{model ? <EntityDetail model={model} onOpen={(next) => setStack([...stack, next])} /> : <p>{loadFailed ? '关联数据读取失败，请打开独立页面查看基础数据。' : '正在读取关联数据…'}</p>}</div>
    </aside>
    <style>{`
      .drawer-backdrop{position:fixed;inset:0;z-index:60;background:rgb(20 20 15 / 44%);display:flex;justify-content:flex-end}.drawer{position:relative;height:100%;max-width:100vw;background:var(--paper);box-shadow:-12px 0 40px rgb(0 0 0 / 20%);display:grid;grid-template-rows:auto 1fr}.drawer-resizer{position:absolute;z-index:2;inset:0 auto 0 -7px;width:14px;cursor:col-resize;touch-action:none}.drawer-resizer::after{content:'';position:absolute;inset:0 auto 0 6px;width:2px;background:transparent}.drawer-resizer:hover::after,.drawer-resizer:focus-visible::after{background:var(--green)}.drawer>header{display:flex;align-items:center;gap:1rem;padding:.7rem 1rem;border-bottom:1px solid var(--border);background:var(--paper-raised)}.drawer>header span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:.85rem}.drawer-body{overflow:auto;padding:1.5rem clamp(1rem,4vw,2.5rem) 4rem}
      @media(max-width:700px){.drawer{width:100vw!important}.drawer-resizer{display:none}.drawer>header a{display:none}}
      .drawer-backdrop{height:100dvh;overflow:hidden;overscroll-behavior:none}
      .drawer{min-height:0;min-width:0;overflow:hidden;grid-template-rows:auto minmax(0,1fr)}
      .drawer>header{min-width:0;z-index:3;padding-top:max(.7rem,env(safe-area-inset-top));padding-left:max(1rem,env(safe-area-inset-left));padding-right:max(1rem,env(safe-area-inset-right))}
      .drawer>header button{flex:none;min-height:44px}.drawer>header span{min-width:0}
      .drawer-body{min-height:0;min-width:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior-y:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch;padding-bottom:calc(2rem + env(safe-area-inset-bottom))}
      @media(max-width:700px){.drawer>header{gap:.5rem}.drawer-body{padding-inline:1rem}.drawer-backdrop{width:100%;bottom:auto}}
    `}</style>
  </div>,document.body);
}
