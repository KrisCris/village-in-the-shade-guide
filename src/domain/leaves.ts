/** CSS-pixel viewport: consistent coverage and travel time, bounded for extreme sizes. */
export function particleViewport(width:number,height:number){
  const w=Number.isFinite(width)?Math.max(1,width):1280;
  const h=Number.isFinite(height)?Math.max(1,height):800;
  return {spawnRate:Math.max(.6,Math.min(10,(1/.3)*w*h/(1280*800))),speedScale:Math.max(.5,Math.min(2.2,h/800))};
}

/** Leaves drift 20-40 px/s, so ~60 updates a second look the same as 120-165 and halve the compositor work. */
export const LEAF_FRAME_MS=12;
export const shouldDrawLeaves=(sinceLast:number)=>sinceLast>=LEAF_FRAME_MS;

export type LeafState='air'|'slide'|'settle'|'pile';
export type Leaf={
  id:number;season:number;r:number;x:number;y:number;vx:number;vy:number;
  /** Velocity from wind and swipes; it decays back into the leaf's own flutter, like air drag. */
  ex:number;ey:number;
  /** Pendulum flutter: phase, swings per second, sideways glide and sink speed (px/s), tilt (rad). */
  phase:number;freq:number;swing:number;sink:number;tilt:number;
  /** Flip speed for leaves that tumble end over end (rad/s), 0 for gliders. */
  tumble:number;flip:number;angle:number;spin:number;
  state:LeafState;age:number;slide:number;release:number;
  /** Lying in the drift: height of its underside above the ground, footprint half-width, thickness, width scale. */
  support:number;half:number;thick:number;wide:number;
};

/** Seconds a leaf takes to lie flat after touching down. */
export const SETTLE=.2;
const CELL=2,DRAG=1.6,GUST=560;
const noise=(id:number,salt:number)=>{const s=Math.sin(id*12.9898+salt*78.233)*43758.5453;return s-Math.floor(s);};
const clamp=(value:number,low:number,high:number)=>Math.max(low,Math.min(high,value));

/**
 * Leaves flutter down, heap into a drift along the bottom edge and can be blown about. When the drift is full a
 * gust clears it and step() reports the start of the next season.
 */
