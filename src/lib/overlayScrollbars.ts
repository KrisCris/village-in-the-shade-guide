/** Thin translucent scroll thumbs drawn over the content, so scrollbars take no room and only show while scrolling or when the pointer nears the edge. */
export const OVERLAY_QUERY='(hover: hover) and (pointer: fine)';
const MIN_THUMB=28,INSET=2,EDGE=14,IDLE_MS=900;

type Axis='x'|'y';
interface Geometry{size:number;offset:number}

/** Thumb length and offset along a track; null when nothing overflows. */
export function thumbGeometry(position:number,scrollSize:number,clientSize:number,track:number,min=MIN_THUMB):Geometry|null{
  const range=scrollSize-clientSize;
  if(range<1||track<=0)return null;
  const size=Math.min(track,Math.max(min,track*clientSize/scrollSize));
  const ratio=Math.min(1,Math.max(0,position/range));
  return {size,offset:(track-size)*ratio};
}
/** Scroll position after dragging the thumb by `delta` pixels. */
export function dragScroll(start:number,delta:number,scrollSize:number,clientSize:number,track:number,thumb:number){
  const range=scrollSize-clientSize,travel=track-thumb;
  if(range<=0||travel<=0)return start;
  return Math.min(range,Math.max(0,start+delta*range/travel));
}

interface Bar{el:Element;axis:Axis;thumb:HTMLElement;timer:number;origin:{x:number;y:number};dragging:boolean;hovered:boolean}

const scrolls=(style:string)=>style==='auto'||style==='scroll';
function overflows(el:Element,axis:Axis,root:Element){
  if(axis==='y'?el.scrollHeight-el.clientHeight<1:el.scrollWidth-el.clientWidth<1)return false;
  if(el===root)return true;
  const style=getComputedStyle(el);
  return scrolls(axis==='y'?style.overflowY:style.overflowX);
}
/** Visible box of a scroller in viewport coordinates; the root scroller fills the viewport. */
function box(el:Element,root:Element){
  if(el===root)return {left:0,top:0,right:innerWidth,bottom:innerHeight,width:innerWidth,height:innerHeight};
  const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
  const left=rect.left+parseFloat(style.borderLeftWidth),top=rect.top+parseFloat(style.borderTopWidth);
  return {left,top,right:left+el.clientWidth,bottom:top+el.clientHeight,width:el.clientWidth,height:el.clientHeight};
}

