import { expect, it } from 'vitest';
import { checkCoverage } from './coverage.mjs';

it('reports unmapped sources and invalid targets together', () => {
  const report = checkCoverage([{ sourceId: 'a' }, { sourceId: 'b' }], [{ sourceId: 'a', targets: ['broken'] }]);
  expect(report.unmappedSources).toEqual(['b']);
  expect(report.invalidTargets).toEqual(['a']);
});
