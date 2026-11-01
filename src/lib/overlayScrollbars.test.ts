import {describe,expect,it} from 'vitest';
import {dragScroll,thumbGeometry} from './overlayScrollbars';
describe('thumbGeometry',()=>{
  it('sizes the thumb by the visible share of the content',()=>{
    expect(thumbGeometry(0,2000,500,500)).toEqual({size:125,offset:0});
    expect(thumbGeometry(1500,2000,500,500)).toEqual({size:125,offset:375});
  });
  it('keeps a grabbable minimum on very long content',()=>{
    expect(thumbGeometry(0,100000,500,500,28)?.size).toBe(28);
  });
  it('clamps overscroll to the track',()=>{
    expect(thumbGeometry(-40,2000,500,500)?.offset).toBe(0);
    expect(thumbGeometry(1600,2000,500,500)?.offset).toBe(375);
  });
  it('returns null when nothing overflows',()=>{
    expect(thumbGeometry(0,500,500,500)).toBeNull();
    expect(thumbGeometry(0,800,500,0)).toBeNull();
  });
});
describe('dragScroll',()=>{
  it('maps thumb travel onto the scroll range',()=>{
    // Track 500, thumb 125: 375px of travel covers 1500px of scrolling.
    expect(dragScroll(0,75,2000,500,500,125)).toBe(300);
    expect(dragScroll(300,-75,2000,500,500,125)).toBe(0);
  });
  it('stops at both ends',()=>{
    expect(dragScroll(0,-50,2000,500,500,125)).toBe(0);
    expect(dragScroll(1400,999,2000,500,500,125)).toBe(1500);
  });
});
