import {describe,it,expect} from 'vitest';
import {seasonFrame,resolveTheme} from './scenery';

describe('decorative scenery state',()=>{
  it('blends neighboring seasons without moving beyond spring or winter',()=>{
    expect(seasonFrame(-10,[0,100,200,300])).toEqual({from:0,to:1,mix:0});
    expect(seasonFrame(150,[0,100,200,300])).toEqual({from:1,to:2,mix:0});
    expect(seasonFrame(175,[0,100,200,300])).toEqual({from:1,to:2,mix:.5});
    expect(seasonFrame(999,[0,100,200,300])).toEqual({from:3,to:3,mix:0});
  });
  it('handles collapsed sections without dividing by zero',()=>{
    expect(seasonFrame(0,[0,0,0,0])).toEqual({from:3,to:3,mix:0});
  });
  it('respects a saved day/night preference before the system preference',()=>{
    expect(resolveTheme('day',true)).toBe('day');
    expect(resolveTheme('night',false)).toBe('night');
    expect(resolveTheme('invalid',true)).toBe('night');
    expect(resolveTheme(null,false)).toBe('day');
  });
});
