import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  FARM_BOUNDS,
  FARM_CELLS,
  FARM_REGIONS,
  fitCamera,
  pickFarmCell,
  screenToWorld,
  zoomCamera,
  type Camera,
  type MapArt,
  type Point,
  type SceneSprite,
  type SceneGround,
  type SpriteArt
} from '../../lib/saveMapScene';
import { withBase } from '../../lib/sitePath';

export interface MapCanvasProps {
  art: MapArt;
  terrain?: typeof FARM_CELLS;
  regions?: { name: string; bounds: number[] }[];
  homeBounds?: number[];
  season: number;
  sprites: SceneSprite[];
  ground: SceneGround[];
  tool: string;
  grid: boolean;
  plants: boolean;
  facilities: boolean;
  labels: boolean;
  brush: number;
  selected?: string;
  selection: string[];
  onSelect: (sprites: SceneSprite[]) => void;
  ghost?: SpriteArt;
  previewValid: boolean;
  focus: { bounds: number[]; revision: number };
  onHover: (point: Point | null) => void;
  onChoose: (point: Point, sprite?: SceneSprite) => void;
  onStroke: (start: boolean) => void;
}

export default function MapCanvas(props: MapCanvasProps) {
  const terrain = props.terrain ?? FARM_CELLS;
  const regions = props.regions ?? FARM_REGIONS;
  const homeBounds = props.homeBounds ?? FARM_BOUNDS;
  const backgroundFile = props.art.background ?? `${props.art.seasons[props.season]}.webp`;
  const pickCell = (p: Point) => pickFarmCell(p, terrain);
  const canvas = useRef<HTMLCanvasElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 700 });
  const [camera, setCamera] = useState<Camera>(() => fitCamera(homeBounds, 800, 700));
  const [hover, setHover] = useState<Point | null>(null),
    [version, redraw] = useState(0),
    [loading, setLoading] = useState(0);
  const images = useRef(new Map<string, HTMLImageElement>()),
    failed = useRef(new Set<string>());
  const alphaMasks = useRef(new Map<string, { width: number; height: number; alpha: Uint8Array }>());
  const latest = useRef({ props, camera, size });
  latest.current = { props, camera, size };
  const gesture = useRef<{
    id: number;
    touch: boolean;
    start: Point;
    points: Point[];
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    pan: boolean;
    paint: boolean;
    moved: boolean;
    lastCell?: number;
  } | null>(null);
  const space = useRef(false);
  const touches = useRef(new Map<number, Point>());
  const multiTouch = useRef(false);
  const miniPointer = useRef<number | null>(null);
  const [marquee, setMarquee] = useState<{ start: Point; end: Point } | null>(null);
  const [touchTrail, setTouchTrail] = useState<Point[]>([]);
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setCamera(fitCamera(props.focus.bounds, size.width, size.height));
  }, [props.focus.revision, props.focus.bounds, size.width, size.height]);
  useEffect(() => {
    const element = canvas.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      setCamera((c) =>
        zoomCamera(
          c,
          Math.exp(-event.deltaY * 0.0015),
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
          rect.width,
          rect.height
        )
      );
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  useEffect(() => {
    let disposed = false;
    const ctx = canvas.current!.getContext('2d')!;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.current!.width = Math.round(size.width * ratio);
    canvas.current!.height = Math.round(size.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = props.art.background ? '#111816' : '#263f3b';
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.translate(size.width / 2, size.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);
    let pending = 0;
    function image(path: string) {
      let img = images.current.get(path);
      if (!img && !failed.current.has(path)) {
        img = new Image();
        images.current.set(path, img);
        img.onload = () => {
          if (!disposed) redraw((v) => v + 1);
          else requestAnimationFrame(() => redraw((v) => v + 1));
        };
        img.onerror = () => {
          failed.current.add(path);
          redraw((v) => v + 1);
        };
        img.src = withBase(`/maps/farm/${path}`);
      }
      if (img?.complete && img.naturalWidth) return img;
      if (!failed.current.has(path)) pending++;
      return undefined;
    }
    const background = image(backgroundFile),
      bounds = props.art.bounds;
    if (background)
      ctx.drawImage(background, bounds[0], bounds[1], bounds[2] - bounds[0], bounds[3] - bounds[1]);
    const left = camera.x - size.width / 2 / camera.zoom,
      right = camera.x + size.width / 2 / camera.zoom;
    const top = camera.y - size.height / 2 / camera.zoom,
      bottom = camera.y + size.height / 2 / camera.zoom;
    function diamond(x: number, y: number, fill: string, stroke?: string) {
      ctx.beginPath();
      ctx.moveTo(x, y - 45);
      ctx.lineTo(x + 45, y);
      ctx.lineTo(x, y + 45);
      ctx.lineTo(x - 45, y);
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1 / camera.zoom;
        ctx.stroke();
      }
    }
    for (const soil of props.ground) {
      const tile = props.art.soils?.[soil.soil];
      if (tile) {
        ctx.filter = soil.watered ? 'brightness(.72)' : 'none';
        drawSprite(tile, soil.x, soil.y);
        ctx.filter = 'none';
      }
      if (soil.edited) diamond(soil.x, soil.y, '', '#f0bf5e');
    }
    if (props.grid && camera.zoom > 0.12)
      for (const c of terrain) {
        if (c.x < left - 45 || c.x > right + 45 || c.y < top - 45 || c.y > bottom + 45) continue;
        diamond(c.x, c.y, '', c.mask & 1 ? '#fff6' : '#b9d9f044');
      }
    function drawSprite(sprite: SpriteArt, x: number, y: number, opacity = 1) {
      if (
        x + sprite.x + sprite.w < left ||
        x + sprite.x > right ||
        y + sprite.y + sprite.h < top ||
        y + sprite.y > bottom
      )
        return;
      const img = image(sprite.file);
      if (img) {
        ctx.globalAlpha = opacity;
        ctx.drawImage(img, x + sprite.x, y + sprite.y, sprite.w, sprite.h);
        ctx.globalAlpha = 1;
      }
    }
    for (const sprite of props.sprites) {
      if (sprite.kind === 'crop' ? !props.plants : !props.facilities) continue;
      if (sprite.art) drawSprite(sprite.art, sprite.x, sprite.y);
      else if (sprite.x >= left && sprite.x <= right && sprite.y >= top && sprite.y <= bottom) {
        ctx.fillStyle = '#bc9151';
        ctx.beginPath();
        ctx.arc(sprite.x, sprite.y, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      if (sprite.edited || (props.selected === sprite.key || props.selection.includes(sprite.key)))
        diamond(sprite.x, sprite.y, '', (props.selected === sprite.key || props.selection.includes(sprite.key)) ? '#fff2aa' : '#f0bf5e');
    }
    const target = hover && pickCell(hover);
    if (target && props.tool !== 'pan') {
      const color = props.previewValid ? '#fff1a0' : '#ff8a79';
      if (!['inspect', 'place'].includes(props.tool)) {
        const radius = (props.brush - 1) / 2;
        for (const c of terrain)
          if (
            Math.abs((c.x + c.y - target.x - target.y) / 90) <= radius &&
            Math.abs((c.y - c.x - target.y + target.x) / 90) <= radius &&
            c.mask & 1
          )
            diamond(c.x, c.y, props.previewValid ? '#fff2a044' : '#ef685844', color);
      } else diamond(target.x, target.y, '#fff2a022', color);
      if (props.ghost && props.tool === 'place') drawSprite(props.ghost, target.x, target.y, 0.65);
    }
    if (props.labels) {
      ctx.font = `600 ${13 / camera.zoom}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const region of regions) {
        const x = (region.bounds[0] + region.bounds[2]) / 2,
          y = region.bounds[1] + 180;
        if (
          x < left + 70 / camera.zoom ||
          x > right - 70 / camera.zoom ||
          y < top + 20 / camera.zoom ||
          y > bottom - 20 / camera.zoom
        )
          continue;
        const w = ctx.measureText(region.name).width + 26 / camera.zoom,
          h = 29 / camera.zoom;
        ctx.fillStyle = '#1c302ce0';
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - h / 2, w, h, 6 / camera.zoom);
        ctx.fill();
        ctx.fillStyle = '#fff8df';
        ctx.fillText(region.name, x, y);
      }
    }
    if (marquee) {
      ctx.fillStyle = '#9ad6bb33'; ctx.strokeStyle = '#fff2aa'; ctx.lineWidth = 1.5 / camera.zoom;
      ctx.fillRect(marquee.start.x, marquee.start.y, marquee.end.x - marquee.start.x, marquee.end.y - marquee.start.y);
      ctx.strokeRect(marquee.start.x, marquee.start.y, marquee.end.x - marquee.start.x, marquee.end.y - marquee.start.y);
    }
    for (const p of touchTrail) diamond(p.x, p.y, '#9ad6bb55', '#fff2aa');
    setLoading(pending);
    return () => {
      disposed = true;
    };
  }, [
    props.art,
    terrain,
    regions,
    backgroundFile,
    props.season,
    props.sprites,
    props.ground,
    props.grid,
    props.plants,
    props.facilities,
    props.labels,
    props.selected,
    props.selection,
    marquee,
    touchTrail,
    props.ghost,
    props.previewValid,
    props.tool,
    props.brush,
    camera,
    size,
    hover,
    version
  ]);
  function position(event: { clientX: number; clientY: number }) {
    const rect = canvas.current!.getBoundingClientRect();
    return screenToWorld(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      latest.current.camera,
      rect.width,
      rect.height
    );
  }
  function choose(p: Point) {
    if (props.tool !== 'inspect') { props.onChoose(p); return; }
    const hit = [...props.sprites].reverse().find((s) => {
      if (s.kind === 'crop' ? !props.plants : !props.facilities) return false;
      if (!s.art) return Math.hypot(p.x - s.x, p.y - s.y) < 40;
      const x = p.x-s.x-s.art.x, y = p.y-s.y-s.art.y;
      if (x<0||y<0||x>=s.art.w||y>=s.art.h) return false;
      let mask=alphaMasks.current.get(s.art.file);
      if (!mask) {
        const image=images.current.get(s.art.file);
        if (!image?.complete||!image.naturalWidth) return false;
        const buffer=document.createElement('canvas');buffer.width=image.naturalWidth;buffer.height=image.naturalHeight;
        const context=buffer.getContext('2d',{willReadFrequently:true})!;
        context.drawImage(image,0,0);
        const rgba=context.getImageData(0,0,buffer.width,buffer.height).data;
        const alpha=new Uint8Array(buffer.width*buffer.height);
        for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
        mask={width:buffer.width,height:buffer.height,alpha};alphaMasks.current.set(s.art.file,mask);
      }
      return mask.alpha[Math.floor(y/s.art.h*mask.height)*mask.width+Math.floor(x/s.art.w*mask.width)]>20;
    });
    props.onChoose(p, hit);
  }
  function panBy(dx: number, dy: number) {
    // Capture the delta before React runs the updater; gesture coordinates are mutable.
    setCamera(c => ({ ...c, x: c.x - dx / c.zoom, y: c.y - dy / c.zoom }));
  }
  function pointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (e.pointerType !== 'touch' && e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    const touch = e.pointerType === 'touch';
    if (touch) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size > 1) {
        multiTouch.current = true;
        gesture.current = null;
        setMarquee(null); setTouchTrail([]);
        return;
      }
      if (multiTouch.current) return;
    } else if (gesture.current) return;
    const pan = props.tool === 'pan' || space.current || e.button === 1;
    const paint = !pan && !['inspect', 'place'].includes(props.tool);
    const p = position(e);
    gesture.current = { id: e.pointerId, touch, start: p, points: [p], x: e.clientX, y: e.clientY,
      lastX: e.clientX, lastY: e.clientY, pan, paint, moved: false, lastCell: pickCell(p)?.id };
    if (paint && !touch) { props.onStroke(true); choose(p); }
    if (paint && touch) setTouchTrail([p]);
  }
  function pointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const old = touches.current.get(e.pointerId);
    if (old) {
      const dx = e.clientX - old.x, dy = e.clientY - old.y;
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (multiTouch.current) {
        if (touches.current.size >= 2) panBy(dx / touches.current.size, dy / touches.current.size);
        return;
      }
    }
    const p = position(e);
    setHover(p); props.onHover(p);
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 5) g.moved = true;
    if (g.pan) panBy(e.clientX - g.lastX, e.clientY - g.lastY);
    else if (g.paint) {
      // Sample the entire segment so fast brush strokes do not skip cells.
      const previous = position({ clientX: g.lastX, clientY: g.lastY });
      const steps = Math.ceil(Math.hypot(p.x - previous.x, p.y - previous.y) / 20);
      for (let i = 1; i <= steps; i++) {
        const point = { x: previous.x + (p.x - previous.x) * i / steps, y: previous.y + (p.y - previous.y) * i / steps };
        const cell = pickCell(point);
        if (cell && cell.id !== g.lastCell) {
          g.lastCell = cell.id;
          if (g.touch) g.points.push(point); else choose(point);
        }
      }
      if (g.touch) setTouchTrail([...g.points]);
    } else if (props.tool === 'inspect' && g.moved) setMarquee({ start: g.start, end: p });
    g.lastX = e.clientX; g.lastY = e.clientY;
  }
  function endPointer(e: ReactPointerEvent<HTMLCanvasElement>, cancelled: boolean) {
    touches.current.delete(e.pointerId);
    if (multiTouch.current) {
      if (!touches.current.size) multiTouch.current = false;
      return;
    }
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    setMarquee(null); setTouchTrail([]);
    if (g.paint) {
      // Delay touch edits until release, so adding a second finger never paints the map.
      if (g.touch && !cancelled) { props.onStroke(true); for (const p of g.points) choose(p); }
      if (!g.touch || !cancelled) props.onStroke(false);
    } else if (!cancelled && !g.pan) {
      if (!g.moved) choose(position(e));
      else if (props.tool === 'inspect') {
        const p = position(e), a = g.start;
        props.onSelect(props.sprites.filter(s => (s.kind === 'crop' ? props.plants : props.facilities) &&
          s.x >= Math.min(a.x,p.x) && s.x <= Math.max(a.x,p.x) && s.y >= Math.min(a.y,p.y) && s.y <= Math.max(a.y,p.y)));
      }
    }
  }
  function locateMinimap(e: ReactPointerEvent<HTMLButtonElement>) {
    const svg = e.currentTarget.querySelector('svg')!;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    const b = props.art.bounds;
    const x = Math.max(b[0], Math.min(b[2], p.x)), y = Math.max(b[1], Math.min(b[3], p.y));
    setCamera(c => ({ ...c, x, y }));
  }
  const zoom = (factor: number) =>
    setCamera((c) =>
      zoomCamera(c, factor, { x: size.width / 2, y: size.height / 2 }, size.width, size.height)
    );
  return (
    <div ref={viewport} className="farm-viewport">
      <canvas
        ref={canvas}
        className={props.tool === 'pan' ? 'is-pan' : ''}
        tabIndex={0}
        role="application"
        aria-label="农场地图。左键点击选择，拖动框选或使用笔刷，中键拖动平移；触屏单指选择、双指平移。滚轮缩放；方向键移动视角，加减键缩放，Home 查看全貌。选择工具后点击地图编辑。"
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === ' ') {
            e.preventDefault();
            space.current = true;
          }
          if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            zoom(1.3);
          }
          if (e.key === '-') {
            e.preventDefault();
            zoom(1 / 1.3);
          }
          if (e.key === 'Home') {
            e.preventDefault();
            setCamera(fitCamera(homeBounds, size.width, size.height));
          }
          if (e.key.startsWith('Arrow')) {
            e.preventDefault();
            setCamera((c) => ({
              ...c,
              x: c.x + (e.key === 'ArrowRight' ? 120 : e.key === 'ArrowLeft' ? -120 : 0) / c.zoom,
              y: c.y + (e.key === 'ArrowDown' ? 120 : e.key === 'ArrowUp' ? -120 : 0) / c.zoom
            }));
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            choose({ x: camera.x, y: camera.y });
          }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ') space.current = false;
        }}
        onBlur={() => {
          space.current = false;
        }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={(e) => endPointer(e, false)}
        onPointerCancel={(e) => endPointer(e, true)}
        onLostPointerCapture={(e) => endPointer(e, true)}
        onPointerLeave={() => {
          if (!gesture.current) {
            setHover(null);
            props.onHover(null);
          }
        }}
      />
      <div className="farm-compass" aria-hidden="true">
        北 ↑
      </div>
      <button
        type="button"
        className="farm-minimap"
        aria-label="农场总览，拖动定位，回车查看全貌"
        onPointerDown={(e) => {
          if (miniPointer.current !== null) return;
          e.preventDefault();
          miniPointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          locateMinimap(e);
        }}
        onPointerMove={(e) => { if (miniPointer.current === e.pointerId) locateMinimap(e); }}
        onPointerUp={(e) => { if (miniPointer.current === e.pointerId) { locateMinimap(e); miniPointer.current = null; } }}
        onPointerCancel={() => { miniPointer.current = null; }}
        onLostPointerCapture={() => { miniPointer.current = null; }}
        onClick={(e) => { if (e.detail === 0) setCamera(fitCamera(homeBounds, size.width, size.height)); }}
      >
        <svg
          viewBox={`${props.art.bounds[0]} ${props.art.bounds[1]} ${props.art.bounds[2] - props.art.bounds[0]} ${props.art.bounds[3] - props.art.bounds[1]}`}
          aria-hidden="true"
        >
          <image
            href={withBase(`/maps/farm/${backgroundFile}`)}
            x={props.art.bounds[0]}
            y={props.art.bounds[1]}
            width={props.art.bounds[2] - props.art.bounds[0]}
            height={props.art.bounds[3] - props.art.bounds[1]}
          />
          <rect
            x={camera.x - size.width / 2 / camera.zoom}
            y={camera.y - size.height / 2 / camera.zoom}
            width={size.width / camera.zoom}
            height={size.height / camera.zoom}
            fill="#ffe49a33"
            stroke="#ffe49a"
            strokeWidth={90}
          />
        </svg>
      </button>
      <div className="farm-zoom">
        <button type="button" aria-label="放大地图" onClick={() => zoom(1.35)}>
          ＋
        </button>
        <output>{Math.round(camera.zoom * 100)}%</output>
        <button type="button" aria-label="缩小地图" onClick={() => zoom(1 / 1.35)}>
          −
        </button>
        <button type="button" onClick={() => setCamera(fitCamera(homeBounds, size.width, size.height))}>
          全貌
        </button>
      </div>
      {!!loading && (
        <span className="farm-loading" role="status">
          正在载入场景素材…
        </span>
      )}
      {!!failed.current.size && (
        <span className="farm-loading" role="alert">
          部分素材加载失败，请刷新重试。
        </span>
      )}
      <div className="farm-canvas-hint">左键选择／框选 · 中键平移 · 双指平移 · 滚轮缩放</div>
    </div>
  );
}
