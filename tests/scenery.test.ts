import {describe,it,expect} from 'vitest';
import {seasonFrame} from '../src/domain/scenery';

describe('homepage chapter season progress',()=>{
  const stops=[0,1000,2400,3500];
  it('holds the chapter season until the next chapter approaches',()=>{
    expect(seasonFrame(500,stops,400)).toEqual({from:0,to:1,mix:0});
    expect(seasonFrame(1900,stops,400)).toEqual({from:1,to:2,mix:0});
  });
  it('uses distance through the boundary window in either scroll direction',()=>{
    const positions=[600,700,800,900,1000,900,800,700,600];
    expect(positions.map(y=>seasonFrame(y,stops,400).mix)).toEqual([0,.25,.5,.75,0,.75,.5,.25,0]);
    expect(seasonFrame(1000,stops,400)).toEqual({from:1,to:2,mix:0});
  });
  it('keeps a hold region even when adjacent chapter stops are close',()=>{
    expect(seasonFrame(40,[0,100,200,300],400).mix).toBe(0);
    expect(seasonFrame(75,[0,100,200,300],400).mix).toBe(.5);
    expect(seasonFrame(900,stops,0).mix).toBe(0);
    expect(seasonFrame(4000,stops,400)).toEqual({from:3,to:3,mix:0});
  });
});