export class LeafWorld {
  /** Leaves in the air, sliding down the drift or settling onto it. */
  leaves:Leaf[]=[];
  /** Settled leaves in landing order; later ones lie on top. */
  pile:Leaf[]=[];
  /** Settled since the renderer last drew the drift; pileChanged asks it to redraw the drift from scratch. */
  landed:Leaf[]=[];
  pileChanged=true;
  allocated=0;
  cycle=0;
  private pool:Leaf[]=[];
  private serial=0;
  private time=0;
  private width=0;
  private height=0;
  private heights=new Float32Array(1);
  private gust:{time:number;dir:number}|undefined;
  constructor(readonly capacity=800){}
  get gusting(){return !!this.gust;}
  get count(){return this.leaves.length+this.pile.length;}
  /** Average drift height that calls the gust, and the local height above which leaves slide off. */
  get fullAt(){return clamp(this.height*.011,7,12);}
  get depth(){return this.fullAt*3;}
  /** Height of the drift under a footprint. */
  surface(x:number,half:number){
    const from=Math.max(0,Math.floor((x-half)/CELL)),to=Math.min(this.heights.length-1,Math.ceil((x+half)/CELL));
    let top=0;for(let i=from;i<=to;i++)if(this.heights[i]>top)top=this.heights[i];
    return top;
  }
  resize(width:number,height:number){
    if(this.height)for(const leaf of this.leaves)if(leaf.state!=='air')leaf.y+=height-this.height;
    this.width=width;this.height=height;this.heights=new Float32Array(Math.ceil(width/CELL)+1);
    this.restack(true);
  }
  spawn(x:number,y:number,season:number):Leaf|undefined {
    if(this.gust||this.count>=this.capacity)return;
    let leaf=this.pool.pop();
    if(!leaf){leaf={} as Leaf;this.allocated++;}
    const id=++this.serial,snow=season===3,petal=season===0,r=(snow?4:5)+id%3;
    const wide=snow?1:.72+.28*Math.abs(Math.cos(id*1.3));
    Object.assign(leaf,{
      id,season,r,x,y,vx:0,vy:0,ex:0,ey:0,
      phase:noise(id,1)*Math.PI*2,freq:snow?.22+.16*noise(id,2):.5+.4*noise(id,2),
      swing:snow?7+6*noise(id,3):petal?26+16*noise(id,3):18+16*noise(id,3),
      sink:snow?16+6*noise(id,4):petal?23+8*noise(id,4):27+10*noise(id,4),
      tilt:snow?0:.45+.4*noise(id,5),tumble:!snow&&noise(id,6)<.16?2.6+1.8*noise(id,7):0,
      flip:noise(id,8)*Math.PI*2,angle:noise(id,9)*Math.PI*2*(snow?1:0),spin:0,
      state:'air',age:0,slide:0,release:0,support:0,half:r*1.12*wide,thick:snow?r*.5:r*.6,wide,
    } satisfies Leaf);
    this.leaves.push(leaf);return leaf;
  }
  /** A swipe pushes nearby leaves along its direction and kicks settled ones up off the drift. */
  blow(x1:number,y1:number,x2:number,y2:number,dt:number){
    const dx=x2-x1,dy=y2-y1,length=dx*dx+dy*dy;
    if(length<4||dt<=0)return;
    const vx=dx/dt,vy=dy/dt,speed=Math.hypot(vx,vy);
    if(speed<120)return;
    const reach=30+Math.min(40,speed*.03);
    const push=(leaf:Leaf)=>{
      const t=clamp(((leaf.x-x1)*dx+(leaf.y-y1)*dy)/length,0,1);
      const distance=Math.hypot(leaf.x-x1-t*dx,leaf.y-y1-t*dy);
      if(distance>reach)return false;
      const f=1-distance/reach,grounded=leaf.state!=='air';
      leaf.ex=clamp(leaf.ex+vx*.6*f,-650,650);
      leaf.ey=clamp(leaf.ey+vy*.35*f-(grounded?80+speed*.12:20)*f,-520,400);
      leaf.spin+=((noise(leaf.id,10)-.5)*speed*.02+Math.sign(vx||1)*2)*f;
      if(grounded){leaf.state='air';leaf.age=0;}
      return true;
    };
    for(const leaf of this.leaves)push(leaf);
    const lifted=this.pile.filter(push);
    if(lifted.length){
      this.leaves.push(...lifted);
      this.pile=this.pile.filter(leaf=>leaf.state==='pile');
      this.restack(false);
    }
  }
  /** Advances the leaves; returns true on the frame a gust starts clearing a full drift. */
  step(dt:number,speedScale=1):boolean {
    dt=Math.min(dt,1/30);
    this.time+=dt;
    const decay=Math.exp(-DRAG*dt),spinDecay=Math.exp(-1.2*dt),ground=this.height,gust=this.gust;
    const breeze=10*Math.sin(this.time*.13)+6*Math.sin(this.time*.31+1);
    if(gust){
      gust.time+=dt;
      // The gust sweeps across from its upwind side, lifting the drift as it passes.
      const lifted=this.pile.filter(leaf=>leaf.release<=gust.time);
      if(lifted.length){
        for(const leaf of lifted){
          leaf.state='air';leaf.age=0;
          leaf.ex=gust.dir*(220+160*noise(leaf.id,11));leaf.ey=-(60+170*noise(leaf.id,12));leaf.spin=gust.dir*(3+3*noise(leaf.id,13));
        }
        this.leaves.push(...lifted);this.pile=this.pile.filter(leaf=>leaf.state==='pile');this.restack(false);
      }
    }
    let write=0;
    for(const leaf of this.leaves){
      leaf.age+=dt;
      if(gust&&leaf.state!=='air'){leaf.state='air';leaf.age=0;leaf.ey=-80;}
      if(leaf.state==='air'){
        leaf.phase+=Math.PI*2*leaf.freq*dt;
        const swing=Math.cos(leaf.phase);
        let glide:number,sink:number;
        if(leaf.tumble){leaf.flip+=leaf.tumble*dt;glide=leaf.swing*.7*Math.sin(2*leaf.flip);sink=leaf.sink*1.15;}
        // Like a pendulum: fastest and lowest mid-swing, almost hanging at each end of the glide.
        else{glide=leaf.swing*swing;sink=leaf.sink*(.35+1.3*swing*swing);}
        if(gust)leaf.ex+=gust.dir*GUST*Math.min(1,gust.time/.4)*dt;
        leaf.ex*=decay;leaf.ey*=decay;leaf.spin*=spinDecay;
        leaf.vx=(breeze+glide)*speedScale+leaf.ex;leaf.vy=sink*speedScale+leaf.ey;
        leaf.x+=leaf.vx*dt;leaf.y+=leaf.vy*dt;
        const tilt=leaf.tumble||leaf.season===3?leaf.angle+(leaf.season===3?.4:.9)*dt:leaf.angle+(leaf.tilt*Math.sin(leaf.phase)-leaf.angle)*(1-Math.exp(-6*dt));
        leaf.angle=tilt+leaf.spin*dt;
        // Only wind carries leaves out of the window; the flutter alone turns at its edges.
        if(Math.abs(leaf.ex)<60&&!gust){
          if(leaf.x<leaf.r)leaf.x=leaf.r;
          if(leaf.x>this.width-leaf.r)leaf.x=this.width-leaf.r;
        }
        if(leaf.x<-40||leaf.x>this.width+40||leaf.y<-160){this.pool.push(leaf);continue;}
        if(leaf.vy>0&&!gust){
          const support=this.surface(leaf.x,leaf.half);
          if(leaf.y+leaf.r*.6>=ground-support)this.touchDown(leaf);
        }else if(leaf.y>ground-leaf.r*.6){leaf.y=ground-leaf.r*.6;leaf.ey=Math.min(leaf.ey,0);}
      }else if(leaf.state==='slide'){
        leaf.x=clamp(leaf.x+leaf.slide*(30+12*(leaf.id%3))*dt,leaf.half,this.width-leaf.half);
        const support=this.bed(leaf);
        leaf.y=ground-support-leaf.thick/2;
        if(!this.steep(leaf,support)||leaf.age>2.5||leaf.x<=leaf.half||leaf.x>=this.width-leaf.half){leaf.state='settle';leaf.age=0;}
      }else if(leaf.state==='settle'){
        leaf.angle+=(this.restAngle(leaf)-leaf.angle)*(1-Math.exp(-14*dt));
        if(leaf.age>=SETTLE){this.lay(leaf);continue;}
      }
      this.leaves[write++]=leaf;
    }
    this.leaves.length=write;
    if(gust&&(!this.count||gust.time>7)){
      for(const leaf of [...this.leaves,...this.pile])this.pool.push(leaf);
      this.leaves.length=0;this.pile.length=0;this.restack(false);
      this.gust=undefined;this.cycle++;
    }
    if(!gust&&this.full()){
      const dir=this.cycle%2?-1:1;
      this.gust={time:0,dir};
      for(const leaf of this.pile)leaf.release=(dir>0?leaf.x/this.width:1-leaf.x/this.width)*.9+.15*noise(leaf.id,14);
      return true;
    }
    return false;
  }
  /** Removes every leaf, as when motion is reduced. */
  clear(){
    for(const leaf of [...this.leaves,...this.pile])this.pool.push(leaf);
    this.leaves.length=0;this.pile.length=0;this.gust=undefined;this.restack(false);
  }
  private full(){
    if(this.pile.length>=this.capacity*.9)return true;
    let sum=0;for(const height of this.heights)sum+=height;
    return sum/this.heights.length>=this.fullAt;
  }
  /** A leaf landing on a slope steeper than the drift holds, or on its crest, slides toward the lower side. */
  private steep(leaf:Leaf,support:number){
    const left=this.surface(leaf.x-leaf.half*1.6,leaf.half*.6),right=this.surface(leaf.x+leaf.half*1.6,leaf.half*.6);
    leaf.slide=left<right?-1:1;
    return support-Math.min(left,right)>leaf.thick*1.2||support>this.depth&&Math.min(left,right)<support;
  }
  private restAngle(leaf:Leaf){
    const left=this.surface(leaf.x-leaf.half,leaf.half*.4),right=this.surface(leaf.x+leaf.half,leaf.half*.4);
    return -Math.atan2(right-left,leaf.half*2)+(noise(leaf.id,15)-.5)*.2;
  }
  /** Where a leaf lies: the drift under its middle (it tilts along the slope beside that). */
  private bed(leaf:Leaf){return this.surface(leaf.x,leaf.half*.35);}
  private touchDown(leaf:Leaf){
    const support=this.bed(leaf);
    leaf.ex=0;leaf.ey=0;leaf.spin=0;leaf.age=0;leaf.y=this.height-support-leaf.thick/2;
    leaf.state=this.steep(leaf,support)?'slide':'settle';
  }
  private lay(leaf:Leaf){
    leaf.state='pile';leaf.support=this.bed(leaf);leaf.y=this.height-leaf.support-leaf.thick/2;
    leaf.angle=this.restAngle(leaf);
    this.deposit(leaf);this.pile.push(leaf);this.landed.push(leaf);
  }
  /** A leaf lies along the drift, so every column under it gains its thickness (thinner toward its tips). */
  private deposit(leaf:Leaf){
    const from=Math.max(0,Math.floor((leaf.x-leaf.half)/CELL)),to=Math.min(this.heights.length-1,Math.ceil((leaf.x+leaf.half)/CELL));
    for(let i=from;i<=to;i++){
      const across=Math.min(1,Math.abs(i*CELL-leaf.x)/leaf.half);
      this.heights[i]+=leaf.thick*(.45+.55*Math.cos(across*Math.PI/2));
    }
  }
  /** Re-stacks the drift in landing order; leaves whose support was blown away drop and land again. */
  private restack(resized:boolean){
    this.heights.fill(0);
    const kept:Leaf[]=[];
    for(const leaf of this.pile){
      if(leaf.x>this.width+leaf.half){this.pool.push(leaf);continue;}
      const support=this.bed(leaf);
      if(!resized&&leaf.support>support+1.5){leaf.state='air';leaf.age=0;leaf.ex=0;leaf.ey=0;this.leaves.push(leaf);continue;}
      leaf.support=support;leaf.y=this.height-support-leaf.thick/2;
      this.deposit(leaf);kept.push(leaf);
    }
    this.pile=kept;this.landed.length=0;this.pileChanged=true;
  }
}
