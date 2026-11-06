/** CSS-pixel viewport: consistent coverage and travel time, bounded for extreme sizes. */
export function particleViewport(width:number,height:number){
  const w=Number.isFinite(width)?Math.max(1,width):1280;
  const h=Number.isFinite(height)?Math.max(1,height):800;
  return {spawnRate:Math.max(.6,Math.min(10,(1/.3)*w*h/(1280*800))),speedScale:Math.max(.5,Math.min(2.2,h/800))};
}

/** Leaves drift 20-50 px/s, so ~60 updates a second look the same as 120-165 and halve the compositor work. */
export const LEAF_FRAME_MS=12;
export const shouldDrawLeaves=(sinceLast:number)=>sinceLast>=LEAF_FRAME_MS;

export type LeafState='air'|'slide'|'settle'|'pile';
/**
 * How a leaf falls. glide: a pendulum swing, hanging at each end. swoop: long swings that stall and climb a little at
 * each end. tumble: end over end. spin: whirls flat like a propeller and drops steadily. spiral: a corkscrew around a
 * vertical axis.
 */
export type LeafFall='glide'|'swoop'|'tumble'|'spin'|'spiral';
export type Leaf={
  id:number;season:number;r:number;x:number;y:number;vx:number;vy:number;
  /** Velocity from wind and swipes; it decays back into the leaf's own flutter, like air drag. */
  ex:number;ey:number;
  /** Flutter: phase, swings (or turns) per second, sideways glide and sink speed (px/s), tilt (rad). */
  fall:LeafFall;phase:number;freq:number;swing:number;sink:number;tilt:number;
  /** Sideways lean (-1..1) and a slow drift of the swing's width and pace (phase, rad/s), so no two leaves keep step. */
  lean:number;mood:number;moodRate:number;
  /** Flip speed of a tumbler and turn of a spinner or snowflake in its own plane (rad/s); 0 when it does neither. */
  tumble:number;flip:number;whirl:number;angle:number;spin:number;
  state:LeafState;age:number;slide:number;release:number;
  /** Lying in the drift: height of its underside above the ground, footprint half-width, thickness, width scale. */
  support:number;half:number;thick:number;wide:number;
  /** Fading out (melting, for snow): world time it starts, seconds it takes, and what is left of it (1..0). */
  meltAt:number;meltFor:number;life:number;
};
/** 'full': the drift needs clearing (call sweep()). 'cleared': most of a swept drift is gone, so the season can turn. */
export type LeafEvent='full'|'cleared';
/** A gust lifts the drift and carries it out of the window. A thaw does that to loose snow and melts the packed layer under it. */
export type SweepStyle='gust'|'thaw';

/** Seconds a leaf takes to lie flat after touching down. */
export const SETTLE=.2;
/** Share of a swept drift still on screen when step() reports it cleared. */
export const CLEARED=.1;
/** In a thaw, this share of the snowflakes, lowest first, is packed: it melts instead of blowing away. */
export const PACKED=.5;
/** Gust acceleration (px/s²): downwind, the average updraft, extra updraft at the ground and the eddies' swirl. */
const CELL=2,DRAG=1.6,GUST=560,LIFT=260,GROUND_LIFT=600,EDDY=200;
/** Height of a flake's top below which snow in the drift counts as packed (see PACKED). */
export function packedLine(pile:readonly Leaf[]){
  if(!pile.length)return 0;
  const tops=pile.map(leaf=>leaf.support+leaf.thick).sort((a,b)=>a-b);
  return tops[Math.min(tops.length-1,Math.floor(tops.length*PACKED))];
}
const noise=(id:number,salt:number)=>{const s=Math.sin(id*12.9898+salt*78.233)*43758.5453;return s-Math.floor(s);};
const clamp=(value:number,low:number,high:number)=>Math.max(low,Math.min(high,value));

