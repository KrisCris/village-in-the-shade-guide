export type Ledge={id:number;left:number;right:number;top:number};
/** CSS-pixel viewport: consistent coverage and travel time, bounded for extreme sizes. */
export function particleViewport(width:number,height:number){
  const w=Number.isFinite(width)?Math.max(1,width):1280;
  const h=Number.isFinite(height)?Math.max(1,height):800;
  return {spawnRate:Math.max(.4,Math.min(10,(1/.45)*w*h/(1280*800))),speedScale:Math.max(.5,Math.min(2.2,h/800))};
}
export type Leaf={id:number;x:number;y:number;vx:number;vy:number;r:number;angle:number;season:number;cycle:number;resting:boolean;platform:number;dx:number;dy:number;cooldown:number;restAge:number;fadeAge:number;fadeAt:number;opacity:number};

/** Seasonal particles linger on UI edges, then fade back into a finite pool. */
export class LeafWorld {
  active:Leaf[]=[];
  private pool:Leaf[]=[];
  private serial=0;
  private time=0;
  private cycle=0;
  private draining=false;
  private roundTotal=0;
  private exited=0;
  private fading=false;
  allocated=0;
  constructor(readonly capacity=800,private contactBottom:(leaf:Leaf)=>number=leaf=>leaf.r){}
  spawn(x:number,y:number,season:number):Leaf|undefined {
    if(this.draining||this.active.length>=this.capacity)return;
    let leaf=this.pool.pop();
    if(!leaf){leaf={} as Leaf;this.allocated++;}
    Object.assign(leaf,{id:++this.serial,x,y,vx:Math.sin(this.serial*2.4)*12,vy:14,r:5+(this.serial%3),angle:this.serial*1.7,season,resting:false,platform:0,dx:0,dy:0,cooldown:0,restAge:0,fadeAge:0,opacity:1});
    leaf.cycle=this.cycle;
    leaf.fadeAt=Infinity;
    this.active.push(leaf);return leaf;
  }
  sweep(x1:number,y1:number,x2:number,y2:number){
    const dx=x2-x1,dy=y2-y1,length=dx*dx+dy*dy;
    if(length<4)return;
    for(const leaf of this.active){
      const t=Math.max(0,Math.min(1,((leaf.x-x1)*dx+(leaf.y-y1)*dy)/length));
      if(Math.hypot(leaf.x-x1-t*dx,leaf.y-y1-t*dy)>leaf.r+13)continue;
      leaf.resting=false;leaf.cooldown=.5;
      leaf.vx=Math.max(-480,Math.min(480,dx*12));leaf.vy=Math.max(-130,Math.min(180,dy*8))-45;
    }
  }
  step(dt:number,width:number,height:number,ledges:Ledge[],speedScale=1){
    dt=Math.min(dt,1/30);
    this.time+=dt;
    const platforms=new Map(ledges.map(p=>[p.id,p]));
    for(const leaf of this.active){
      if(leaf.resting){
        leaf.restAge+=dt;
        const p=platforms.get(leaf.platform);
        if(!p||leaf.dx<0||p.left+leaf.dx>p.right){leaf.resting=false;leaf.cooldown=.1;}
        else{leaf.x=p.left+leaf.dx;leaf.y=p.top+leaf.dy;}
        if(leaf.restAge>2+(leaf.id%5)*.4&&leaf.cycle===this.cycle){
          leaf.resting=false;leaf.cooldown=1;leaf.restAge=0;leaf.vy=18;leaf.vx=Math.sin(leaf.id)*16;
        }
      }
      // Once fading starts, sweeping cannot restart its lifetime.
      if(this.time>=leaf.fadeAt)leaf.fadeAge+=dt;
      leaf.opacity=Math.max(0,1-leaf.fadeAge/1.6);
      if(leaf.resting)continue;
      const oldBottom=leaf.y+leaf.r;
      leaf.cooldown=Math.max(0,leaf.cooldown-dt);
      // Different phases and periods avoid synchronized pendulums. Drag gradually
      // brings swept leaves back into the breeze instead of snapping their velocity.
      const phase=this.time*(.7+(leaf.id%7)*.035)+leaf.id*2.399;
      const breeze=Math.sin(phase)*22+Math.sin(this.time*.24+leaf.id)*7;
      leaf.vx+=(breeze-leaf.vx)*(1-Math.exp(-1.1*dt));
      const terminal=speedScale*1.2*(leaf.season===3?17+3*Math.cos(phase):23+7*Math.cos(phase*2));
      leaf.vy+=(terminal-leaf.vy)*(1-Math.exp(-1.4*dt));
      leaf.x+=leaf.vx*dt;leaf.y+=leaf.vy*dt;
      // Side winds cannot prematurely discard the particles needed for a bottom exit.
      if(leaf.x<leaf.r){leaf.x=leaf.r;leaf.vx=Math.abs(leaf.vx);}
      if(leaf.x>width-leaf.r){leaf.x=width-leaf.r;leaf.vx=-Math.abs(leaf.vx);}
      const tilt=Math.sin(phase)*.7+Math.sin(phase*.47)*.3;
      leaf.angle+=(tilt-leaf.angle)*(1-Math.exp(-1.5*dt));
      if(leaf.vy<=0||leaf.cooldown>0)continue;
      let surface=Infinity,platform:Ledge|undefined;
      for(const p of ledges){
        if(leaf.x+leaf.r>p.left && leaf.x-leaf.r<p.right && oldBottom<=p.top+1 && leaf.y+leaf.r>=p.top && p.top<surface){surface=p.top;platform=p;}
      }
      if(platform && surface!==Infinity){
        leaf.angle=Math.sin(leaf.id)*.4;
        leaf.y=surface-this.contactBottom(leaf);leaf.vx=0;leaf.vy=0;leaf.resting=true;
        leaf.platform=platform.id;leaf.dx=leaf.x-platform.left;leaf.dy=leaf.y-platform.top;
        leaf.angle=Math.sin(leaf.id)*.4;
      }
    }
    let write=0,nextSeason:number|undefined;
    for(const leaf of this.active){
      const exited=leaf.y-leaf.r*1.5>height;
      if(exited){
        if(!this.draining){this.draining=true;this.roundTotal=this.active.length;}
        this.exited++;
      }
      if(leaf.opacity<=0 || exited)this.pool.push(leaf);
      else this.active[write++]=leaf;
    }
    this.active.length=write;
    if(this.draining&&!this.fading&&this.exited>this.roundTotal/2){
      this.fading=true;
      // IDs follow creation order, including objects reused from the pool.
      [...this.active].sort((a,b)=>a.id-b.id).forEach((leaf,index)=>{leaf.fadeAt=this.time+index*.25;});
    }
    if(this.draining&&!this.active.length){
      this.cycle++;nextSeason=this.cycle%4;
      this.draining=false;this.fading=false;this.exited=0;this.roundTotal=0;
    }
    return nextSeason;
  }
}
