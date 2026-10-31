import {expect,it} from 'vitest';
import {LEAF_FRAME_MS,LeafWorld,particleViewport,shouldDrawLeaves} from './leaves';
const world=(width=400,height=300,capacity=800)=>{const w=new LeafWorld(capacity);w.resize(width,height);return w;};
const run=(w:LeafWorld,seconds:number,spawn?:()=>void)=>{
  let gust=0;
  for(let i=0;i<seconds*60;i++){if(spawn&&i%6===0)spawn();if(w.step(1/60))gust++;}
  return gust;
};
/** Drops a fixed number of leaves, well below a full drift, and lets them all settle. */
const drop=(w:LeafWorld,count:number,x:()=>number,season=1)=>{for(let i=0;i<count;i++){w.spawn(x(),700,season);run(w,.1);}run(w,15);};
it('glides from side to side and sinks slowly instead of falling like rain',()=>{
  const w=world(1000,1000);const leaf=w.spawn(500,0,1)!;let left=false,right=false,slowest=Infinity,fastest=0;
  for(let i=0;i<600;i++){w.step(1/60);left ||= leaf.vx < -2;right ||= leaf.vx > 2;slowest=Math.min(slowest,leaf.vy);fastest=Math.max(fastest,leaf.vy);}
  expect(left&&right).toBe(true);
  // Pendulum flutter: almost hanging at the ends of a swing, fastest through the middle.
  expect(fastest).toBeGreaterThan(slowest*3);
  expect(leaf.y).toBeGreaterThan(100);expect(leaf.y).toBeLessThan(450);
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
  expect(w.gusting).toBe(false);expect(w.leaves).toHaveLength(0);
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
  // A leaf can rest no higher than the leaves that landed under it before it.
  const grounded=()=>w.pile.every((leaf,index)=>leaf.support<=w.pile.slice(0,index).filter(other=>Math.abs(other.x-leaf.x)<other.half+leaf.half).reduce((sum,other)=>sum+other.thick,0)+.01);
  expect(grounded()).toBe(true);
  w.blow(440,799,480,799,.2);
  expect(w.pile.length).toBeLessThan(80);expect(grounded()).toBe(true);
  run(w,10);
  expect(grounded()).toBe(true);expect(w.leaves).toHaveLength(0);
});
it('ignores slow pointer movement',()=>{
  const w=world();const leaf=w.spawn(200,250,1)!;run(w,10);
  w.blow(150,296,250,296,2);
  expect(leaf.state).toBe('pile');
});
it('clears a full drift with one gust, then starts the next round',()=>{
  const w=world(200,300);
  let started=0;
  for(let i=0;i<60*400&&!started;i++){if(i%3===0)w.spawn(10+Math.random()*180,-16,0);if(w.step(1/60))started++;}
  expect(started).toBe(1);expect(w.gusting).toBe(true);
  expect(w.spawn(100,-16,1)).toBeUndefined();
  expect(run(w,8)).toBe(0);
  expect(w.gusting).toBe(false);expect(w.count).toBe(0);expect(w.cycle).toBe(1);
  expect(w.spawn(100,-16,1)).toBeDefined();
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