/**
 * Leaves flutter down, heap into a drift along the bottom edge and can be blown about. When the drift is full,
 * step() asks for a sweep, and reports once most of it is gone so the season turns on a clear window.
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
  private clearing:{time:number;dir:number;total:number;cleared:boolean}|undefined;
  /** Some leaves are fading; the drift is repainted while they do and re-stacked once they are gone. */
  private waning=false;
  private thawed=false;
  constructor(readonly capacity=800){}
  /** A sweep is under way: the wind is up and new leaves wait. */
  get sweeping(){return !!this.clearing;}
  get count(){return this.leaves.length+this.pile.length;}
  /** Average drift height that asks for a sweep, and the local height above which leaves slide off. */
  get fullAt(){return clamp(this.height*.011,7,12);}
  get depth(){return this.fullAt*3;}
  /** Height of the drift under a footprint. */
  surface(x:number,half:number){
    const [from,to]=this.columns(x,half);
    let top=0;for(let i=from;i<=to;i++)if(this.heights[i]>top)top=this.heights[i];
    return top;
  }
  /**
   * Height columns inside a footprint. Rounding outward would let a leaf raise a column past its tip, and a
   * neighbour landing there would rest on nothing. Every footprint queried is wider than CELL, so none is empty.
   */
  private columns(x:number,half:number){
    return [Math.max(0,Math.ceil((x-half)/CELL)),Math.min(this.heights.length-1,Math.floor((x+half)/CELL))] as const;
  }
  resize(width:number,height:number){
    if(this.height)for(const leaf of this.leaves)if(leaf.state!=='air')leaf.y+=height-this.height;
    this.width=width;this.height=height;this.heights=new Float32Array(Math.ceil(width/CELL)+1);
    this.restack(true);
  }
  spawn(x:number,y:number,season:number):Leaf|undefined {
    if(this.clearing||this.count>=this.capacity)return;
    let leaf=this.pool.pop();
    if(!leaf){leaf={} as Leaf;this.allocated++;}
    const id=++this.serial,snow=season===3,petal=season===0,r=(snow?4:5)+id%3;
    const wide=snow?1:.72+.28*Math.abs(Math.cos(id*1.3)),pick=noise(id,6);
    // Petals spin and corkscrew more than leaves; snow either drifts or circles slowly.
    const fall:LeafFall=snow?(pick<.3?'spiral':'glide')
      :petal?(pick<.1?'tumble':pick<.35?'spin':pick<.55?'spiral':pick<.65?'swoop':'glide')
      :(pick<.16?'tumble':pick<.3?'spin':pick<.44?'spiral':pick<.62?'swoop':'glide');
    const freq=(snow?.14+.1*noise(id,2):petal?.34+.22*noise(id,2):.28+.2*noise(id,2))*(fall==='swoop'?.6:1);
    const swing=(snow?7+6*noise(id,3):petal?26+16*noise(id,3):18+16*noise(id,3))*(fall==='swoop'?1.6:fall==='spin'?.5:fall==='spiral'?.8:1);
    const turn=noise(id,23)<.5?-1:1;
    Object.assign(leaf,{
      id,season,r,x,y,vx:0,vy:0,ex:0,ey:0,
      fall,phase:noise(id,1)*Math.PI*2,freq,swing,
      sink:snow?20+8*noise(id,4):petal?31+11*noise(id,4):36+14*noise(id,4),
      tilt:snow?0:.45+.4*noise(id,5),tumble:fall==='tumble'?1.6+1.4*noise(id,7):0,
      lean:noise(id,16)*2-1,mood:noise(id,17)*Math.PI*2,moodRate:.25+.35*noise(id,18),
      flip:noise(id,8)*Math.PI*2,whirl:turn*(snow?.2+.5*noise(id,24):fall==='spin'?2.5+2.5*noise(id,24):0),
      angle:noise(id,9)*Math.PI*2*(snow||fall==='spin'?1:0),spin:0,
      state:'air',age:0,slide:0,release:0,support:0,half:r*1.12*wide,thick:snow?r*.5:r*.6,wide,
      meltAt:Infinity,meltFor:1,life:1,
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
  /**
   * Starts clearing the drift before the season turns, and holds new leaves until it is gone. The wind sweeps across
   * from its upwind side, lifting the drift as it passes. In a thaw it lifts only the loose snow; the packed layer it
   * uncovers melts where it lies.
   */
  sweep(style:SweepStyle){
    if(this.clearing)return;
    const dir=this.cycle%2?-1:1;
    this.clearing={time:0,dir,total:this.count,cleared:false};
    // Ranked rather than measured against the highest flake: a single crest stands far above the rest of the drift.
    const packed=style==='thaw'?packedLine(this.pile):-Infinity;
    for(const leaf of this.pile){
      const passes=(dir>0?leaf.x/this.width:1-leaf.x/this.width)*.9;
      leaf.release=passes+.15*noise(leaf.id,14);
      if(leaf.support+leaf.thick<packed){leaf.release=Infinity;this.melt(leaf,passes+.4+.6*noise(leaf.id,19),1.2+.6*noise(leaf.id,20));}
    }
  }
  /** Fades out every leaf of another season, as when a season is picked by hand. New leaves keep falling meanwhile. */
  fade(season:number){
    for(const leaf of this.leaves)if(leaf.season!==season)this.melt(leaf,.3*noise(leaf.id,19),1+.2*noise(leaf.id,20));
    for(const leaf of this.pile)if(leaf.season!==season)this.melt(leaf,.3*noise(leaf.id,19),1+.2*noise(leaf.id,20));
  }
  private melt(leaf:Leaf,delay:number,seconds:number){
    if(leaf.meltAt!==Infinity)return;
    leaf.meltAt=this.time+delay;leaf.meltFor=seconds;this.waning=true;
  }
  /** Updates a fading leaf; true once it has gone. */
  private wane(leaf:Leaf){
    leaf.life=1-Math.max(0,this.time-leaf.meltAt)/leaf.meltFor;
    return leaf.life<=0;
  }
  /** Advances the leaves and reports when the drift fills, and when a sweep has carried most of it away. */
  step(dt:number,speedScale=1):LeafEvent|undefined {
    dt=Math.min(dt,1/30);
    this.time+=dt;
    // Every sweep brings a wind: a gust, or the spring breeze of a thaw.
    const gust=this.clearing;
    const decay=Math.exp(-DRAG*dt),spinDecay=Math.exp(-1.2*dt),ground=this.height;
    const breeze=10*Math.sin(this.time*.13)+6*Math.sin(this.time*.31+1);
    if(gust)gust.time+=dt;
    let waning=false;
    if(this.waning){
      let kept=0;
      for(const leaf of this.pile){
        if(leaf.meltAt!==Infinity){
          waning=true;
          // Melted leaves leave their columns standing until the end, so nothing above them drops mid-thaw.
          if(this.wane(leaf)){this.pool.push(leaf);this.thawed=true;continue;}
          if(leaf.life<1)this.pileChanged=true;
        }
        this.pile[kept++]=leaf;
      }
      this.pile.length=kept;
    }
    if(gust){
      const lifted=this.pile.filter(leaf=>leaf.release<=gust.time);
      if(lifted.length){
        for(const leaf of lifted){
          leaf.state='air';leaf.age=0;
          leaf.ex=gust.dir*(220+160*noise(leaf.id,11));leaf.ey=-(140+200*noise(leaf.id,12));leaf.spin=gust.dir*(3+3*noise(leaf.id,13));
          // Torn off the drift, a leaf tumbles end over end; a snowflake just turns faster.
          if(leaf.season!==3){leaf.fall='tumble';leaf.tumble=3+4*noise(leaf.id,7);}
        }
        this.leaves.push(...lifted);this.pile=this.pile.filter(leaf=>leaf.state==='pile');this.restack(false);
      }
    }
    let write=0;
    for(const leaf of this.leaves){
      leaf.age+=dt;
      if(leaf.meltAt!==Infinity){waning=true;if(this.wane(leaf)){this.pool.push(leaf);continue;}}
      if(gust&&leaf.state!=='air'){leaf.state='air';leaf.age=0;leaf.ey=-80;}
      if(leaf.state==='air'){
        // The swing widens and narrows, and speeds up and slows down, over a few seconds.
        leaf.mood+=leaf.moodRate*dt;
        const width=.4+.6*(.5+.5*Math.sin(leaf.mood));
        leaf.phase+=Math.PI*2*leaf.freq*(1+.3*Math.sin(leaf.mood*1.7+leaf.lean*3))*dt;
        const swing=Math.cos(leaf.phase);
        // Wind varies across the window: neighbours drift together, leaves far apart do not.
        const wind=7*Math.sin(leaf.x*.0045+this.time*.35)+5*Math.sin(leaf.y*.007-this.time*.23+2);
        let glide:number,sink:number;
        switch(leaf.fall){
          case 'tumble':leaf.flip+=leaf.tumble*(.8+.4*width)*dt;glide=leaf.swing*(.5*leaf.lean+.2*Math.sin(leaf.flip));sink=leaf.sink*1.15;break;
          // A propeller falls fast and straight, wobbling a little.
          case 'spin':glide=leaf.swing*(.3*leaf.lean+.3*swing);sink=leaf.sink*1.3;break;
          // A corkscrew sinks steadily; it moves sideways fastest as it passes nearest and farthest.
          case 'spiral':glide=leaf.swing*(swing+.15*leaf.lean);sink=leaf.sink*(.85+.15*width);break;
          // Always a wide swing: diving mid-swoop, then stalling and rising a little before it swings back.
          case 'swoop':{const span=.75+.25*width;glide=leaf.swing*(span*swing+.2*leaf.lean);sink=leaf.sink*(1+span*(2.2*swing*swing-1.25));break;}
          // Like a pendulum: fastest and lowest mid-swing, almost hanging at each end of the glide. A narrow swing falls steadier.
          default:glide=leaf.swing*(width*swing+.25*leaf.lean);sink=leaf.sink*(1+width*(1.3*swing*swing-.65));
        }
        if(gust){
          // A gust carries leaves up and away: downwind, an updraft that is strongest where the wind hits the ground,
          // and eddies that give each leaf its own wavy path.
          const ramp=Math.min(1,gust.time/.4),low=clamp(1-(ground-leaf.y)/120,0,1);
          leaf.ex+=gust.dir*GUST*ramp*dt;
          leaf.ey-=(LIFT*(.6+.8*noise(leaf.id,25))*ramp+GROUND_LIFT*low+EDDY*Math.sin(this.time*2.1+noise(leaf.id,26)*Math.PI*2))*dt;
        }
        leaf.ex*=decay;leaf.ey*=decay;leaf.spin*=spinDecay;
        leaf.vx=(breeze+wind+glide)*speedScale+leaf.ex;leaf.vy=sink*speedScale+leaf.ey;
        leaf.x+=leaf.vx*dt;leaf.y+=leaf.vy*dt;
        let angle:number;
        if(leaf.fall==='tumble')angle=leaf.angle+.9*dt;
        else if(leaf.whirl)angle=leaf.angle+leaf.whirl*dt;
        // Gliders bank into each swing; a swooper banks harder.
        else angle=leaf.angle+((leaf.fall==='swoop'?1.4:1)*leaf.tilt*Math.sin(leaf.phase)-leaf.angle)*(1-Math.exp(-6*dt));
        leaf.angle=angle+leaf.spin*dt;
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
    if(this.waning&&!waning){
      this.waning=false;
      // Leaves of the kept season that lay on faded ones now drop into the gaps.
      if(this.thawed){this.thawed=false;this.restack(false);}
    }
    if(gust&&(!this.count||gust.time>7)){
      this.clear();this.cycle++;
      if(!gust.cleared)return 'cleared';
      return;
    }
    if(gust&&!gust.cleared&&this.count<=gust.total*CLEARED){gust.cleared=true;return 'cleared';}
    if(!gust&&this.full())return 'full';
  }
  /** Removes every leaf, as when motion is reduced. */
  clear(){
    for(const leaf of [...this.leaves,...this.pile])this.pool.push(leaf);
    this.leaves.length=0;this.pile.length=0;this.clearing=undefined;this.waning=false;this.thawed=false;this.restack(false);
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
    const [from,to]=this.columns(leaf.x,leaf.half);
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
