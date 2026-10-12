export interface MapPoint { x: number; y: number }
export const toGrid = (p: MapPoint) => ({ x: (p.x + p.y) / 90, y: (p.y - p.x) / 90 });
export const fromGrid = (p: MapPoint) => ({ x: (p.x - p.y) * 45, y: (p.x + p.y) * 45 });
export function selectionPolygon(a: MapPoint, b: MapPoint): MapPoint[] {
  const p = toGrid(a), q = toGrid(b);
  return [p, { x: q.x, y: p.y }, q, { x: p.x, y: q.y }].map(fromGrid);
}
export function inSelection(p: MapPoint, a: MapPoint, b: MapPoint) {
  const v = toGrid(p), l = toGrid(a), r = toGrid(b);
  return v.x >= Math.min(l.x,r.x) - .001 && v.x <= Math.max(l.x,r.x) + .001 && v.y >= Math.min(l.y,r.y) - .001 && v.y <= Math.max(l.y,r.y) + .001;
}
export function containsPoint(poly: MapPoint[], p: MapPoint) {
  let sign = 0;
  for (let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length],cross=(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
    if (Math.abs(cross)<.01) continue;
    if (sign && sign !== Math.sign(cross)) return false;
    sign=Math.sign(cross);
  }
  return true;
}
/** SAT rejects touching edges: adjacent isometric cells may share an edge. */
export function polygonsOverlap(a: MapPoint[], b: MapPoint[]) {
  for (const poly of [a,b]) for (let i=0;i<poly.length;i++) {
    const p=poly[i],q=poly[(i+1)%poly.length],axis={x:p.y-q.y,y:q.x-p.x};
    const x=a.map(v=>v.x*axis.x+v.y*axis.y),y=b.map(v=>v.x*axis.x+v.y*axis.y);
    if (Math.max(...x)<=Math.min(...y)+.01 || Math.max(...y)<=Math.min(...x)+.01) return false;
  }
  return true;
}
export function footprint(spec: { shapes: Record<string, number[][][] | undefined> }, p: MapPoint, angle=45): MapPoint[][] {
  const code=[6,3,2,1,4,7,8,9][((Math.round(angle/45)%8)+8)%8];
  const shapes=spec.shapes[String(code)] ?? spec.shapes['0'] ?? [];
  return (shapes.length ? shapes : [[[0,-45],[45,0],[0,45],[-45,0]]]).map(poly=>poly.map(([x,y])=>({x:p.x+x,y:p.y+y})));
}
