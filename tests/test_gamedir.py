import argparse
from pathlib import Path

import pytest

from honogurashi_extractor import gamedir


def test_library_paths_unescape_steam_vdf():
    vdf = '"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"/home/me/games"\n\t}\n}\n'
    assert gamedir.library_paths(vdf) == [Path('C:\\Program Files (x86)\\Steam'), Path('/home/me/games')]


def test_steam_library_is_searched(monkeypatch, tmp_path):
    steam, library = tmp_path / 'Steam', tmp_path / 'Library'
    (steam / 'steamapps').mkdir(parents=True)
    game = library / 'steamapps' / 'common' / gamedir.GAME_FOLDER
    game.mkdir(parents=True)
    (game / 'data.dat').write_bytes(b'')
    (steam / 'steamapps' / 'libraryfolders.vdf').write_text(f'"path" "{library.as_posix()}"', encoding='utf-8')
    monkeypatch.setattr(gamedir, '_steam_roots', lambda: [steam])
    monkeypatch.delenv(gamedir.ENV, raising=False)
    assert gamedir.default_game_dir() == game


def test_environment_overrides_steam(monkeypatch, tmp_path):
    monkeypatch.setenv(gamedir.ENV, str(tmp_path))
    monkeypatch.setattr(gamedir, 'steam_game_dir', lambda: pytest.fail('Steam should not be searched'))
    assert gamedir.default_game_dir() == tmp_path


def test_argument_is_required_only_without_a_default(monkeypatch, tmp_path):
    monkeypatch.delenv(gamedir.ENV, raising=False)
    monkeypatch.setattr(gamedir, 'steam_game_dir', lambda: None)
    parser = argparse.ArgumentParser()
    gamedir.add_game_dir(parser, '--game-dir', '--game')
    with pytest.raises(SystemExit):
        parser.parse_args([])
    assert parser.parse_args(['--game', str(tmp_path)]).game_dir == tmp_path

    monkeypatch.setenv(gamedir.ENV, str(tmp_path))
    parser = argparse.ArgumentParser()
    gamedir.add_game_dir(parser)
    assert parser.parse_args([]).game_dir == tmp_path
