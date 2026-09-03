from __future__ import annotations

import io
import math
import struct
from dataclasses import dataclass

from PIL import Image
import texture2ddecoder


NLTX_MAGIC = b"NMPLTEX1"
YKCMP_MAGIC = b"YKCMP_V1"


@dataclass(frozen=True, slots=True)
class NltxHeader:
    layout_id: int
    format_id: int
    width: int
    height: int
    block_height_log2: int
    payload_offset: int


def ykcmp_decompress(payload: bytes, output_size: int) -> bytes:
    """Decode the command stream inside a YKCMP_V1 container."""
    source = 0
    output = bytearray()
    while source < len(payload) and len(output) < output_size:
        command = payload[source]
        if command < 0x80:
            source += 1
            literal_size = command
            if source + literal_size > len(payload):
                raise ValueError("truncated YKCMP literal")
            if len(output) + literal_size > output_size:
                raise ValueError("YKCMP literal exceeds declared output size")
            output.extend(payload[source : source + literal_size])
            source += literal_size
            continue

        if command < 0xC0:
            length = ((command - 0x80) >> 4) + 1
            distance = ((command - 0x80) & 0x0F) + 1
            source += 1
        elif command < 0xE0:
            if source + 1 >= len(payload):
                raise ValueError("truncated YKCMP back-reference")
            length = command - 0xC0 + 2
            distance = payload[source + 1] + 1
            source += 2
        else:
            if source + 2 >= len(payload):
                raise ValueError("truncated YKCMP back-reference")
            first = payload[source + 1]
            length = ((command - 0xE0) << 4) + (first >> 4) + 3
            distance = ((first & 0x0F) << 8) + payload[source + 2] + 1
            source += 3

        if distance > len(output):
            raise ValueError("YKCMP back-reference precedes output start")
        if len(output) + length > output_size:
            raise ValueError("YKCMP back-reference exceeds declared output size")
        for _ in range(length):
            output.append(output[-distance])

    if len(output) != output_size:
        raise ValueError(
            f"YKCMP output is truncated: expected {output_size}, got {len(output)}"
        )
    return bytes(output)


def lz4_block_decompress(payload: bytes, output_size: int) -> bytes:
    """Decode the raw LZ4 block used by YKCMP method 9."""
    source = 0
    output = bytearray()

    def extended_length(initial: int) -> int:
        nonlocal source
        length = initial
        if initial != 15:
            return length
        while True:
            if source >= len(payload):
                raise ValueError("truncated LZ4 length")
            extension = payload[source]
            source += 1
            length += extension
            if extension != 255:
                return length

    while source < len(payload):
        token = payload[source]
        source += 1
        literal_size = extended_length(token >> 4)
        if source + literal_size > len(payload):
            raise ValueError("truncated LZ4 literal")
        if len(output) + literal_size > output_size:
            raise ValueError("LZ4 literal exceeds declared output size")
        output.extend(payload[source : source + literal_size])
        source += literal_size
        if source == len(payload):
            break
        if source + 2 > len(payload):
            raise ValueError("truncated LZ4 match offset")
        distance = struct.unpack_from("<H", payload, source)[0]
        source += 2
        if distance == 0 or distance > len(output):
            raise ValueError("LZ4 match precedes output start")
        match_size = extended_length(token & 0x0F) + 4
        if len(output) + match_size > output_size:
            raise ValueError("LZ4 match exceeds declared output size")
        for _ in range(match_size):
            output.append(output[-distance])

    if len(output) != output_size:
        raise ValueError(
            f"LZ4 output is truncated: expected {output_size}, got {len(output)}"
        )
    return bytes(output)


def _align(value: int, alignment: int) -> int:
    return (value + alignment - 1) // alignment * alignment


def tegra_blocklinear_address(
    x: int,
    y: int,
    width: int,
    bytes_per_block: int,
    *,
    block_height_log2: int,
) -> int:
    block_height = 1 << block_height_log2
    pitch = _align(width * bytes_per_block, 64)
    x_bytes = x * bytes_per_block
    gob_x = x_bytes // 64
    gob_y = y // 8
    macro_y = gob_y // block_height
    in_block_y = gob_y % block_height
    within_gob = (
        ((x_bytes & 0x3F) >> 5) * 256
        + ((y & 0x07) >> 1) * 64
        + ((x_bytes & 0x1F) >> 4) * 32
        + (y & 0x01) * 16
        + (x_bytes & 0x0F)
    )
    return (
        macro_y * pitch * 8 * block_height
        + gob_x * 512 * block_height
        + in_block_y * 512
        + within_gob
    )


