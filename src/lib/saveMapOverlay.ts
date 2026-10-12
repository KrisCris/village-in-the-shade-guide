import type { Camera, Point } from './saveMapScene';

/** Viewport-sized raster cache. Hover/selection redraws only composite this image. */
export class RestrictedTerrainOverlay {
  private layer?: HTMLCanvasElement;
  private key = '';
  private allowed?: Point[];

  render(allowed:Point[], bounds:number[], camera:Camera, width:number, height:number, ratio:number, parity:number) {
    const key=[...bounds,camera.x,camera.y,camera.zoom,width,height,ratio,parity].join(':');
    if(this.layer&&this.key===key&&this.allowed===allowed)return this.layer;
    const layer=this.layer??=document.createElement('canvas');
    layer.width=Math.ceil(width*ratio);layer.height=Math.ceil(height*ratio);
    const ctx=layer.getContext('2d')!;
    ctx.setTransform(ratio,0,0,ratio,0,0);
    const z=camera.zoom,ox=width/2-camera.x*z,oy=height/2-camera.y*z;
    const left=Math.max(0,bounds[0]*z+ox),top=Math.max(0,bounds[1]*z+oy);
    const right=Math.min(width,bounds[2]*z+ox),bottom=Math.min(height,bounds[3]*z+oy);
    if(right>left&&bottom>top) {
      ctx.fillStyle='#59636b66';ctx.fillRect(left,top,right-left,bottom-top);
      // Constant-sized repeating texture replaces potentially hundreds of thousands
      // of vector boxes. Far zoom merges cells instead of drawing subpixel hatching.
      const stride=2**Math.max(0,Math.ceil(Math.log2(14/(90*z))));
      const period=90*stride*z,tile=document.createElement('canvas');
      tile.width=tile.height=Math.ceil(period*ratio);
      const t=tile.getContext('2d')!;
      t.scale(tile.width/90,tile.height/90);
      const boxes=new Path2D(),hatch=new Path2D();
      for(const [x,y] of [[0,0],[90,0],[45,45],[0,90],[90,90]]) {
        boxes.moveTo(x,y-42);boxes.lineTo(x+42,y);boxes.lineTo(x,y+42);boxes.lineTo(x-42,y);boxes.closePath();
        hatch.moveTo(x-19,y-19);hatch.lineTo(x+19,y+19);
        hatch.moveTo(x-19,y+19);hatch.lineTo(x+19,y-19);
      }
      t.fillStyle='#172d2310';t.fill(boxes);
      t.lineWidth=2.5/(stride*z);t.strokeStyle='#172d2355';t.stroke(boxes);
      t.lineWidth=1/(stride*z);t.strokeStyle='#f2e5c4b3';t.stroke(boxes);
      t.setLineDash([3/(stride*z),3/(stride*z)]);t.strokeStyle='#f2e5c48c';t.stroke(hatch);
      const pattern=ctx.createPattern(tile,'repeat')!;
      pattern.setTransform(new DOMMatrix().translate(ox,oy+parity*45*z).scale(period/tile.width));
      ctx.fillStyle=pattern;ctx.fillRect(left,top,right-left,bottom-top);
      const holes=new Path2D(),r=45*z;
      for(const c of allowed) {
        const x=c.x*z+ox,y=c.y*z+oy;
        if(x+r<left||x-r>right||y+r<top||y-r>bottom)continue;
        holes.moveTo(x,y-r);holes.lineTo(x+r,y);holes.lineTo(x,y+r);holes.lineTo(x-r,y);holes.closePath();
      }
      ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';ctx.fill(holes);
      ctx.globalCompositeOperation='source-over';
    }
    this.key=key;this.allowed=allowed;
    return layer;
  }
}
