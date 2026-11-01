import {expect,it,vi} from 'vitest';
import {crossfadeRoot} from './rootCrossfade';
const setup=(attributes:string[]=[])=>{
  const dataset:Record<string,string>={};
  const root={dataset,hasAttribute:(name:string)=>attributes.includes(name)} as unknown as HTMLElement;
  let finish=()=>{};
  const skipTransition=vi.fn();
  const startViewTransition=vi.fn((update:()=>void)=>{update();return {finished:new Promise<void>(resolve=>{finish=resolve;}),skipTransition};});
  const listeners=new Map<string,()=>void>();
  const events={addEventListener:(type:string,fn:()=>void)=>listeners.set(type,fn),removeEventListener:(type:string)=>listeners.delete(type)} as unknown as EventTarget;
  return {dataset,root,startViewTransition,skipTransition,listeners,events,finish:()=>finish()};
};
it('crossfades once and disables token transitions until the fade ends',async()=>{
  const s=setup();const apply=vi.fn();
  crossfadeRoot(apply,{documentElement:s.root,startViewTransition:s.startViewTransition},false,s.events);
  expect(apply).toHaveBeenCalledOnce();expect(s.startViewTransition).toHaveBeenCalledOnce();
  expect('seasonSwap' in s.dataset).toBe(true);expect(s.listeners.size).toBeGreaterThan(0);
  s.finish();await Promise.resolve();await Promise.resolve();
  expect('seasonSwap' in s.dataset).toBe(false);expect(s.listeners.size).toBe(0);
});
it('lets input skip the fade',()=>{
  const s=setup();
  crossfadeRoot(()=>{},{documentElement:s.root,startViewTransition:s.startViewTransition},false,s.events);
  s.listeners.get('wheel')!();expect(s.skipTransition).toHaveBeenCalledOnce();
});
it('applies directly without View Transitions, with reduced motion, during navigation or inside another fade',()=>{
  const cases=[
    {s:setup(),vt:false,reduced:false},
    {s:setup(),vt:true,reduced:true},
    {s:setup(['data-astro-transition']),vt:true,reduced:false},
  ];
  const nested=setup();nested.dataset.seasonSwap='';cases.push({s:nested,vt:true,reduced:false});
  for(const {s,vt,reduced} of cases){
    const apply=vi.fn();
    crossfadeRoot(apply,{documentElement:s.root,startViewTransition:vt?s.startViewTransition:undefined},reduced,s.events);
    expect(apply).toHaveBeenCalledOnce();expect(s.startViewTransition).not.toHaveBeenCalled();
  }
});
