/** Own page-local effects across Astro swaps; persisted players deliberately opt out. */
export function onPageMount(setup:()=>void|(()=>void),host:EventTarget&{body:object}=document){
  let body:object|undefined,cleanup:void|(()=>void);
  const unmount=()=>{cleanup?.();cleanup=undefined;body=undefined;};
  const mount=()=>{
    if(body===host.body)return;
    unmount();body=host.body;cleanup=setup();
  };
  host.addEventListener('astro:before-swap',unmount);
  host.addEventListener('astro:page-load',mount);
  mount();
  return()=>{
    unmount();host.removeEventListener('astro:before-swap',unmount);host.removeEventListener('astro:page-load',mount);
  };
}
