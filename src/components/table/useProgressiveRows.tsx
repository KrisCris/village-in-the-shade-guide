import {useEffect,useRef,useState} from 'react';

export function useProgressiveRows<T>(rows:T[],batch=50,resetKey:unknown=rows) {
  const [range,setRange]=useState({key:resetKey,count:batch});
  const count=range.key===resetKey?range.count:batch;
  const sentinel=useRef<HTMLDivElement>(null);
  const more=count<rows.length;
  const loadMore=()=>setRange({key:resetKey,count:Math.min(count+batch,rows.length)});
  useEffect(()=>{
    if(!more||!sentinel.current||!('IntersectionObserver' in window))return;
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){
        observer.disconnect();
        setRange({key:resetKey,count:Math.min(count+batch,rows.length)});
      }
    },{rootMargin:'400px'});
    observer.observe(sentinel.current);
    return ()=>observer.disconnect();
  },[rows,count,batch,more,resetKey]);
  return {visible:rows.slice(0,count),sentinel,more,loadMore};
}
