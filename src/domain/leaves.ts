export type Ledge={id:number;left:number;right:number;top:number};
export type Leaf={id:number;x:number;y:number;vx:number;vy:number;r:number;angle:number;season:number;resting:boolean;platform:number;dx:number;dy:number;support:number;cooldown:number};

/** Lightweight 2D leaf piles: finite pool, swept edge contacts and horizontal spatial bins. */
export class LeafWorld {
  active:Leaf[]=[];
  private pool:Leaf[]=[];
  private serial=0;
  private time=0;
  allocated=0;
  constructor(readonly capacity=800){}
  spawn(x:number,y:number,season:number):Leaf|undefined {
    if(this.active.length>=this.capacity)return;
    let leaf=this.pool.pop();
    if(!leaf){leaf={} as Leaf;this.allocated++;}
    Object.assign(leaf,{id:++this.serial,x,y,vx:Math.sin(this.serial*2.4)*12,vy:14,r:5+(this.serial%3),angle:this.serial*1.7,season,resting:false,platform:0,dx:0,dy:0,support:0,cooldown:0});
    this.active.push(leaf);return leaf;
  }
  sweep(x1:number,y1:number,x2:number,y2:number){
    const dx=x2-x1,dy=y2-y1,length=dx*dx+dy*dy;
    if(length<4)return;
    for(const leaf of this.active){
      const t=Math.max(0,Math.min(1,((leaf.x-x1)*dx+(leaf.y-y1)*dy)/length));
      if(Math.hypot(leaf.x-x1-t*dx,leaf.y-y1-t*dy)>leaf.r+13)continue;
      leaf.resting=false;leaf.support=0;leaf.cooldown=.5;
      leaf.vx=Math.max(-480,Math.min(480,dx*12));leaf.vy=Math.max(-130,Math.min(180,dy*8))-45;
    }
  }
  step(dt:number,width:number,height:number,ledges:Ledge[]){
    dt=Math.min(dt,1/30);
    this.time+=dt;
    const platforms=new Map(ledges.map(p=>[p.id,p]));
    const byId=new Map(this.active.map(l=>[l.id,l]));
    // Repeated passes are unnecessary: support loss propagates up a pile over successive frames.
    for(const leaf of this.active)if(leaf.resting){
      const p=platforms.get(leaf.platform),support=byId.get(leaf.support);
      if(!p || (leaf.support && !support?.resting) || leaf.dx<0 || p.left+leaf.dx>p.right){leaf.resting=false;leaf.support=0;leaf.cooldown=.1;}
      else{leaf.x=p.left+leaf.dx;leaf.y=p.top+leaf.dy;}
    }
    const bins=new Map<number,Leaf[]>();
    const add=(leaf:Leaf)=>{const key=Math.floor(leaf.x/24);const bin=bins.get(key);if(bin)bin.push(leaf);else bins.set(key,[leaf]);};
    for(const leaf of this.active)if(leaf.resting)add(leaf);
    for(const leaf of this.active){
      if(leaf.resting)continue;
      const oldBottom=leaf.y+leaf.r;
      leaf.cooldown=Math.max(0,leaf.cooldown-dt);
      // Different phases and periods avoid synchronized pendulums. Drag gradually
      // brings swept leaves back into the breeze instead of snapping their velocity.
      const phase=this.time*(.7+(leaf.id%7)*.035)+leaf.id*2.399;
      const breeze=Math.sin(phase)*22+Math.sin(this.time*.24+leaf.id)*7;
      leaf.vx+=(breeze-leaf.vx)*(1-Math.exp(-1.1*dt));
      const terminal=23+7*Math.cos(phase*2);
      leaf.vy+=(terminal-leaf.vy)*(1-Math.exp(-1.4*dt));
      leaf.x+=leaf.vx*dt;leaf.y+=leaf.vy*dt;
      const tilt=Math.sin(phase)*.7+Math.sin(phase*.47)*.3;
      leaf.angle+=(tilt-leaf.angle)*(1-Math.exp(-1.5*dt));
      if(leaf.vy<=0||leaf.cooldown>0)continue;
      let surface=Infinity,platform:Ledge|undefined,support:Leaf|undefined;
      for(const p of ledges){
        if(leaf.x+leaf.r>p.left && leaf.x-leaf.r<p.right && oldBottom<=p.top+1 && leaf.y+leaf.r>=p.top && p.top<surface){surface=p.top;platform=p;}
      }
      const key=Math.floor(leaf.x/24);
      for(let k=key-1;k<=key+1;k++)for(const other of bins.get(k)||[]){
        const distance=Math.abs(other.x-leaf.x),span=other.r+leaf.r;
        if(distance>=span*.88)continue;
        // Leaves are thin, overlapping plates rather than round balls.
        const top=other.y-Math.sqrt(span*span-distance*distance)*.16+leaf.r;
        if(oldBottom<=top+1 && leaf.y+leaf.r>=top && top<surface){surface=top;support=other;platform=platforms.get(other.platform);}
      }
      if(platform && surface!==Infinity){
        // Follow the local pile envelope downhill. Thin plates overlap, and a
        // shallow angle of repose prevents the single-contact towers of spheres.
        if(support){
          const floorAt=(x:number)=>{
            let y=platform!.top-leaf.r;
            const bin=Math.floor(x/24);
            for(let k=bin-1;k<=bin+1;k++)for(const other of bins.get(k)||[]){
              if(other.platform!==platform!.id)continue;
              const d=Math.abs(x-other.x),span=leaf.r+other.r;
              if(d<span*.88)y=Math.min(y,other.y-Math.sqrt(span*span-d*d)*.16);
            }
            return y;
          };
          const left=floorAt(leaf.x-8),right=floorAt(leaf.x+8);
          const direction=left===right?(leaf.id%2?1:-1):(left>right?-1:1);
          if(Math.max(left,right)-(surface-leaf.r)>2.4){
            leaf.y=surface-leaf.r;leaf.x+=direction*12*dt;
            leaf.vx=direction*12;leaf.vy=5;
            leaf.angle+=(direction*.25-leaf.angle)*.08;
            continue;
          }
        }
        leaf.y=surface-leaf.r;leaf.vx=0;leaf.vy=0;leaf.resting=true;
        leaf.platform=platform.id;leaf.dx=leaf.x-platform.left;leaf.dy=leaf.y-platform.top;leaf.support=support?.id||0;
        leaf.angle=Math.sin(leaf.id)*.4;add(leaf);
      }
    }
    let write=0;
    for(const leaf of this.active){
      if(leaf.y>height+40 || leaf.x < -60 || leaf.x>width+60)this.pool.push(leaf);
      else this.active[write++]=leaf;
    }
    this.active.length=write;
  }
}
