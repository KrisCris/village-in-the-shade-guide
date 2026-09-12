/**
 * YKCMP_V1 container codec for the game's save files.
 *
 * Header (little endian):
 *   0x00  "YKCMP_V1"
 *   0x08  u32 compression type — 8 is a raw LZ4 block, which is all the game
 *         uses for `save.00N` and `.systemsave`
 *   0x0c  u32 offset just past the compressed data
 *   0x10  u32 decompressed length (always 20 MiB for slot saves)
 *   0x14  the raw LZ4 block
 *
 * The game writes a fixed-size file and leaves whatever follows the compressed
 * block untouched, so an export keeps the original file length.
 */

const MAGIC = 'YKCMP_V1';
const HEADER_SIZE = 0x14;
const TYPE_OFFSET = 0x08;
const COMPRESSED_END_OFFSET = 0x0c;
const UNCOMPRESSED_SIZE_OFFSET = 0x10;
const MAX_SAVE_SIZE = 64 * 1024 * 1024;

export interface DecodedSave {
  /** Decompressed buffer, the full `uncompressedSize` including zero padding. */
  data: Uint8Array;
  fileName: string;
  /** The uploaded bytes, never modified. */
  original: Uint8Array;
  type: number;
}

function readU32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true);
}

function writeU32(data: Uint8Array, offset: number, value: number): void {
  new DataView(data.buffer, data.byteOffset, data.byteLength).setUint32(offset, value, true);
}

/** Decode the raw LZ4 block used by YKCMP_V1 type 8 saves. */
export function decodeLz4Block(input: Uint8Array, outputSize: number): Uint8Array {
  if (!Number.isSafeInteger(outputSize) || outputSize < 0 || outputSize > MAX_SAVE_SIZE) {
    throw new Error(`无效的解压长度：${outputSize}`);
  }
  const output = new Uint8Array(outputSize);
  let inputPos = 0;
  let outputPos = 0;
  while (inputPos < input.length) {
    const token = input[inputPos++];
    let literalLength = token >>> 4;
    if (literalLength === 15) {
      let extra = 255;
      while (extra === 255) {
        if (inputPos >= input.length) throw new Error('LZ4 字面量长度越界。');
        extra = input[inputPos++];
        literalLength += extra;
      }
    }
    if (inputPos + literalLength > input.length || outputPos + literalLength > output.length) {
      throw new Error('LZ4 字面量数据越界。');
    }
    output.set(input.subarray(inputPos, inputPos + literalLength), outputPos);
    inputPos += literalLength;
    outputPos += literalLength;
    if (inputPos === input.length) break;
    if (inputPos + 2 > input.length) throw new Error('LZ4 匹配偏移越界。');
    const offset = input[inputPos] | (input[inputPos + 1] << 8);
    inputPos += 2;
    if (offset === 0 || offset > outputPos) throw new Error('LZ4 匹配偏移无效。');
    let matchLength = token & 0x0f;
    if (matchLength === 15) {
      let extra = 255;
      while (extra === 255) {
        if (inputPos >= input.length) throw new Error('LZ4 匹配长度越界。');
        extra = input[inputPos++];
        matchLength += extra;
      }
    }
    matchLength += 4;
    if (outputPos + matchLength > output.length) throw new Error('LZ4 匹配数据越界。');
    for (let i = 0; i < matchLength; i++) output[outputPos + i] = output[outputPos - offset + i];
    outputPos += matchLength;
  }
  if (outputPos !== output.length) throw new Error(`LZ4 解压长度不符：${outputPos}/${output.length}`);
  return output;
}

/* ---------------------------------------------------------------- encoder -- */

// The block format reserves the tail so that a conforming decoder never reads
// past the end: the last five bytes are always literals, and no match may start
// in the last twelve.
const LAST_LITERALS = 5;
const MATCH_FIND_LIMIT = 12;
const MIN_MATCH = 4;
const HASH_BITS = 17;

function readU32At(input: Uint8Array, position: number): number {
  return (input[position] | (input[position + 1] << 8) | (input[position + 2] << 16) | (input[position + 3] << 24)) >>> 0;
}

function hashSequence(value: number): number {
  return (Math.imul(value, 2654435761) >>> (32 - HASH_BITS));
}

function writeLengthExtension(output: Uint8Array, position: number, length: number): number {
  if (length < 15) return position;
  let remaining = length - 15;
  while (remaining >= 255) {
    output[position++] = 255;
    remaining -= 255;
  }
  output[position++] = remaining;
  return position;
}

/**
 * Encode a raw LZ4 block — no frame, no embedded size field, which is what the
 * YKCMP type-8 container stores.
 */
