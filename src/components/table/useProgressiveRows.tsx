import {useEffect,useRef,useState} from 'react';

export function useProgressiveRows<T>(rows:T[],batch=50) {
  const [range,setRange]=useState({rows,count:batch});
  const count=range.rows===rows?range.count:batch;
  const sentinel=useRef<HTMLDivElement>(null);
  const more=count<rows.length;
  const loadMore=()=>setRange({rows,count:Math.min(count+batch,rows.length)});
  useEffect(()=>{
    if(!more||!sentinel.current||!('IntersectionObserver' in window))return;
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){
        observer.disconnect();
        setRange({rows,count:Math.min(count+batch,rows.length)});
      }
    },{rootMargin:'400px'});
    observer.observe(sentinel.current);
    return ()=>observer.disconnect();
  },[rows,count,batch,more]);
  return {visible:rows.slice(0,count),sentinel,more,loadMore};
}
