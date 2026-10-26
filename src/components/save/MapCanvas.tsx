import { RestrictedTerrainOverlay } from '../../lib/saveMapOverlay';
import { inSelection, selectionPolygon } from '../../lib/saveMapGeometry';
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
import { tr } from '../../i18n/active';

// Canvas filters on individual draws are re-rasterized per call and made dragging the map take
// seconds per frame, so watered soil tiles are darkened once and cached instead. The game's
// brighter post-processed look is a CSS filter on the whole canvas (see save-map.css).
const WATERED_SHADE = 'brightness(.72)';
// The art layer is cached with up to half a view of margin on each side, so panning only shifts it.
const ART_MARGIN = 0.5;
// Cache pixel budget (about two 4K screens); large or high-density views get a smaller margin.
const ART_PIXELS = 16e6;
// Trees and roofs overhang the map edge slightly.
const ART_PAD = 600;

type View = { left: number; top: number; right: number; bottom: number };
interface ArtCache extends View { canvas: HTMLCanvasElement; zoom: number; ratio: number }
const covers = (cache: View, rect: View) =>
  rect.right <= rect.left || rect.bottom <= rect.top ||
  (rect.left >= cache.left && rect.right <= cache.right && rect.top >= cache.top && rect.bottom <= cache.bottom);
const shownIn = (p: MapCanvasProps, s: SceneSprite) => s.kind === 'crop' ? p.plants : s.floor ? p.floors : p.facilities;

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
  allowedTerrain?: Point[];
  plants: boolean;
  facilities: boolean;
  floors: boolean;
  groundOnly: boolean;
  onGroundOnly: (value: boolean) => void;
  labels: boolean;
  brush: number;
  selected?: string;
  selection: string[];
  onCancel: () => void;
  onSelect: (sprites: SceneSprite[], cells: number[]) => void;
  selectedCells: number[];
  onRotate: () => void;
  ghost?: SpriteArt;
  /** Draw the placement preview flipped, as inside a mirrored building. */
  mirrored?: boolean;
  previewValid: boolean;
  focus: { bounds: number[]; revision: number };
  onHover: (point: Point | null) => void;
  onChoose: (point: Point, sprite?: SceneSprite) => void;
  onStroke: (start: boolean) => void;
  /** Dragging with the place tool lays one per cell (floors and paths). */
  dragPlace?: boolean;
  /** Extra cell highlights drawn under the selection, such as a remembered farm area. */
  marks?: { cells: number[]; fill: string; stroke?: string }[];
}

