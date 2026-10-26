import pytest
from PIL import Image

from honogurashi_extractor.crop_growth import growth_forms, visible_box


def sprite(name, x=-10, y=-20):
    return {'file': f'sprites/{name}.webp', 'x': x, 'y': y, 'w': 32, 'h': 32}


def test_stages_keep_points_next_form_and_one_sprite_when_seasons_agree():
    art = {'states': {'1': [[0, 10], [200, 20]], '4': [[0, 60]]},
           'seasons': [{'10': sprite('seed'), '20': sprite('grown'), '60': sprite('cut')}] * 4}
    assert growth_forms({1: [(0, 0), (200, 4)], 4: [(0, 0)]}, art) == {
        '1': [[0, 0, sprite('seed')], [200, 4, sprite('grown')]],
        '4': [[0, 0, sprite('cut')]],
    }


def test_seasonal_sprites_are_listed_spring_to_winter():
    seasons = [{'110': sprite(name)} for name in ('spr', 'sum', 'aut', 'win')]
    forms = growth_forms({1: [(0, 0)]}, {'states': {'1': [[0, 110]]}, 'seasons': seasons})
    assert forms['1'][0][2] == [sprite('spr'), sprite('sum'), sprite('aut'), sprite('win')]


def test_forms_without_art_are_skipped_and_mismatches_rejected():
    art = {'states': {'1': [[0, 10]]}, 'seasons': [{'10': sprite('seed')}] * 4}
    assert set(growth_forms({1: [(0, 0)], 2: [(0, 0)]}, art)) == {'1'}
    with pytest.raises(ValueError, match='thresholds'):
        growth_forms({1: [(0, 0), (100, 0)]}, art)
    with pytest.raises(ValueError, match='no sprite'):
        growth_forms({1: [(0, 0)]}, {'states': {'1': [[0, 99]]}, 'seasons': art['seasons']})


def test_visible_box_is_offset_by_the_sprite_anchor():
    image = Image.new('RGBA', (32, 32))
    image.putpixel((4, 6), (0, 0, 0, 255))
    image.putpixel((9, 11), (0, 0, 0, 4))  # below the alpha threshold
    assert visible_box(image, sprite('x')) == (-6, -14, -5, -13)
    assert visible_box(Image.new('RGBA', (8, 8)), sprite('x')) is None
