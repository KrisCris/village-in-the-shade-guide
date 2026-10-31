type Root=Pick<HTMLElement,'dataset'|'hasAttribute'>;
type Crossfade={finished:Promise<unknown>;skipTransition():void};
type Host={documentElement:Root;startViewTransition?:(update:()=>void)=>Crossfade};
type Events=Pick<EventTarget,'addEventListener'|'removeEventListener'>;
const INPUTS=['wheel','touchstart','pointerdown','keydown','scroll'];

/**
 * Season and theme changes swap every palette token. Transitioning the tokens restyles and repaints the whole
 * page on every frame of the fade; one View Transition crossfades two snapshots on the compositor instead.
 */
export function crossfadeRoot(apply:()=>void,host:Host=document,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,events:Events=window){
  const root=host.documentElement;
  // The ClientRouter owns view transitions while it navigates, and a running crossfade already covers this change.
  if(!host.startViewTransition||reduced||root.hasAttribute('data-astro-transition')||'seasonSwap' in root.dataset){apply();return;}
  root.dataset.seasonSwap='';
  const transition=host.startViewTransition.call(host,apply);
  // Any input finishes the fade at once, so a still snapshot never covers a page that is scrolling or being used.
  const skip=()=>transition.skipTransition();
  for(const type of INPUTS)events.addEventListener(type,skip,{capture:true,passive:true});
  const done=()=>{delete root.dataset.seasonSwap;for(const type of INPUTS)events.removeEventListener(type,skip,{capture:true});};
  transition.finished.then(done,done);
}