export default function MapCanvas(props: MapCanvasProps) {
  const terrain = props.terrain ?? FARM_CELLS;
  const regions = props.regions ?? FARM_REGIONS;
  const homeBounds = props.homeBounds ?? FARM_BOUNDS;
  const backgroundFile = props.art.background ?? `${props.art.seasons[props.season]}.webp`;
  const sceneryFile = props.art.background ? props.art.scenery : `${props.art.seasons[props.season]}-scenery.webp`;
  const pickCell = (p: Point) => pickFarmCell(p, terrain);
  const shown = (s: SceneSprite) => shownIn(props, s);
  const canvas = useRef<HTMLCanvasElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 700 });
  const [camera, setCamera] = useState<Camera>(() => fitCamera(homeBounds, 800, 700));
  const [hover, setHover] = useState<Point | null>(null),
    [loading, setLoading] = useState(0),
    [, setFailures] = useState(0);
  const restrictedOverlay = useRef(new RestrictedTerrainOverlay());
  const images = useRef(new Map<string, HTMLImageElement>()),
    failed = useRef(new Set<string>());
  const shaded = useRef(new Map<string, HTMLCanvasElement>());
  const alphaMasks = useRef(new Map<string, { width: number; height: number; alpha: Uint8Array }>());
  const overlay = useRef<HTMLCanvasElement>(null);
  const artCache = useRef<ArtCache | null>(null);
  const artDirty = useRef(true);
  const frame = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
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
  const latest = useRef({ props, camera, size, hover, marquee, touchTrail });
  latest.current = { props, camera, size, hover, marquee, touchTrail };
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
  // Map content changes rebuild the cached art; camera moves and pointer feedback only repaint.
  useEffect(() => {
    artDirty.current = true;
    schedule();
  }, [props.art, terrain, backgroundFile, sceneryFile, props.groundOnly, props.season, props.sprites, props.ground,
    props.grid, props.allowedTerrain, props.plants, props.facilities, props.floors]);
  useEffect(() => {
    schedule();
  }, [camera, size, hover, marquee, touchTrail, regions, props.selected, props.selection, props.selectedCells,
    props.ghost, props.mirrored, props.previewValid, props.tool, props.brush, props.labels, props.marks]);
  useEffect(() => () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    clearTimeout(settle.current);
  }, []);

  /** Paint at most once per display frame, however fast pointer or wheel events arrive. */
  function schedule() {
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  }
  function image(path: string, counter?: { pending: number }) {
    let img = images.current.get(path);
    if (!img && !failed.current.has(path)) {
      img = new Image();
      images.current.set(path, img);
      img.onload = () => {
        artDirty.current = true;
        schedule();
      };
      img.onerror = () => {
        failed.current.add(path);
        setFailures((count) => count + 1);
        artDirty.current = true;
        schedule();
      };
      img.src = withBase(`/maps/farm/${path}`);
    }
    if (img?.complete && img.naturalWidth) return img;
    if (counter && !failed.current.has(path)) counter.pending++;
    return undefined;
  }
  function darkened(path: string, img: HTMLImageElement) {
    let copy = shaded.current.get(path);
    if (!copy) {
      copy = document.createElement('canvas');
      copy.width = img.naturalWidth;
      copy.height = img.naturalHeight;
      const c = copy.getContext('2d')!;
      c.filter = WATERED_SHADE;
      c.drawImage(img, 0, 0);
      shaded.current.set(path, copy);
    }
    return copy;
  }
  /** Draw a sprite in world coordinates if it overlaps the world rectangle `view`. */
  function drawSprite(ctx: CanvasRenderingContext2D, view: View, sprite: SpriteArt, x: number, y: number,
    { opacity = 1, mirror = false, watered = false, counter }: { opacity?: number; mirror?: boolean; watered?: boolean; counter?: { pending: number } } = {}) {
    const start = mirror ? x - sprite.x - sprite.w : x + sprite.x;
    if (start + sprite.w < view.left || start > view.right || y + sprite.y + sprite.h < view.top || y + sprite.y > view.bottom) return;
    const loaded = image(sprite.file, counter);
    if (!loaded) return;
    const img = watered ? darkened(sprite.file, loaded) : loaded;
    ctx.globalAlpha = opacity;
    if (mirror) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sprite.x, y + sprite.y, sprite.w, sprite.h);
      ctx.restore();
    } else ctx.drawImage(img, x + sprite.x, y + sprite.y, sprite.w, sprite.h);
    ctx.globalAlpha = 1;
  }
  function diamond(ctx: CanvasRenderingContext2D, zoom: number, x: number, y: number, fill: string, stroke?: string) {
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
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
    }
  }
  /** The part of the map the art cache should hold: the view plus a margin, clipped to the map. */
  function artRect(p: MapCanvasProps, camera: Camera, size: { width: number; height: number }, margin: number, ratio = 1): View {
    const b = p.art.bounds;
    const fit = Math.sqrt(ART_PIXELS / Math.max(1, size.width * size.height * ratio * ratio));
    margin = Math.max(0, Math.min(margin, (fit - 1) / 2));
    const halfWidth = size.width / 2 / camera.zoom * (1 + 2 * margin), halfHeight = size.height / 2 / camera.zoom * (1 + 2 * margin);
    return {
      left: Math.max(camera.x - halfWidth, b[0] - ART_PAD),
      top: Math.max(camera.y - halfHeight, b[1] - ART_PAD),
      right: Math.min(camera.x + halfWidth, b[2] + ART_PAD),
      bottom: Math.min(camera.y + halfHeight, b[3] + ART_PAD)
    };
  }
  /** Everything that only changes with the map contents: ground, soil, scenery, grid and sprites. */
  function buildArt(p: MapCanvasProps, camera: Camera, size: { width: number; height: number }, ratio: number, counter: { pending: number }): ArtCache {
    const rect = artRect(p, camera, size, ART_MARGIN, ratio);
    const width = Math.max(1, rect.right - rect.left), height = Math.max(1, rect.bottom - rect.top);
    const scale = camera.zoom * ratio;
    const target = artCache.current?.canvas ?? document.createElement('canvas');
    target.width = Math.max(1, Math.ceil(width * scale));
    target.height = Math.max(1, Math.ceil(height * scale));
    const ctx = target.getContext('2d')!;
    ctx.setTransform(scale, 0, 0, scale, -rect.left * scale, -rect.top * scale);
    const cells = p.terrain ?? FARM_CELLS, bounds = p.art.bounds;
    const backgroundPath = p.art.background ?? `${p.art.seasons[p.season]}.webp`;
    const sceneryPath = p.art.background ? p.art.scenery : `${p.art.seasons[p.season]}-scenery.webp`;
    const background = image(backgroundPath, counter);
    if (background) ctx.drawImage(background, bounds[0], bounds[1], bounds[2] - bounds[0], bounds[3] - bounds[1]);
    for (const soil of p.ground) {
      const tile = p.art.soils?.[soil.soil];
      if (tile) drawSprite(ctx, rect, tile, soil.x, soil.y, { watered: soil.watered, counter });
      if (soil.edited) diamond(ctx, camera.zoom, soil.x, soil.y, '', '#f0bf5e');
    }
    const scenery = sceneryPath && !p.groundOnly ? image(sceneryPath, counter) : undefined;
    if (scenery) ctx.drawImage(scenery, bounds[0], bounds[1], bounds[2] - bounds[0], bounds[3] - bounds[1]);
    if (p.allowedTerrain) {
      const parity = cells.length ? (Math.round(cells[0].x / 45) + Math.round(cells[0].y / 45)) % 2 : 1;
      const center = { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2, zoom: camera.zoom };
      const layer = restrictedOverlay.current.render(p.allowedTerrain, bounds, center, width * camera.zoom, height * camera.zoom, ratio, parity);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(layer, 0, 0, target.width, target.height);
      ctx.restore();
    }
    // Wall-only cells (mask 128) hold hanging decorations; they lie over the wall art, so only show them while placing one.
    const wallSpots = p.allowedTerrain && new Set(p.allowedTerrain.map((c) => `${c.x},${c.y}`));
    if (p.grid && camera.zoom > 0.12)
      for (const c of cells) {
        if (c.x < rect.left - 45 || c.x > rect.right + 45 || c.y < rect.top - 45 || c.y > rect.bottom + 45) continue;
        if (c.mask === 128 && !wallSpots?.has(`${c.x},${c.y}`)) continue;
        diamond(ctx, camera.zoom, c.x, c.y, '', c.mask & 1 ? '#fff6' : '#b9d9f044');
      }
    for (const sprite of p.sprites) {
      if (!shownIn(p, sprite)) continue;
      if (sprite.art) drawSprite(ctx, rect, sprite.art, sprite.x, sprite.y, { mirror: sprite.mirror, counter });
      else if (sprite.x >= rect.left && sprite.x <= rect.right && sprite.y >= rect.top && sprite.y <= rect.bottom) {
        ctx.fillStyle = '#bc9151';
        ctx.beginPath();
        ctx.arc(sprite.x, sprite.y, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      if (sprite.edited) diamond(ctx, camera.zoom, sprite.x, sprite.y, '', '#f0bf5e');
    }
    return { canvas: target, ...rect, zoom: camera.zoom, ratio };
  }
  function paint() {
    frame.current = 0;
    const main = canvas.current, top = overlay.current;
    if (!main || !top) return;
    const { props: p, camera, size, hover, marquee, touchTrail } = latest.current;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(size.width * ratio), pixelHeight = Math.round(size.height * ratio);
    for (const layer of [main, top])
      if (layer.width !== pixelWidth || layer.height !== pixelHeight) {
        layer.width = pixelWidth;
        layer.height = pixelHeight;
      }
    let cache = artCache.current;
    const visible = artRect(p, camera, size, 0);
    if (cache && !artDirty.current && cache.ratio === ratio && cache.zoom !== camera.zoom && covers(cache, visible)) {
      // While zooming, scale the cached art and rebuild it sharp once the wheel settles.
      clearTimeout(settle.current);
      settle.current = setTimeout(() => {
        artDirty.current = true;
        schedule();
      }, 150);
    } else if (!cache || artDirty.current || cache.ratio !== ratio || cache.zoom !== camera.zoom || !covers(cache, visible)) {
      const counter = { pending: 0 };
      cache = artCache.current = buildArt(p, camera, size, ratio, counter);
      artDirty.current = false;
      setLoading(counter.pending);
    }
    const z = camera.zoom;
    const ctx = main.getContext('2d')!;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = p.art.background ? '#111816' : '#263f3b';
    ctx.fillRect(0, 0, size.width, size.height);
    if (cache.right > cache.left && cache.bottom > cache.top)
      ctx.drawImage(cache.canvas, (cache.left - camera.x) * z + size.width / 2, (cache.top - camera.y) * z + size.height / 2,
        (cache.right - cache.left) * z, (cache.bottom - cache.top) * z);

    // Pointer feedback, selection and labels: a few shapes on a transparent layer above the art.
    const o = top.getContext('2d')!;
    o.setTransform(ratio, 0, 0, ratio, 0, 0);
    o.clearRect(0, 0, size.width, size.height);
    o.translate(size.width / 2, size.height / 2);
    o.scale(z, z);
    o.translate(-camera.x, -camera.y);
    const view = { left: camera.x - size.width / 2 / z, right: camera.x + size.width / 2 / z, top: camera.y - size.height / 2 / z, bottom: camera.y + size.height / 2 / z };
    const cells = p.terrain ?? FARM_CELLS;
    for (const mark of p.marks ?? []) {
      const marked = new Set(mark.cells);
      for (const c of cells) if (marked.has(c.id)) diamond(o, z, c.x, c.y, mark.fill, mark.stroke);
    }
    const picked = new Set(p.selection);
    if (p.selected) picked.add(p.selected);
    for (const sprite of p.sprites) if (picked.has(sprite.key) && shownIn(p, sprite)) diamond(o, z, sprite.x, sprite.y, '', '#fff2aa');
    const target = hover && pickFarmCell(hover, cells);
    if (target && p.tool !== 'pan') {
      const color = p.previewValid ? '#fff1a0' : '#ff8a79';
      if (!['inspect', 'place'].includes(p.tool)) {
        const radius = (p.brush - 1) / 2;
        for (const c of cells)
          if (
            Math.abs((c.x + c.y - target.x - target.y) / 90) <= radius &&
            Math.abs((c.y - c.x - target.y + target.x) / 90) <= radius &&
            c.mask & 1
          )
            diamond(o, z, c.x, c.y, p.previewValid ? '#fff2a044' : '#ef685844', color);
      } else diamond(o, z, target.x, target.y, '#fff2a022', color);
      if (p.ghost && p.tool === 'place') drawSprite(o, view, p.ghost, target.x, target.y, { opacity: 0.65, mirror: p.mirrored });
    }
    if (p.labels) {
      o.font = `600 ${13 / z}px system-ui`;
      o.textAlign = 'center';
      o.textBaseline = 'middle';
      for (const region of p.regions ?? FARM_REGIONS) {
        const x = (region.bounds[0] + region.bounds[2]) / 2,
          y = region.bounds[1] + 180;
        if (x < view.left + 70 / z || x > view.right - 70 / z || y < view.top + 20 / z || y > view.bottom - 20 / z) continue;
        const w = o.measureText(region.name).width + 26 / z,
          h = 29 / z;
        o.fillStyle = '#1c302ce0';
        o.beginPath();
        o.roundRect(x - w / 2, y - h / 2, w, h, 6 / z);
        o.fill();
        o.fillStyle = '#fff8df';
        o.fillText(region.name, x, y);
      }
    }
    if (marquee) {
      o.fillStyle = '#9ad6bb33'; o.strokeStyle = '#fff2aa'; o.lineWidth = 1.5 / z;
      const points = selectionPolygon(marquee.start, marquee.end);
      o.beginPath(); o.moveTo(points[0].x, points[0].y); points.slice(1).forEach(point => o.lineTo(point.x, point.y)); o.closePath(); o.fill(); o.stroke();
    }
    if (p.selectedCells.length) {
      const chosen = new Set(p.selectedCells);
      for (const c of cells) if (chosen.has(c.id)) diamond(o, z, c.x, c.y, '#9ad6bb22', '#fff2aa');
    }
    for (const point of touchTrail) diamond(o, z, point.x, point.y, '#9ad6bb55', '#fff2aa');
  }
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
      if (!shown(s)) return false;
      if (!s.art) return Math.hypot(p.x - s.x, p.y - s.y) < 40;
      const x = (s.mirror ? s.x-p.x : p.x-s.x)-s.art.x, y = p.y-s.y-s.art.y;
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
    const paint = !pan && (props.tool === 'place' ? !!props.dragPlace : props.tool !== 'inspect');
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
        props.onSelect(props.sprites.filter(s => shown(s) &&
          inSelection(s,a,p)), terrain.filter(c=>inSelection(c,a,p)).map(c=>c.id));
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
        aria-label={tr('农场地图。左键点击选择，拖动框选或使用笔刷，中键拖动平移；触屏单指选择、双指平移。滚轮缩放；方向键移动视角，加减键缩放，Home 查看全貌。选择工具后点击地图编辑。')}
        onContextMenu={(e) => { e.preventDefault(); props.onCancel(); }}
        onKeyDown={(e) => {
          if(e.key.toLowerCase()==='r'){e.preventDefault();props.onRotate();}
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
      <canvas ref={overlay} className="farm-overlay-canvas" aria-hidden="true" />
      <div className="farm-overlay-start">
      <div className="farm-compass" aria-hidden="true">
        {tr('北 ↑')}
      </div>
      <div className="farm-view" role="group" aria-label={tr('显示图层')}>
        <button type="button" aria-pressed={!props.groundOnly} onClick={() => props.onGroundOnly(false)}>{tr('全部')}</button>
        <button type="button" aria-pressed={props.groundOnly} onClick={() => props.onGroundOnly(true)} title={tr('隐藏作物、树木和设施，只显示土地、地板和道路')}>{tr('仅地面')}</button>
      </div>
      </div>
      <button
        type="button"
        className="farm-minimap"
        aria-label={tr('农场总览，拖动定位，回车查看全貌')}
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
          {sceneryFile && !props.groundOnly && <image
            href={withBase(`/maps/farm/${sceneryFile}`)}
            x={props.art.bounds[0]}
            y={props.art.bounds[1]}
            width={props.art.bounds[2] - props.art.bounds[0]}
            height={props.art.bounds[3] - props.art.bounds[1]}
          />}
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
        <button type="button" aria-label={tr('放大地图')} onClick={() => zoom(1.35)}>
          ＋
        </button>
        <output>{Math.round(camera.zoom * 100)}%</output>
        <button type="button" aria-label={tr('缩小地图')} onClick={() => zoom(1 / 1.35)}>
          −
        </button>
        <button type="button" onClick={() => setCamera(fitCamera(homeBounds, size.width, size.height))}>
          {tr('全貌')}
        </button>
      </div>
      {!!loading && (
        <span className="farm-loading" role="status">
          {tr('正在载入场景素材…')}
        </span>
      )}
      {!!failed.current.size && (
        <span className="farm-loading" role="alert">
          {tr('部分素材加载失败，请刷新重试。')}
        </span>
      )}
      <div className="farm-canvas-hint">{tr('左键选择／框选 · 中键平移 · 双指平移 · 滚轮缩放')}</div>
    </div>
  );
}