export function encodeLz4Block(input: Uint8Array): Uint8Array {
  const output = new Uint8Array(input.length + Math.ceil(input.length / 255) + 64);
  const table = new Int32Array(1 << HASH_BITS).fill(-1);
  let outputPos = 0;
  let anchor = 0;
  let inputPos = 0;
  const matchLimit = input.length - LAST_LITERALS;
  const searchLimit = input.length - MATCH_FIND_LIMIT;

  const emitSequence = (literalEnd: number, matchStart: number, matchLength: number, distance: number): void => {
    const literalLength = literalEnd - anchor;
    const tokenPos = outputPos++;
    output[tokenPos] = Math.min(literalLength, 15) << 4;
    outputPos = writeLengthExtension(output, outputPos, literalLength);
    output.set(input.subarray(anchor, literalEnd), outputPos);
    outputPos += literalLength;
    output[outputPos++] = distance & 0xff;
    output[outputPos++] = (distance >>> 8) & 0xff;
    output[tokenPos] |= Math.min(matchLength - MIN_MATCH, 15);
    outputPos = writeLengthExtension(output, outputPos, matchLength - MIN_MATCH);
    anchor = matchStart + matchLength;
  };

  while (inputPos < searchLimit) {
    const sequence = readU32At(input, inputPos);
    const hash = hashSequence(sequence);
    const candidate = table[hash];
    table[hash] = inputPos;
    if (candidate < 0 || inputPos - candidate > 0xffff || readU32At(input, candidate) !== sequence) {
      inputPos++;
      continue;
    }
    let matchLength = MIN_MATCH;
    while (inputPos + matchLength < matchLimit && input[candidate + matchLength] === input[inputPos + matchLength]) {
      matchLength++;
    }
    emitSequence(inputPos, inputPos, matchLength, inputPos - candidate);
    // Index the bytes covered by the match so later sequences can reuse them.
    const indexFrom = inputPos + 1;
    inputPos += matchLength;
    for (let p = indexFrom; p < inputPos - MIN_MATCH && p < searchLimit; p++) {
      table[hashSequence(readU32At(input, p))] = p;
    }
  }

  const literalLength = input.length - anchor;
  const tokenPos = outputPos++;
  output[tokenPos] = Math.min(literalLength, 15) << 4;
  outputPos = writeLengthExtension(output, outputPos, literalLength);
  output.set(input.subarray(anchor), outputPos);
  outputPos += literalLength;
  return output.subarray(0, outputPos);
}

/* -------------------------------------------------------------- container -- */

export function decodeSave(file: Uint8Array, fileName = 'save'): DecodedSave {
  if (file.length < HEADER_SIZE || new TextDecoder('ascii').decode(file.subarray(0, 8)) !== MAGIC) {
    throw new Error('不是受支持的 YKCMP_V1 存档。');
  }
  const type = readU32(file, TYPE_OFFSET);
  if (type !== 8) throw new Error(`这个工具只支持 LZ4（type 8）存档，读到的是 type ${type}。`);
  const compressedEnd = readU32(file, COMPRESSED_END_OFFSET);
  const uncompressedSize = readU32(file, UNCOMPRESSED_SIZE_OFFSET);
  if (compressedEnd <= HEADER_SIZE || compressedEnd > file.length || uncompressedSize > MAX_SAVE_SIZE) {
    throw new Error('存档头中的长度无效。');
  }
  return {
    data: decodeLz4Block(file.subarray(HEADER_SIZE, compressedEnd), uncompressedSize),
    fileName,
    original: file,
    type,
  };
}

/**
 * Repack `data` into a YKCMP type-8 file the same size as the original, and
 * verify the result decodes back to exactly what went in.
 */
export function encodeSave(save: DecodedSave, data: Uint8Array = save.data): Uint8Array {
  if (data.length !== readU32(save.original, UNCOMPRESSED_SIZE_OFFSET)) {
    throw new Error('解压缓冲区长度必须与原存档一致。');
  }
  const compressed = encodeLz4Block(data);
  const compressedEnd = HEADER_SIZE + compressed.length;
  if (compressedEnd > save.original.length) {
    throw new Error(`压缩后的数据 ${compressedEnd} 字节，超过了存档文件的 ${save.original.length} 字节。`);
  }
  const output = new Uint8Array(save.original.length);
  output.set(save.original.subarray(0, HEADER_SIZE));
  writeU32(output, COMPRESSED_END_OFFSET, compressedEnd);
  writeU32(output, UNCOMPRESSED_SIZE_OFFSET, data.length);
  output.set(compressed, HEADER_SIZE);
  const check = decodeSave(output, save.fileName);
  if (check.data.length !== data.length) throw new Error('重新打包校验失败：长度不符。');
  for (let i = 0; i < data.length; i++) {
    if (check.data[i] !== data[i]) throw new Error(`重新打包校验失败：偏移 ${i} 处的字节不一致。`);
  }
  return output;
}