export function installOverlayScrollbars(host:Document=document){
  const media=matchMedia(OVERLAY_QUERY),root=host.scrollingElement??host.documentElement;
  const bars=new Map<string,Bar>(),keys=new WeakMap<Element,number>();
  let nextKey=0,frame=0;const pending=new Set<Bar>();
  const keyOf=(el:Element,axis:Axis)=>{let key=keys.get(el);if(key===undefined){key=nextKey++;keys.set(el,key);}return `${key}${axis}`;};

  const place=(bar:Bar)=>{
    const {el,axis,thumb}=bar;
    if(!el.isConnected){remove(bar);return;}
    const b=box(el,root),track=(axis==='y'?b.height:b.width)-INSET*2;
    const g=axis==='y'?thumbGeometry(el.scrollTop,el.scrollHeight,el.clientHeight,track):thumbGeometry(Math.abs(el.scrollLeft),el.scrollWidth,el.clientWidth,track);
    if(!g){thumb.classList.remove('is-visible');return;}
    const x=(axis==='y'?b.right-INSET:b.left+INSET+g.offset)-bar.origin.x,y=(axis==='y'?b.top+INSET+g.offset:b.bottom-INSET)-bar.origin.y;
    thumb.style.transform=`translate(${x}px,${y}px)`;
    thumb.style.setProperty('--thumb-size',`${g.size}px`);
  };
  const schedule=(bar:Bar)=>{pending.add(bar);frame||=requestAnimationFrame(()=>{frame=0;for(const b of pending)place(b);pending.clear();});};
  const hide=(bar:Bar)=>{clearTimeout(bar.timer);bar.timer=window.setTimeout(()=>{if(!bar.dragging&&!bar.hovered)bar.thumb.classList.remove('is-visible');},IDLE_MS);};
  const remove=(bar:Bar)=>{clearTimeout(bar.timer);bar.thumb.remove();bars.delete(keyOf(bar.el,bar.axis));};

  /** Modal dialogs and popovers sit in the top layer, so their thumbs must live inside them. */
  const hostFor=(el:Element)=>{
    try{return el.closest('dialog[open],:popover-open')??host.body;}catch{return el.closest('dialog[open]')??host.body;}
  };
  const measureOrigin=(bar:Bar)=>{
    const {style}=bar.thumb;
    style.transform=style.translate='none';
    const rect=bar.thumb.getBoundingClientRect();
    style.translate='';
    bar.origin={x:rect.left,y:rect.top};
  };
  const reveal=(el:Element,axis:Axis)=>{
    const key=keyOf(el,axis);let bar=bars.get(key);
    if(!bar){
      const thumb=host.createElement('div');
      thumb.className='overlay-scroll-thumb';thumb.dataset.axis=axis;thumb.setAttribute('aria-hidden','true');
      bar={el,axis,thumb,timer:0,origin:{x:0,y:0},dragging:false,hovered:false};
      bindDrag(bar);bars.set(key,bar);
    }
    const target=hostFor(el);
    const shown=bar.thumb.classList.contains('is-visible');
    if(bar.thumb.parentElement!==target)target.append(bar.thumb);
    // Re-measure whenever the thumb comes back, in case its dialog moved.
    if(!shown)measureOrigin(bar);
    place(bar);
    bar.thumb.classList.add('is-visible');
    hide(bar);
    return bar;
  };
  const bindDrag=(bar:Bar)=>{
    const {thumb,el,axis}=bar;
    thumb.addEventListener('pointerenter',()=>{bar.hovered=true;clearTimeout(bar.timer);});
    thumb.addEventListener('pointerleave',()=>{bar.hovered=false;hide(bar);});
    thumb.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      event.preventDefault();
      thumb.setPointerCapture(event.pointerId);
      bar.dragging=true;thumb.classList.add('is-dragging');
      const startPointer=axis==='y'?event.clientY:event.clientX,startScroll=axis==='y'?el.scrollTop:el.scrollLeft;
      const b=box(el,root),track=(axis==='y'?b.height:b.width)-INSET*2,size=axis==='y'?thumb.offsetHeight:thumb.offsetWidth;
      const scrollSize=axis==='y'?el.scrollHeight:el.scrollWidth,clientSize=axis==='y'?el.clientHeight:el.clientWidth;
      const move=(e:PointerEvent)=>{
        const next=dragScroll(Math.abs(startScroll),(axis==='y'?e.clientY:e.clientX)-startPointer,scrollSize,clientSize,track,size);
        // RTL scrollers count scrollLeft down from zero.
        el.scrollTo({[axis==='y'?'top':'left']:startScroll<0?-next:next,behavior:'instant'});
      };
      const end=()=>{
        bar.dragging=false;thumb.classList.remove('is-dragging');
        thumb.removeEventListener('pointermove',move);thumb.removeEventListener('pointerup',end);thumb.removeEventListener('pointercancel',end);
        hide(bar);
      };
      thumb.addEventListener('pointermove',move);thumb.addEventListener('pointerup',end);thumb.addEventListener('pointercancel',end);
    });
  };

  const onScroll=(event:Event)=>{
    const el=event.target instanceof Element?event.target:root;
    for(const axis of ['y','x'] as const){
      const bar=bars.get(keyOf(el,axis));
      if(bar?.thumb.isConnected&&bar.thumb.classList.contains('is-visible')){schedule(bar);hide(bar);}
      else if(overflows(el,axis,root))reveal(el,axis);
    }
  };
  /** Near a scroller's edge, show its thumb so it can be grabbed. */
  let lastMove=0;
  const onPointerMove=(event:PointerEvent)=>{
    if(event.pointerType!=='mouse'||event.buttons||event.timeStamp-lastMove<50)return;
    lastMove=event.timeStamp;
    if((event.target as Element|null)?.closest?.('.overlay-scroll-thumb'))return;
    let el=event.target instanceof Element?event.target:null;
    for(;el;el=el.parentElement){
      if(el===root||el===host.body)break;
      const checkY=overflows(el,'y',root),checkX=overflows(el,'x',root);
      if(!checkY&&!checkX)continue;
      const b=box(el,root);
      if(checkY&&event.clientX>=b.right-EDGE&&event.clientX<=b.right)reveal(el,'y');
      if(checkX&&event.clientY>=b.bottom-EDGE&&event.clientY<=b.bottom)reveal(el,'x');
    }
    if(event.clientX>=innerWidth-EDGE&&overflows(root,'y',root))reveal(root,'y');
  };
  const onResize=()=>{for(const bar of bars.values())if(bar.thumb.classList.contains('is-visible'))schedule(bar);};
  const onSwap=()=>{for(const bar of [...bars.values()])remove(bar);};

  let active=false;
  const toggle=()=>{
    const on=media.matches;
    if(on===active)return;active=on;
    host.documentElement.dataset.scrollbars=on?'overlay':'native';
    const method=on?'addEventListener':'removeEventListener';
    host[method]('scroll',onScroll,{capture:true,passive:true} as AddEventListenerOptions);
    host[method]('pointermove',onPointerMove as EventListener,{passive:true} as AddEventListenerOptions);
    host[method]('astro:before-swap',onSwap);
    window[method]('resize',onResize,{passive:true} as AddEventListenerOptions);
    if(!on)onSwap();
  };
  media.addEventListener('change',toggle);
  toggle();
}
