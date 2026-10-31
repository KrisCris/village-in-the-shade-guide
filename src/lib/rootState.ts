import type {TransitionBeforeSwapEvent} from 'astro:transitions/client';
const KEPT=['season','seasonPreference','theme','particles'] as const;

/** The ClientRouter replaces every <html> attribute; keep the live season and preferences so a swap never restarts the loop or replays a fade. */
export function carryRootState(from:DOMStringMap,to:DOMStringMap){
  for(const key of KEPT){const value=from[key];if(value!==undefined)to[key]=value;}
}
export function keepRootStateAcrossSwaps(host:Document=document){
  host.addEventListener('astro:before-swap',event=>carryRootState(host.documentElement.dataset,(event as TransitionBeforeSwapEvent).newDocument.documentElement.dataset));
}
