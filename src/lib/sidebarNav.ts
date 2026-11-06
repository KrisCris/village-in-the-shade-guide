import type {TransitionBeforeSwapEvent} from 'astro:transitions/client';

/** Below this width the sidebar is a menu button over a plain list with no scrolling of its own. */
export const COMPACT_QUERY='(max-width: 800px)';
const NAV_ID='sidebar-links';

interface SectionState{current?:string;folded:ReadonlySet<string>;compact:boolean}
/**
 * Whether a sidebar section is open. The wide sidebar keeps every section open, except the ones
 * the reader folded, and scrolls to the current page; the phone menu opens only the current
 * section. The section holding the current page always opens.
 */
export function sectionOpen(id:string,{current,folded,compact}:SectionState){
  if(id===current)return true;
  return compact?!current:!folded.has(id);
}

/** Scroll offset that shows a link in a scrolling list: unchanged when it is fully visible, otherwise a third of the way down. */
export function revealOffset(scrollTop:number,clientHeight:number,top:number,height:number){
  if(top>=scrollTop&&top+height<=scrollTop+clientHeight)return scrollTop;
  return Math.max(0,top-clientHeight/3);
}

const sectionsOf=(nav:Element)=>[...nav.querySelectorAll<HTMLDetailsElement>('details[data-section]')];
function applySections(nav:HTMLElement,folded:ReadonlySet<string>,compact:boolean){
  const current=nav.dataset.section||undefined;
  for(const details of sectionsOf(nav))details.open=sectionOpen(details.dataset.section!,{current,folded,compact});
}
function revealCurrentLink(nav:HTMLElement){
  const link=nav.querySelector<HTMLElement>('a[aria-current="page"]');
  if(!link||nav.scrollHeight<=nav.clientHeight)return;
  const top=link.getBoundingClientRect().top-nav.getBoundingClientRect().top-nav.clientTop+nav.scrollTop;
  nav.scrollTop=revealOffset(nav.scrollTop,nav.clientHeight,top,link.offsetHeight);
}

/** Every section renders open; fold the phone menu down to the current section and bring the current link into view. */
export function prepareSidebar(host:Document=document){
  const nav=host.getElementById(NAV_ID);
  if(!nav)return;
  if(matchMedia(COMPACT_QUERY).matches)applySections(nav,new Set(),true);
  revealCurrentLink(nav);
}

/** Navigation swaps in a fresh sidebar; keep the sections the reader folded and the list's scroll position, then show the new page's link. */
export function keepSidebarAcrossSwaps(host:Document=document){
  let scrollTop:number|undefined;
  const beforeSwap=(event:Event)=>{
    const from=host.getElementById(NAV_ID),to=(event as TransitionBeforeSwapEvent).newDocument.getElementById(NAV_ID);
    scrollTop=from?.scrollTop;
    if(!to)return;
    const folded=new Set(from?sectionsOf(from).filter(details=>!details.open).map(details=>details.dataset.section!):[]);
    applySections(to,folded,matchMedia(COMPACT_QUERY).matches);
  };
  // After the swap and before the view transition captures the new page, so the list never flashes back to the top.
  const afterSwap=()=>{
    const nav=host.getElementById(NAV_ID);
    if(nav&&scrollTop!==undefined)nav.scrollTop=scrollTop;
    scrollTop=undefined;
    if(nav)revealCurrentLink(nav);
  };
  host.addEventListener('astro:before-swap',beforeSwap);
  host.addEventListener('astro:after-swap',afterSwap);
  return()=>{
    host.removeEventListener('astro:before-swap',beforeSwap);
    host.removeEventListener('astro:after-swap',afterSwap);
  };
}
