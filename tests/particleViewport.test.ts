import {it,expect} from 'vitest';
import {particleViewport,LeafWorld} from '../src/domain/leaves';

it('scales spawn rate with visible area, not document length',()=>{
  const desktop=particleViewport(1280,800),phone=particleViewport(428,926);
  expect(phone.spawnRate/desktop.spawnRate).toBeCloseTo(428*926/(1280*800));
  expect(particleViewport(1920,800).spawnRate/desktop.spawnRate).toBeCloseTo(1.5);
});
it('scales speed with viewport height while bounding extreme screens',()=>{
  expect(particleViewport(1280,1200).speedScale).toBeCloseTo(1.5);
  expect(particleViewport(10000,10000).spawnRate).toBeLessThanOrEqual(10);
  expect(particleViewport(10000,10000).speedScale).toBeLessThanOrEqual(2.2);
  expect(particleViewport(0,0).spawnRate).toBeGreaterThan(0);
});
it('covers the same fraction of a taller viewport without accelerating particle lifetimes',()=>{
  const small=new LeafWorld(),large=new LeafWorld();
  const a=small.spawn(100,0,0)!,b=large.spawn(100,0,0)!;
  for(let i=0;i<600;i++){
    small.step(1/60,1280,800,[],particleViewport(1280,800).speedScale);
    large.step(1/60,1280,1200,[],particleViewport(1280,1200).speedScale);
  }
  expect(Math.abs(a.y/800-b.y/1200)).toBeLessThan(.01);
  expect(a.opacity).toBe(1);expect(b.opacity).toBe(1);
});
