import {expect,it} from 'vitest';
import {LeafWorld} from './leaves';
const ledge={id:1,left:0,right:300,top:200};
const advance=(world:LeafWorld,seconds=1)=>{for(let i=0;i<seconds*60;i++)world.step(1/60,400,500,[ledge]);};
it('lands on the element edge without stacking on other particles',()=>{
  const w=new LeafWorld(800);const a=w.spawn(120,190,0)!;a.vx=0;advance(w);
  expect(a.resting).toBe(true);expect(a.y).toBeLessThan(200);
  const b=w.spawn(a.x,190,0)!;b.vx=0;advance(w);
  expect(b.resting).toBe(true);expect(b.y+b.r).toBeCloseTo(200);
});
it('drifts back and forth slowly rather than falling like rain',()=>{
  const w=new LeafWorld();const leaf=w.spawn(200,0,0)!;let left=false,right=false;
  for(let i=0;i<600;i++){w.step(1/60,1000,1000,[]);left ||= leaf.vx < -2;right ||= leaf.vx > 2;}
  expect(left&&right).toBe(true);expect(leaf.y).toBeLessThan(350);
});
it('releases a resting particle without fading before a bottom exit',()=>{
  const w=new LeafWorld();const a=w.spawn(120,190,0)!;advance(w);
  expect(a.opacity).toBe(1);
  advance(w,3);expect(a.opacity).toBe(1);expect(a.resting).toBe(false);
  advance(w,20);expect(w.active).toHaveLength(0);
  const b=w.spawn(120,190,2)!;expect(w.allocated).toBe(1);expect(b.opacity).toBe(1);expect(b.season).toBe(2);
});
it('stops spawning on the first exit and advances only when the entire round clears',()=>{
  const w=new LeafWorld();w.spawn(100,700,0);const old=w.spawn(200,0,0)!;
  expect(w.step(1/60,400,500,[])).toBeUndefined();
  expect(w.spawn(100,0,0)).toBeUndefined();
  old.y=700;expect(w.step(1/60,400,500,[])).toBe(1);
  expect(w.step(1/60,400,500,[])).toBeUndefined();
  w.spawn(100,700,1);expect(w.step(1/60,400,500,[])).toBe(2);
});
it('requires strictly more than half to exit before oldest-first fading',()=>{
  const w=new LeafWorld();const leaves=Array.from({length:6},(_,i)=>w.spawn(80+i*30,0,0)!);
  leaves[0].y=700;w.step(1/60,400,500,[]);
  leaves[1].y=700;leaves[2].y=700;w.step(1/60,400,500,[]);
  for(let i=0;i<120;i++)w.step(1/60,400,500,[]);
  expect(leaves[3].opacity).toBe(1);expect(leaves[4].opacity).toBe(1);
  leaves[3].y=700;w.step(1/60,400,500,[]);
  for(let i=0;i<8;i++)w.step(1/60,400,500,[]);
  expect(leaves[4].opacity).toBeLessThan(1);expect(leaves[5].opacity).toBe(1);
});
it('sweeps a pile free without intercepting a DOM event',()=>{
  const w=new LeafWorld(800);const a=w.spawn(120,190,0)!;a.vx=0;advance(w);
  w.sweep(80,a.y,160,a.y);expect(a.resting).toBe(false);expect(a.vx).toBeGreaterThan(0);
});
it('caps allocation and reuses leaves that fall off screen',()=>{
  const w=new LeafWorld(800);for(let i=0;i<800;i++)w.spawn(10,700,0);
  expect(w.spawn(10,0,0)).toBeUndefined();w.step(1/60,400,500,[]);
  expect(w.active.length).toBe(0);expect(w.spawn(10,0,0)).toBeDefined();expect(w.allocated).toBe(800);
});
it('moves settled leaves with their supporting platform and releases missing support',()=>{
  const w=new LeafWorld(800);const a=w.spawn(120,190,0)!;a.vx=0;advance(w);const y=a.y;
  w.step(1/60,400,500,[{...ledge,top:100}]);expect(a.y).toBeCloseTo(y-100);
  w.step(1/60,400,500,[]);expect(a.resting).toBe(false);
});
it('keeps old-season particles alive alongside new-season particles',()=>{
  const w=new LeafWorld();const a=w.spawn(120,0,0)!;
  const b=w.spawn(200,0,2)!;
  for(let i=0;i<60;i++)w.step(1/60,400,500,[]);
  expect(a.season).toBe(0);expect(a.opacity).toBe(1);expect(b.season).toBe(2);
  for(let i=0;i<180;i++)w.step(1/60,400,500,[]);
  expect(w.active).toHaveLength(2);expect(a.opacity).toBe(1);
});
