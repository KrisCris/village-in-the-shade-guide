import {expect,it} from 'vitest';
import {LeafWorld} from './leaves';
const ledge={id:1,left:0,right:300,top:200};
const advance=(world:LeafWorld,seconds=12)=>{for(let i=0;i<seconds*60;i++)world.step(1/60,400,500,[ledge]);};
it('lands on an edge and stacks above an existing leaf',()=>{
  const w=new LeafWorld(800);const a=w.spawn(120,100,0)!;a.vx=0;advance(w);
  expect(a.resting).toBe(true);expect(a.y).toBeLessThan(200);
  const b=w.spawn(a.x,a.y-1,0)!;b.vx=0;advance(w);
  expect(b.resting).toBe(true);expect(b.y).toBeLessThan(a.y);
});
it('drifts back and forth slowly rather than falling like rain',()=>{
  const w=new LeafWorld();const leaf=w.spawn(200,0,0)!;let left=false,right=false;
  for(let i=0;i<600;i++){w.step(1/60,1000,1000,[]);left ||= leaf.vx < -2;right ||= leaf.vx > 2;}
  expect(left&&right).toBe(true);expect(leaf.y).toBeLessThan(350);
});
it('spreads a concentrated fall into a low mound instead of a tower',()=>{
  const w=new LeafWorld();
  for(let n=0;n<80;n++){w.spawn(150,150,0);advance(w,3);}
  advance(w,20);
  const pile=w.active.filter(l=>l.resting);
  expect(pile.length).toBeGreaterThan(50);
  expect(Math.max(...pile.map(l=>l.x))-Math.min(...pile.map(l=>l.x))).toBeGreaterThan(70);
  expect(200-Math.min(...pile.map(l=>l.y))).toBeLessThan(70);
});
it('sweeps a pile free without intercepting a DOM event',()=>{
  const w=new LeafWorld(800);const a=w.spawn(120,100,0)!;a.vx=0;advance(w);
  w.sweep(80,a.y,160,a.y);expect(a.resting).toBe(false);expect(a.vx).toBeGreaterThan(0);
});
it('caps allocation and reuses leaves that fall off screen',()=>{
  const w=new LeafWorld(800);for(let i=0;i<800;i++)w.spawn(10,700,0);
  expect(w.spawn(10,0,0)).toBeUndefined();w.step(1/60,400,500,[]);
  expect(w.active.length).toBe(0);expect(w.spawn(10,0,0)).toBeDefined();expect(w.allocated).toBe(800);
});
it('moves settled leaves with their supporting platform and releases missing support',()=>{
  const w=new LeafWorld(800);const a=w.spawn(120,100,0)!;a.vx=0;advance(w);const y=a.y;
  w.step(1/60,400,500,[{...ledge,top:100}]);expect(a.y).toBeCloseTo(y-100);
  w.step(1/60,400,500,[]);expect(a.resting).toBe(false);
});
