import {expect,it} from 'vitest';
import {parseSeason} from './seasonPreference';
it('accepts only the four fixed seasons and defaults to automatic',()=>{
  for(const season of ['spring','summer','autumn','winter'])expect(parseSeason(season)).toBe(season);
  for(const invalid of [null,undefined,'auto','bad','',0])expect(parseSeason(invalid)).toBe('auto');
});
