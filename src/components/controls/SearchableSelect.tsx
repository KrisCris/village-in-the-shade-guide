import { Children, isValidElement, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { normalizeSearch } from '../../data/clientSearch';

/** Keeps option markup at call sites, but search and selection share one popup. */
export default function SearchableSelect({id, value, onChange, children}: {
  id?: string; value: string | number; children: ReactNode;
  onChange: (event: {target: {value: string}}) => void;
}) {
  const generatedId=useId();
  const listId=`${id ?? generatedId}-options`;
  const trigger=useRef<HTMLButtonElement>(null);
  const popup=useRef<HTMLDivElement>(null);
  const input=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [active,setActive]=useState(0);
  const [label,setLabel]=useState('');
  const [position,setPosition]=useState({left:0,top:0,width:240,maxHeight:320});
  const [phonetics,setPhonetics]=useState<Record<string,string>>({});
  const options=useMemo(()=>Children.toArray(children).flatMap(child=>{
    if(!isValidElement<{value:string|number; children:ReactNode}>(child)) return [];
    return [{value:String(child.props.value),label:Children.toArray(child.props.children).join('')}];
  }),[children]);
  const filtered=options.filter(option=>normalizeSearch(`${option.label} ${option.value} ${phonetics[option.value]??''}`).includes(normalizeSearch(query)));
  const selected=options.find(option=>option.value===String(value));
  const close=(restore=false)=>{setOpen(false);if(restore)trigger.current?.focus();};
  const choose=(next:string)=>{onChange({target:{value:next}});close(true);};
  useEffect(()=>{
    const element=trigger.current;
    const parent=element?.closest('label');
    setLabel(parent?.firstChild?.textContent ?? (id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : '') ?? '选择');
  },[id]);
  useEffect(()=>{
    if(!open)return;
    let disposed=false;
    import('pinyin-pro').then(({pinyin})=>{
      if(!disposed)setPhonetics(Object.fromEntries(options.map(option=>[option.value,`${pinyin(option.label,{toneType:'none'}).replace(/\s/g,'')} ${pinyin(option.label,{pattern:'first',toneType:'none'}).replace(/\s/g,'')}`])));
    }).catch(()=>{/* Name filtering still works if the optional phonetic chunk cannot load. */});
    return ()=>{disposed=true;};
  },[open,options]);
  useEffect(()=>{
    if(!open)return;
    const place=()=>{
      const rect=trigger.current!.getBoundingClientRect();
      const width=Math.min(Math.max(rect.width,240),window.innerWidth-16);
      const below=window.innerHeight-rect.bottom-12;
      const useBelow=below>=Math.min(240,rect.top-12);
      const height=Math.max(80,Math.min(320,useBelow?below:rect.top-12));
      setPosition({left:Math.max(8,Math.min(rect.left,window.innerWidth-width-8)),top:useBelow?rect.bottom+4:Math.max(8,rect.top-height-4),width,maxHeight:height});
    };
    place();input.current?.focus();
    const outside=(event:PointerEvent)=>{if(!popup.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))close();};
    window.addEventListener('resize',place);
    window.addEventListener('scroll',place,true);
    document.addEventListener('pointerdown',outside);
    return ()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);document.removeEventListener('pointerdown',outside);};
  },[open]);
  useEffect(()=>{popup.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({block:'nearest'});},[active]);
  return <>
    <button id={id} ref={trigger} type="button" className="search-select-trigger" aria-label={label || undefined} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?listId:undefined}
      onClick={()=>{setQuery('');setActive(0);setOpen(!open);}} onKeyDown={event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setQuery('');setActive(0);setOpen(true);}}}>
      <span>{selected?.label ?? '选择'}</span><span aria-hidden="true">⌄</span>
    </button>
    {open&&createPortal(<div ref={popup} className="search-select-popup" style={{position:'fixed',...position}} onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
      if(event.key==='Tab'){
        event.preventDefault();
        const targets=[...document.querySelectorAll<HTMLElement>('a[href],button,input,[tabindex="0"]')].filter(element=>element.getClientRects().length&&!popup.current?.contains(element)&&!element.hasAttribute('disabled'));
        const next=targets[targets.indexOf(trigger.current!)+(event.shiftKey?-1:1)];
        close();(next??trigger.current)?.focus();
      }
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setActive(index=>Math.max(0,Math.min(filtered.length-1,index+(event.key==='ArrowDown'?1:-1))));}
      if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();if(filtered[active])choose(filtered[active].value);}
    }}>
      <input ref={input} type="search" role="combobox" aria-label={`搜索${label}`} aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={filtered[active]?`${listId}-${active}`:undefined} placeholder="搜索名称或拼音" value={query} onChange={event=>{setQuery(event.target.value);setActive(0);}}/>
      <div id={listId} role="listbox" aria-label={label} className="search-select-options">{filtered.map((option,index)=><div key={option.value} id={`${listId}-${index}`} data-index={index} role="option" aria-selected={option.value===String(value)} className={active===index?'active':''} onPointerMove={()=>setActive(index)} onClick={()=>choose(option.value)}>{option.label}{option.value===String(value)&&<span aria-hidden="true"> ✓</span>}</div>)}{!filtered.length&&<p role="status">无匹配选项</p>}</div>
    </div>,document.body)}
    <style>{`.search-select-trigger{display:flex;justify-content:space-between;align-items:center;gap:1rem;min-height:42px;min-width:5rem;width:100%;padding:.55rem .7rem;border:1px solid var(--border);border-radius:8px;background:var(--paper-raised);color:var(--ink);font:inherit;text-align:left;cursor:pointer}.search-select-popup{z-index:100;display:flex;flex-direction:column;box-sizing:border-box;padding:.4rem;background:var(--paper-raised);color:var(--ink);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 28px #0006}.search-select-popup input{box-sizing:border-box;flex:none;width:100%;min-width:0;padding:.6rem;border:1px solid var(--border);border-radius:6px;background:var(--paper);color:var(--ink);font:inherit}.search-select-options{overflow-y:auto;overscroll-behavior:contain;min-height:0;margin-top:.3rem}.search-select-options [role=option]{padding:.55rem .6rem;border-radius:5px;cursor:pointer}.search-select-options .active{background:var(--green-soft)}.search-select-options [aria-selected=true]{color:var(--green);font-weight:700}.search-select-options p{padding:.4rem;color:var(--muted)}`}</style>
  </>;
}
