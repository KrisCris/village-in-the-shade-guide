import {describe,expect,it} from 'vitest';
import {revealOffset,sectionOpen} from './sidebarNav';

describe('sectionOpen',()=>{
  const none=new Set<string>();
  it('keeps other sections open on the wide sidebar',()=>{
    expect(['database','planner','guides'].map(id=>sectionOpen(id,{current:'guides',folded:none,compact:false}))).toEqual([true,true,true]);
  });
  it('keeps sections the reader folded closed',()=>{
    expect(sectionOpen('database',{current:'guides',folded:new Set(['database']),compact:false})).toBe(false);
  });
  it('always opens the section holding the current page',()=>{
    expect(sectionOpen('guides',{current:'guides',folded:new Set(['guides']),compact:false})).toBe(true);
  });
  it('opens only the current section in the phone menu',()=>{
    expect(['database','planner','guides'].map(id=>sectionOpen(id,{current:'planner',folded:none,compact:true}))).toEqual([false,true,false]);
  });
  it('opens everything in the phone menu on pages outside all sections',()=>{
    expect(sectionOpen('database',{folded:none,compact:true})).toBe(true);
  });
});

describe('revealOffset',()=>{
  it('leaves the list alone when the link is fully visible',()=>{
    expect(revealOffset(200,600,300,40)).toBe(200);
  });
  it('scrolls a link below the fold a third of the way down',()=>{
    expect(revealOffset(0,600,1000,40)).toBe(800);
  });
  it('scrolls a link above the visible part back into view',()=>{
    expect(revealOffset(900,600,500,40)).toBe(300);
  });
  it('scrolls a link clipped at the bottom edge',()=>{
    expect(revealOffset(0,600,580,40)).toBe(380);
  });
  it('never scrolls above the top',()=>{
    expect(revealOffset(400,600,100,40)).toBe(0);
  });
});