def deswizzle_blocks(
    swizzled: bytes,
    width_blocks: int,
    height_blocks: int,
    bytes_per_block: int,
    *,
    block_height_log2: int,
) -> bytes:
    linear = bytearray(width_blocks * height_blocks * bytes_per_block)
    for y in range(height_blocks):
        for x in range(width_blocks):
            source = tegra_blocklinear_address(
                x,
                y,
                width_blocks,
                bytes_per_block,
                block_height_log2=block_height_log2,
            )
            destination = (y * width_blocks + x) * bytes_per_block
            end = source + bytes_per_block
            if end > len(swizzled):
                raise ValueError("swizzled texture address exceeds payload")
            linear[destination : destination + bytes_per_block] = swizzled[source:end]
    return bytes(linear)


def parse_nltx_header(blob: bytes) -> NltxHeader:
    if len(blob) < 0x80 or blob[:8] != NLTX_MAGIC:
        raise ValueError("invalid NMPLTEX1 texture")
    return NltxHeader(
        layout_id=struct.unpack_from("<I", blob, 0x10)[0],
        format_id=struct.unpack_from("<H", blob, 0x14)[0],
        width=struct.unpack_from("<I", blob, 0x18)[0],
        height=struct.unpack_from("<I", blob, 0x1C)[0],
        block_height_log2=blob[0x20],
        payload_offset=struct.unpack_from("<I", blob, 0x34)[0],
    )


def _dds_bc7(width: int, height: int, blocks: bytes) -> bytes:
    flags = 0x1 | 0x2 | 0x4 | 0x1000 | 0x80000
    linear_size = math.ceil(width / 4) * 16
    header = struct.pack(
        "<18I",
        124,
        flags,
        height,
        width,
        linear_size,
        0,
        0,
        *([0] * 11),
    )
    pixel_format = struct.pack(
        "<8I", 32, 0x4, int.from_bytes(b"DX10", "little"), 0, 0, 0, 0, 0
    )
    caps = struct.pack("<5I", 0x1000, 0, 0, 0, 0)
    dx10 = struct.pack("<5I", 98, 3, 0, 1, 0)
    return b"DDS " + header + pixel_format + caps + dx10 + blocks


def decode_nltx_image(blob: bytes) -> Image.Image:
    header = parse_nltx_header(blob)
    if header.format_id != 6:
        raise ValueError(f"unsupported NLTX texture format: {header.format_id}")
    offset = header.payload_offset
    if offset + 0x14 > len(blob) or blob[offset : offset + 8] != YKCMP_MAGIC:
        raise ValueError("NLTX texture has no YKCMP_V1 payload")
    method = struct.unpack_from("<I", blob, offset + 0x08)[0]
    compressed_size = struct.unpack_from("<I", blob, offset + 0x0C)[0]
    output_size = struct.unpack_from("<I", blob, offset + 0x10)[0]
    payload_end = min(len(blob), offset + compressed_size)
    compressed = blob[offset + 0x14 : payload_end]
    if method == 9:
        swizzled = lz4_block_decompress(compressed, output_size)
    else:
        swizzled = ykcmp_decompress(compressed, output_size)
    if header.layout_id == 102:
        decoded = texture2ddecoder.decode_bc7(
            swizzled, header.width, header.height
        )
        return Image.frombytes(
            "RGBA", (header.width, header.height), decoded, "raw", "BGRA"
        )

    width_blocks = math.ceil(header.width / 4)
    height_blocks = math.ceil(header.height / 4)
    blocks = deswizzle_blocks(
        swizzled,
        width_blocks,
        height_blocks,
        16,
        block_height_log2=header.block_height_log2,
    )
    with Image.open(io.BytesIO(_dds_bc7(header.width, header.height, blocks))) as image:
        return image.convert("RGBA")
