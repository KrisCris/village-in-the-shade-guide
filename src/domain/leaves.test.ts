import {expect,it} from 'vitest';
import {CLEARED,LEAF_FRAME_MS,LeafWorld,PACKED,packedLine,particleViewport,shouldDrawLeaves,type Leaf,type LeafEvent,type LeafFall} from './leaves';
const world=(width=400,height=300,capacity=800)=>{const w=new LeafWorld(capacity);w.resize(width,height);return w;};
/** Steps the world and lists what it reported. */
const run=(w:LeafWorld,seconds:number,spawn?:()=>void)=>{
  const events:LeafEvent[]=[];
  for(let i=0;i<seconds*60;i++){if(spawn&&i%6===0)spawn();const event=w.step(1/60);if(event)events.push(event);}
  return events;
};
/** Lets leaves of one season fall until the drift is full. */
const fill=(w:LeafWorld,season:number,width=200)=>{
  for(let i=0;i<60*400;i++){if(i%3===0)w.spawn(10+Math.random()*(width-20),-16,season);if(w.step(1/60)==='full')return true;}
  return false;
};
/** A leaf can rest no higher than the leaves that landed under it before it. */
const grounded=(w:LeafWorld)=>w.pile.every((leaf,index)=>leaf.support<=w.pile.slice(0,index).filter(other=>Math.abs(other.x-leaf.x)<other.half+leaf.half).reduce((sum,other)=>sum+other.thick,0)+.01);
/** Drops a fixed number of leaves, well below a full drift, and lets them all settle. */
const drop=(w:LeafWorld,count:number,x:()=>number,season=1)=>{for(let i=0;i<count;i++){w.spawn(x(),700,season);run(w,.1);}run(w,15);};
/** Spawns leaves into an empty world until one falls the given way. */
const spawnFalling=(w:LeafWorld,fall:LeafFall,season=1)=>{for(;;){const leaf=w.spawn(500,0,season)!;if(leaf.fall===fall)return leaf;w.clear();}};
it('glides from side to side and sinks slowly instead of falling like rain',()=>{
  const w=world(1000,1000);const leaf=spawnFalling(w,'glide');let left=false,right=false,slowest=Infinity,fastest=0;
  for(let i=0;i<600;i++){w.step(1/60);left ||= leaf.vx < -2;right ||= leaf.vx > 2;slowest=Math.min(slowest,leaf.vy);fastest=Math.max(fastest,leaf.vy);}
  expect(left&&right).toBe(true);
  // Pendulum flutter: almost hanging at the ends of a swing, fastest through the middle.
  expect(fastest).toBeGreaterThan(slowest*3);
  expect(leaf.y).toBeGreaterThan(150);expect(leaf.y).toBeLessThan(650);
});
it('varies the swing pace of each leaf over time instead of repeating one rhythm',()=>{
  const w=world(1000,4000);const leaf=spawnFalling(w,'glide');const rates:number[]=[];
  for(let second=0;second<20;second++){const start=leaf.phase;run(w,1);rates.push(leaf.phase-start);}
  expect(Math.max(...rates)/Math.min(...rates)).toBeGreaterThan(1.3);
});
it('falls in a mix of ways: gliding, swooping, tumbling, spinning and corkscrewing',()=>{
  const w=world(1000,1e6,2000);
  const leaves=Array.from({length:240},(_,i)=>w.spawn(100+i*3,0,i%2?2:0)!);
  const of=(fall:LeafFall)=>leaves.filter(leaf=>leaf.fall===fall);
  for(const fall of ['glide','swoop','tumble','spin','spiral'] as const)expect(of(fall).length).toBeGreaterThan(10);
  const start=new Map(leaves.map(leaf=>[leaf,leaf.angle])),climbed=new Set<Leaf>(),sinks=new Map<Leaf,number[]>();
  for(let i=0;i<20*60;i++){
    w.step(1/60);
    for(const leaf of leaves){if(leaf.vy<0)climbed.add(leaf);if(i>60)sinks.set(leaf,[Math.min(sinks.get(leaf)?.[0]??Infinity,leaf.vy),Math.max(sinks.get(leaf)?.[1]??0,leaf.vy)]);}
  }
  const turned=(leaf:Leaf)=>Math.abs(leaf.angle-start.get(leaf)!);
  // Spinners whirl round and round; gliders and swoopers only bank into their swings.
  expect(Math.min(...of('spin').map(turned))).toBeGreaterThan(30);
  expect(Math.max(...[...of('glide'),...of('swoop')].map(leaf=>Math.abs(leaf.angle)))).toBeLessThan(1.5);
  // Swoopers stall and rise a little at the end of each swing; nothing else climbs in still air.
  expect(of('swoop').every(leaf=>climbed.has(leaf))).toBe(true);
  expect(leaves.filter(leaf=>leaf.fall!=='swoop').some(leaf=>climbed.has(leaf))).toBe(false);
  // A corkscrew sinks steadily, unlike a pendulum glider.
  const ratio=(leaf:Leaf)=>sinks.get(leaf)![1]/sinks.get(leaf)![0];
  expect(Math.max(...of('spiral').map(ratio))).toBeLessThan(1.4);
  expect(Math.min(...of('glide').map(ratio))).toBeGreaterThan(1.5);
},15_000);
it('gives snow a gentle drift or a slow circle, each flake turning its own way',()=>{
  const w=world(1000,1e6,2000);
  const flakes=Array.from({length:200},(_,i)=>w.spawn(100+i*4,0,3)!);
  expect(new Set(flakes.map(flake=>flake.fall))).toEqual(new Set(['glide','spiral']));
  expect(flakes.some(flake=>flake.whirl<0)&&flakes.some(flake=>flake.whirl>0)).toBe(true);
  expect(flakes.every(flake=>Math.abs(flake.whirl)<1)).toBe(true);
});
it('lands on the bottom edge and lies flat in the drift',()=>{
  const w=world();const leaf=w.spawn(200,250,1)!;run(w,10);
  expect(leaf.state).toBe('pile');expect(w.pile).toContain(leaf);expect(w.leaves).not.toContain(leaf);
  expect(leaf.support).toBe(0);expect(leaf.y).toBeCloseTo(300-leaf.thick/2);
  expect(w.landed).toContain(leaf);
});
it('heaps leaves on top of each other and slides them off steep crests',()=>{
  const w=world(1000,800);
  drop(w,80,()=>500,2);
  expect(w.sweeping).toBe(false);expect(w.leaves).toHaveLength(0);
  const supported=w.pile.filter(leaf=>leaf.support>0);
  expect(supported.length).toBeGreaterThan(0);
  const xs=w.pile.map(leaf=>leaf.x);
  expect(Math.max(...xs)-Math.min(...xs)).toBeGreaterThan(40);
  // Stacked straight up, 80 leaves would stand ~290 px; sliding spreads them into a low mound.
  expect(Math.max(...w.pile.map(leaf=>leaf.support))).toBeLessThan(60);
});
it('a swipe along the drift blows settled leaves up and away',()=>{
  const w=world(1000,800);drop(w,80,()=>300+Math.random()*400);
  const before=w.pile.length;expect(before).toBe(80);
  w.blow(250,796,750,796,.1);
  expect(w.pile.length).toBeLessThan(before);
  const lifted=w.leaves.filter(leaf=>leaf.ey<0);
  expect(lifted.length).toBeGreaterThan(0);expect(lifted.every(leaf=>leaf.ex>0&&leaf.state==='air')).toBe(true);
  expect(w.pileChanged).toBe(true);
});
it('drops leaves whose support was blown away instead of leaving them hanging',()=>{
  const w=world(1000,800);drop(w,80,()=>450+Math.random()*100);
  expect(grounded(w)).toBe(true);
  w.blow(440,799,480,799,.2);
  expect(w.pile.length).toBeLessThan(80);expect(grounded(w)).toBe(true);
  run(w,10);
  expect(grounded(w)).toBe(true);expect(w.leaves).toHaveLength(0);
});
it('ignores slow pointer movement',()=>{
  const w=world();const leaf=w.spawn(200,250,1)!;run(w,10);
  w.blow(150,296,250,296,2);
  expect(leaf.state).toBe('pile');
});
it('asks for a sweep once the drift is full and keeps asking until it gets one',()=>{
  const w=world(200,300);
  expect(fill(w,0)).toBe(true);
  expect(w.sweeping).toBe(false);expect(w.step(1/60)).toBe('full');
});
it('clears a full drift with one gust, then starts the next round',()=>{
  const w=world(200,300);expect(fill(w,0)).toBe(true);
  w.sweep('gust');expect(w.sweeping).toBe(true);
  expect(w.spawn(100,-16,1)).toBeUndefined();
  expect(run(w,8)).toEqual(['cleared']);
  expect(w.sweeping).toBe(false);expect(w.count).toBe(0);expect(w.cycle).toBe(1);
  expect(w.spawn(100,-16,1)).toBeDefined();
});
it('reports the drift cleared only once the gust has carried most of it out of the window',()=>{
  const w=world(600,400);expect(fill(w,2,600)).toBe(true);
  const total=w.count;w.sweep('gust');
  let left=-1,lifted=false;
  for(let i=0;i<8*60&&left<0;i++)if(w.step(1/60)==='cleared'){left=w.count;lifted=!w.pile.length;}
  expect(left).toBeGreaterThanOrEqual(0);expect(left).toBeLessThanOrEqual(total*CLEARED);
  // Nothing is left lying in the drift when the season turns.
  expect(lifted).toBe(true);
},15_000);
it('lifts the drift up and away on a gust instead of sliding it along the ground',()=>{
  const w=world(900,600);expect(fill(w,2,900)).toBe(true);
  const drift=[...w.pile],highest=new Map(drift.map(leaf=>[leaf,leaf.y])),low=new Map<Leaf,number>();
  w.sweep('gust');
  while(w.sweeping){
    w.step(1/60);const flying=new Set(w.leaves);
    for(const leaf of drift)if(flying.has(leaf)){highest.set(leaf,Math.min(highest.get(leaf)!,leaf.y));if(leaf.y>600-12)low.set(leaf,(low.get(leaf)??0)+1/60);}
  }
  // Without the updraft half the drift rose less than 15 px and skidded out along the bottom edge.
  const rises=drift.map(leaf=>600-highest.get(leaf)!).sort((a,b)=>a-b);
  expect(rises[Math.floor(rises.length/2)]).toBeGreaterThan(120);expect(rises[Math.floor(rises.length*.1)]).toBeGreaterThan(30);
  expect(Math.max(0,...low.values())).toBeLessThan(.5);
},15_000);
it('in a thaw, lifts the loose snow away and melts the packed layer where it lies',()=>{
  const w=world(600,400);expect(fill(w,3,600)).toBe(true);
  const line=packedLine(w.pile);
  const packed=new Set(w.pile.filter(leaf=>leaf.support+leaf.thick<line)),loose=w.pile.filter(leaf=>!packed.has(leaf));
  // About half of it, lowest first.
  expect(packed.size).toBeGreaterThan(w.pile.length*(PACKED-.15));expect(packed.size).toBeLessThanOrEqual(w.pile.length*PACKED);
  w.sweep('thaw');
  expect(w.sweeping).toBe(true);expect(w.spawn(100,-16,0)).toBeUndefined();
  const flew=new Set<Leaf>(),melting=new Set<Leaf>();let cleared=-1,firstLift=-1,firstMelt=-1;
  for(let i=0;i<8*60&&w.sweeping;i++){
    if(w.step(1/60)==='cleared')cleared=i/60;
    for(const leaf of w.leaves)if(!flew.has(leaf)){flew.add(leaf);if(firstLift<0)firstLift=i;}
    for(const leaf of w.pile)if(leaf.life<1){melting.add(leaf);if(firstMelt<0)firstMelt=i;}
  }
  // The breeze takes the loose snow; the packed snow it uncovers stays put and melts.
  expect(loose.filter(leaf=>flew.has(leaf)).length).toBeGreaterThanOrEqual(loose.length*.95);
  expect([...packed].filter(leaf=>!flew.has(leaf)&&melting.has(leaf)).length).toBeGreaterThanOrEqual(packed.size*.9);
  expect(firstMelt).toBeGreaterThan(firstLift);
  expect(cleared).toBeGreaterThan(0);expect(cleared).toBeLessThan(5);
  expect(w.sweeping).toBe(false);expect(w.count).toBe(0);
  // Reused flakes come back whole.
  const fresh=w.spawn(100,-16,0)!;
  expect(fresh.life).toBe(1);expect(fresh.meltAt).toBe(Infinity);
},15_000);
it('fades leaves of another season when one is picked by hand, keeping the rest and new arrivals',()=>{
  const w=world(1000,800);
  drop(w,40,()=>300+Math.random()*400,2);drop(w,20,()=>300+Math.random()*400,3);
  const autumn=w.pile.filter(leaf=>leaf.season===2),airborne=w.spawn(500,200,2)!;
  w.fade(3);
  // The fade does not hold back the new season.
  const arrival=w.spawn(500,-16,3)!;expect(arrival).toBeDefined();
  expect(run(w,1.6)).toEqual([]);
  expect(autumn.some(leaf=>w.pile.includes(leaf))).toBe(false);
  expect(w.leaves.includes(airborne)).toBe(false);
  expect(arrival.life).toBe(1);expect(w.leaves).toContain(arrival);
  // Snow that lay on the faded leaves drops into the gaps.
  run(w,8);
  expect(w.pile.filter(leaf=>leaf.season===3)).toHaveLength(20);
  expect(w.pile.every(leaf=>leaf.season===3&&leaf.life===1)).toBe(true);expect(grounded(w)).toBe(true);
});
it('keeps the drift on the ground when the window resizes and drops leaves past a narrower edge',()=>{
  const w=world(1000,800);drop(w,60,()=>20+Math.random()*960);
  const count=w.pile.length,offset=w.pile.map(leaf=>leaf.y-800);
  w.resize(1000,900);
  expect(w.pile.map(leaf=>leaf.y-900)).toEqual(offset);
  w.resize(500,900);
  expect(w.pile.length).toBeLessThan(count);
  expect(w.pile.every(leaf=>leaf.x<=500+leaf.half)).toBe(true);
});
it('caps allocation and reuses leaves',()=>{
  const w=world(400,300,50);
  for(let i=0;i<50;i++)w.spawn(10+i*7,250,1);
  expect(w.spawn(10,0,0)).toBeUndefined();expect(w.allocated).toBe(50);
  w.clear();expect(w.count).toBe(0);
  expect(w.spawn(10,0,0)).toBeDefined();expect(w.allocated).toBe(50);
});
it('keeps old-season leaves in the drift alongside new ones',()=>{
  const w=world();const a=w.spawn(100,250,0)!;run(w,8);
  const b=w.spawn(300,250,2)!;run(w,8);
  expect(a.season).toBe(0);expect(b.season).toBe(2);expect(w.pile).toEqual(expect.arrayContaining([a,b]));
});
it('caps idle drawing near 60 Hz',()=>{
  expect(shouldDrawLeaves(6)).toBe(false);expect(shouldDrawLeaves(LEAF_FRAME_MS)).toBe(true);expect(shouldDrawLeaves(16.7)).toBe(true);
});
it('scales spawning with the window area within bounds',()=>{
  expect(particleViewport(1280,800).spawnRate).toBeCloseTo(1/.3);
  expect(particleViewport(100,100).spawnRate).toBe(.6);
  expect(particleViewport(8000,8000).spawnRate).toBe(10);
  expect(particleViewport(NaN,NaN)).toEqual(particleViewport(1280,800));
});
