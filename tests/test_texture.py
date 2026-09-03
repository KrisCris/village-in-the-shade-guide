import struct

import pytest

from honogurashi_extractor.texture import (
    deswizzle_blocks,
    lz4_block_decompress,
    parse_nltx_header,
    tegra_blocklinear_address,
    ykcmp_decompress,
)


def test_ykcmp_decompresses_literals_and_overlapping_backrefs():
    payload = b"\x03abc\xa2"

    assert ykcmp_decompress(payload, 6) == b"abcabc"


def test_ykcmp_rejects_backrefs_before_the_output_start():
    with pytest.raises(ValueError, match="back-reference"):
        ykcmp_decompress(b"\x80", 1)


def test_lz4_block_decompresses_literals_and_overlapping_matches():
    payload = b"\x32abc\x03\x00"

    assert lz4_block_decompress(payload, 9) == b"abcabcabc"


def test_nltx_reads_block_height_from_the_header_byte():
    blob = bytearray(0x80)
    blob[:8] = b"NMPLTEX1"
    struct.pack_into("<I", blob, 0x10, 102)
    struct.pack_into("<H", blob, 0x14, 6)
    struct.pack_into("<II", blob, 0x18, 2048, 2048)
    blob[0x20:0x24] = b"\x04\x00\xff\xff"
    struct.pack_into("<I", blob, 0x34, 0x80)

    assert parse_nltx_header(bytes(blob)).block_height_log2 == 4
    assert parse_nltx_header(bytes(blob)).layout_id == 102


def test_deswizzle_blocks_restores_linear_block_order():
    width_blocks = 4
    height_blocks = 8
    block_bytes = 16
    swizzled = bytearray(512)
    expected = bytearray()

    for y in range(height_blocks):
        for x in range(width_blocks):
            block = bytes([y * width_blocks + x]) * block_bytes
            offset = tegra_blocklinear_address(
                x, y, width_blocks, block_bytes, block_height_log2=0
            )
            swizzled[offset : offset + block_bytes] = block
            expected.extend(block)

    assert (
        deswizzle_blocks(
            bytes(swizzled),
            width_blocks,
            height_blocks,
            block_bytes,
            block_height_log2=0,
        )
        == bytes(expected)
    )
