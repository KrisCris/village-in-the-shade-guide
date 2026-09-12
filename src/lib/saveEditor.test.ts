import { hasPrivateSaveFixtures } from '../../tests/support/privateSaveFixtures';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeLz4Block, decodeSave, encodeLz4Block, encodeSave } from './saveEditor';

describe('YKCMP type-8 codec', () => {
  it('round-trips a block with literals, matches, and long extensions', () => {
    const source = new Uint8Array(120_000);
    for (let i = 0; i < source.length; i++) source[i] = (i % 97 === 0 ? 0x7f : i * 13) & 0xff;
    const packed = encodeLz4Block(source);
    expect(decodeLz4Block(packed, source.length)).toEqual(source);
    expect(packed.length).toBeLessThan(source.length);
  });

  it('leaves the block tail as literals so a strict decoder stays in bounds', () => {
    // A long run of one byte is the worst case: without the reserved tail the
    // encoder would emit a match that reaches the very end of the block.
    const source = new Uint8Array(4096).fill(0x42);
    const packed = encodeLz4Block(source);
    expect(decodeLz4Block(packed, source.length)).toEqual(source);
    let cursor = 0;
    let lastLiteralRun = -1;
    while (cursor < packed.length) {
      const token = packed[cursor++];
      let literals = token >>> 4;
      if (literals === 15) {
        let extra = 255;
        while (extra === 255) { extra = packed[cursor++]; literals += extra; }
      }
      cursor += literals;
      if (cursor >= packed.length) { lastLiteralRun = literals; break; }
      cursor += 2;
      let match = token & 0x0f;
      if (match === 15) {
        let extra = 255;
        while (extra === 255) { extra = packed[cursor++]; match += extra; }
      }
    }
    expect(lastLiteralRun).toBeGreaterThanOrEqual(5);
  });

  it.skipIf(!hasPrivateSaveFixtures)('decodes a real save and repacks it into a file the game-sized slot fits', () => {
    const file = new Uint8Array(readFileSync('tests/gamesave/save.003'));
    const save = decodeSave(file, 'save.003');
    expect(save.type).toBe(8);
    expect(save.data.length).toBe(20 * 1024 * 1024);
    expect(new TextDecoder().decode(save.data.subarray(0, 3))).toBe('SER');

    const packed = encodeSave(save);
    expect(packed.length).toBe(file.length);
    // The header is rewritten, not copied wholesale, but must describe the same buffer.
    const reread = decodeSave(packed, 'repacked');
    expect(Buffer.from(reread.data).equals(Buffer.from(save.data))).toBe(true);
  }, 60_000);

  it('rejects containers it has not been verified against', () => {
    const lst = new Uint8Array(20);
    lst.set(new TextEncoder().encode('YKCMP_V1'));
    new DataView(lst.buffer).setUint32(8, 4, true);
    expect(() => decodeSave(lst, 'save.lst')).toThrow(/type 4/);
    expect(() => decodeSave(new Uint8Array(64), 'junk')).toThrow(/YKCMP_V1/);
  });
});
