import {describe,it,expect} from 'vitest';
import {onPageMount} from '../src/lib/pageLifecycle';

describe('page effects during client navigation',()=>{
  it('initializes once per body and cleans the old effect before the swap',()=>{
    const host=Object.assign(new EventTarget(),{body:{}});
    let active=0,mounts=0;
    const dispose=onPageMount(()=>{active++;mounts++;return()=>{active--;};},host);
    expect([active,mounts]).toEqual([1,1]);
    host.dispatchEvent(new Event('astro:page-load'));
    expect([active,mounts]).toEqual([1,1]);
    host.dispatchEvent(new Event('astro:before-swap'));
    expect(active).toBe(0);
    host.body={};host.dispatchEvent(new Event('astro:page-load'));
    expect([active,mounts]).toEqual([1,2]);
    dispose();expect(active).toBe(0);
    host.body={};host.dispatchEvent(new Event('astro:page-load'));
    expect(mounts).toBe(2);
  });
  it('checks again on a later page when the current page has no matching component',()=>{
    const host=Object.assign(new EventTarget(),{body:{}});
    let hasComponent=false,active=0;
    const dispose=onPageMount(()=>{
      if(!hasComponent)return;
      active++;return()=>{active--;};
    },host);
    expect(active).toBe(0);
    host.dispatchEvent(new Event('astro:before-swap'));host.body={};hasComponent=true;
    host.dispatchEvent(new Event('astro:page-load'));expect(active).toBe(1);
    dispose();expect(active).toBe(0);
  });
});
