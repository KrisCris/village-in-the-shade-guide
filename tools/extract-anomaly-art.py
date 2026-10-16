"""Illustrations for the anomaly and night-monster guides, rendered from the game's FAN models.

Two steps around tools/render-anomaly-art.mjs:
  uv run python tools/extract-anomaly-art.py export   # models + atlases -> output/anomaly-art/
  node tools/render-anomaly-art.mjs                   # headless Chrome renders -> output/anomaly-art/renders/
  uv run python tools/extract-anomaly-art.py pack     # trim, webp -> public/art/anomalies/ + data/sources/game-anomaly-art.json
Add the set name to work on the night-monster pictures instead (output/night-monster-art/ ->
public/art/night-monsters/ + data/sources/game-night-monster-art.json):
  uv run python tools/extract-anomaly-art.py export night-monsters
  node tools/render-anomaly-art.mjs night-monsters
  uv run python tools/extract-anomaly-art.py pack night-monsters

Each picture is one animation sequence of one model, referenced from anime.dat (ANIME_ID -> model name).
The sequence numbers come from the creature / gimmick scripts named in SOURCE.
"""
import json, struct, sys
from pathlib import Path
from PIL import Image
from honogurashi_extractor.gamedir import default_game_dir
from honogurashi_extractor.archive import FafullfsArchive
from honogurashi_extractor.table import read_table
from honogurashi_extractor.probe import _string_groups
from honogurashi_extractor.texture import decode_nltx_image

OUT = Path('output/anomaly-art')
PUBLIC = Path('public/art/anomalies')
# slug: (anime id, sequence, where the sequence is used)
ART = {
    'hand-eyes': ('ANIME_ID_ENEMY_EYE_OF_HAND', 11, 'ai_creature_horror_eye_of_hand'),
    'lantern': ('ANIME_ID_ENEMY_LANTERN', 110, 'ai_creature_horror_lantern_fixed'),
    'monument-small': ('ANIME_ID_EVENT_EVILEVE_STONE_MONUMENT', 210, 'gimmick.dat GIMMICK_ID_EVENT_EVILEYE_STONE_MONUMENT_SMALL waitSeq'),
    'monument-big': ('ANIME_ID_EVENT_EVILEVE_STONE_MONUMENT', 110, 'gimmick.dat GIMMICK_ID_EVENT_EVILEYE_STONE_MONUMENT_BIG waitSeq'),
    'daruma': ('ANIME_ID_ENEMY_STATUE_GAME', 1, 'ai_creature_horror_statue_game'),
    'black-daruma-stone': ('ANIME_ID_EVENT_BLACK_DARUMA', 200, 'gimmick_event_black_daruma (eye closed)'),
    'black-daruma': ('ANIME_ID_EVENT_BLACK_DARUMA', 110, 'gimmick_event_black_daruma (eye open)'),
    'soot-sprite': ('ANIME_ID_ENEMY_SOOT_SPRITE', 11, 'ai_creature_horror_soot_sprite'),
    'boss-soot-sprite': ('ANIME_ID_ENEMY_SOOT_SPRITE', 1011, 'ai_creature_horror_boss_soot_sprite SEQ_WAIT'),
    'night-grass': ('ANIME_ID_EVENT_NIGHT_GRASS', 10, 'gimmick_event_night_grass'),
    'night-grass-mimic': ('ANIME_ID_ENEMY_NIGHT_GRASS_MIMIC', 110, 'ai_creature_horror_night_grass_mimic'),
    'nozuchi-tail': ('ANIME_ID_ENEMY_NOZUCHI', 120, 'ai_creature_horror_nozuchi_tail SEQ_STOP'),
    'nozuchi': ('ANIME_ID_ENEMY_NOZUCHI', 30, 'ai_creature_horror_nozuchi'),
    'red-mask': ('ANIME_ID_ENEMY_MASK_GHOST', 1000, 'ai_creature_horror_red_mask_ghost'),
    'blue-mask': ('ANIME_ID_ENEMY_MASK_GHOST', 3000, 'ai_creature_horror_blue_mask_ghost'),
    'purple-mask': ('ANIME_ID_ENEMY_MASK_GHOST', 2000, 'ai_creature_horror_purple_mask_ghost'),
    'kasa-ghost': ('ANIME_ID_ENEMY_SEDGE_HAT_GHOST', 101, 'ai_creature_horror_sedge_hat_ghost'),
    'jizo': ('ANIME_ID_EVENT_HAT_JIZO', 120, 'gimmick_event_hat_gizo SEQ_HAT_JIJO_1'),
    'fujin': ('ANIME_ID_ENEMY_FUJIN', 10, 'ai_creature_horror_fujin SEQ_APPEAR'),
    'raijin': ('ANIME_ID_ENEMY_RAIJIN', 10, 'ai_creature_horror_raijin SEQ_APPEAR'),
    'mizuchi-fujin': ('ANIME_ID_ENEMY_FUJIN', 1010, 'ai_creature_horror_mizuchi_fujin_template SEQ_APPEAR'),
    'mizuchi-raijin': ('ANIME_ID_ENEMY_RAIJIN', 1010, 'ai_creature_horror_mizuchi_raijin_template SEQ_APPEAR'),
    'snow-woman': ('ANIME_ID_ENEMY_SNOW_WOMAN', 51, 'ai_creature_horror_snow_woman'),
    'snow-child': ('ANIME_ID_ENEMY_SNOW_CHILD', 11, 'ai_creature_horror_snow_child'),
    'husband-grave': ('ANIME_ID_GIMMICK_SNOW_WOMAN_HUSBAND_GRAVE', 100, 'gimmick_snow_woman_husband_grave'),
    'petopeto': ('ANIME_ID_ENEMY_PETOPETO', 10, 'ai_creature_horror_petopeto'),
    'giant-rabbit-moon': ('ANIME_ID_ENEMY_GIANT_RABBIT', 10, 'ai_creature_horror_giant_rabbit SEQ_WAIT'),
    'giant-rabbit': ('ANIME_ID_ENEMY_GIANT_RABBIT', 30, 'event_horror_mountain_monster SEQ_MOON_VANISH'),
    'red-phone': ('ANIME_ID_EVENT_RED_MOBILE_PHONE', 200, 'gimmick_event_red_mobile_phone'),
    'long-hair-lady': ('ANIME_ID_ENEMY_LONG_HAIR_LADY', 1, 'ai_creature_horror_long_hair_lady'),
    'doll-body': ('ANIME_ID_ENEMY_JAPANESE_DOLL', 100, 'ai_creature_horror_japanese_doll_body_item'),
    'doll-walking': ('ANIME_ID_ENEMY_JAPANESE_DOLL', 200, 'ai_creature_horror_japanese_doll_body SEQ_WALK'),
    'doll-head': ('ANIME_ID_ENEMY_JAPANESE_DOLL', 300, 'ai_creature_horror_japanese_doll_head_item'),
    'ghost-rat': ('ANIME_ID_ENEMY_GHOST_RAT', 1, 'ai_creature_horror_ghost_rat'),
    'dorotabo': ('ANIME_ID_ENEMY_DOROTABO', 12, 'ai_creature_horror_dorotabo walk seq 10, facing down'),
    'fish-monster': ('ANIME_ID_ENEMY_WANDERING_GHOST', 12, 'creature.dat CREATURE_ID_HORROR_FISH_MONSTER anime; ai_creature_horror_fish_monster SEQ_WAIT 10, facing down'),
    'abyss-carp': ('ANIME_ID_ENEMY_ABYSS_CARP', 20, 'event_horror_abyss event_clear'),
}
# Night-monster guide: sequences from the ai_creature_horror_* scripts (or creature.dat baseSeq).
NIGHT_MONSTERS = {
    'tatazumu': ('ANIME_ID_ENEMY_MOYAMOYASAN', 310, 'ai_creature_horror_moyamoyasan_lv3 SEQ_STOP'),
    'kunekune': ('ANIME_ID_ENEMY_KUNEKUNE', 11, 'ai_creature_horror_kunekune SEQ_STOP'),
    'wandering-ghost': ('ANIME_ID_ENEMY_WANDERING_GHOST', 12, 'ai_creature_horror_wandering_ghost SEQ_WAIT 10, facing down'),
    'warp-ghost': ('ANIME_ID_ENEMY_WARP_GHOST', 10, 'ai_creature_horror_warp_ghost SEQ_STOP'),
    'obo': ('ANIME_ID_ENEMY_OBO', 12, 'ai_creature_horror_obo SEQ_WAIT 10, facing down'),
    'two-mouths-woman': ('ANIME_ID_ENEMY_TWO_MOUTHS_WOMAN', 12, 'ai_creature_horror_two_mouths_woman SEQ_WAIT 10, facing down'),
    'blockage': ('ANIME_ID_ENEMY_BLOCKAGE', 11, 'ai_creature_horror_blockage_plane SEQ_STOP 10 + 8-angle code 1'),
    'wall-face': ('ANIME_ID_ENEMY_PLASTERED_WALL', 311, 'ai_creature_horror_plastered_wall_face SEQ_AWAKE'),
    'wall-one': ('ANIME_ID_ENEMY_PLASTERED_WALL_ONE', 11, 'ai_creature_horror_plastered_wall_one SEQ_AWAKE'),
    'walking-stone': ('ANIME_ID_ENEMY_WALKING_STONE', 110, 'ai_creature_horror_walking_stone SEQ_WALK'),
    'treasure-box': ('ANIME_ID_ENEMY_TREASURE_BOX', 111, 'ai_creature_horror_treasure_box SEQ_RUN'),
}
SETS = {
    'anomalies': (ART, OUT, PUBLIC, Path('data/sources/game-anomaly-art.json')),
    'night-monsters': (NIGHT_MONSTERS, Path('output/night-monster-art'), Path('public/art/night-monsters'), Path('data/sources/game-night-monster-art.json')),
}
# The daruma model only ships in the per-language containers; its body is the same in each.
CONTAINERS = ('resident.fad', 'resident_2.fad', 'resident_lang_jp.fad')


def anime_models():
    a = FafullfsArchive.open(default_game_dir() / 'data.dat')
    t = read_table(a.read_entry('data/database/anime.dat'))
    return {g[0]: g[2] for g in _string_groups(t)}


def read_fad(name):
    b = FafullfsArchive.open(default_game_dir() / 'data/fairy_1_00.dat').read_entry(f'data/fairy/{name}')
    skip = struct.unpack_from('<I', b, 20)[0]
    index_end = struct.unpack_from('<I', b, 96)[0]
    first_texture = next(i for i, o in enumerate(range(80, index_end, 32)) if struct.unpack_from('<I', b, o + 12)[0] == 0)
    count = first_texture - skip
    refs = [b[80 + i * 32:88 + i * 32].split(b'\0')[0].decode('ascii', errors='replace') for i in range(count)]
    return b, skip, count, refs


def export_model(b, skip, count, refs, index):
    """Same layout as tools/extract-portrait-models.py, for any FAN model in the container."""
    size, kind, offset = struct.unpack_from('<IIQ', b, 80 + index * 32 + 8)
    assert kind == 2, refs[index]
    s = b[offset + 32:offset + size + 16]
    na, _, nc, nd = struct.unpack_from('<HHII', s, 8)
    aa, _, cc, dd = [x - 32 for x in struct.unpack_from('<4I', s, 32)]
    ep = struct.unpack_from('<I', s, 56)[0] - 32
    ne = struct.unpack_from('<I', s, 24)[0]
    keys, textures = [], set()
    for k in range(nd):
        p = dd + k * 160
        ints = struct.unpack_from('<40i', s, p)
        f = struct.unpack_from('<40f', s, p)
        keys.append(dict(resource=ints[0], time=ints[1], rect=f[4:8], transform=f[8:15], mesh=ints[36],
                         order=struct.unpack_from('<h', s, p + 14)[0]))
        if ints[0] >= count:
            textures.add(ints[0])
    model = dict(
        name=refs[index],
        animations=[list(struct.unpack_from('<8I', s, aa + k * 32)) for k in range(na)],
        nodes=[list(struct.unpack_from('<8i', s, cc + k * 32)) for k in range(nc)],
        keys=keys,
        meshes=[dict(size=struct.unpack_from('<2i', s, ep + k * 1328 + 1312),
                     vertices=[struct.unpack_from('<4f', s, ep + k * 1328 + j * 32) for j in range(41)]) for k in range(ne)],
        refs=refs,
    )
    return model, textures


def export(art=ART, out=OUT):
    models = anime_models()
    wanted = {models[anime] for anime, _, _ in art.values()}
    found = {}
    for container in CONTAINERS:
        b, skip, count, refs = read_fad(container)
        folder = out / 'models' / Path(container).stem
        folder.mkdir(parents=True, exist_ok=True)
        textures = set()
        for i, ref in enumerate(refs):
            if ref in wanted and ref not in found:
                model, used = export_model(b, skip, count, refs, i)
                (folder / f'{ref}.json').write_text(json.dumps(model), encoding='utf-8')
                textures |= used
                found[ref] = container
        for t in sorted(textures):
            p = struct.unpack_from('<I', b, 80 + (t + skip) * 32 + 16)[0] + 64
            decode_nltx_image(b[p:]).save(folder / f'tex-{t}.png')
    missing = wanted - set(found)
    assert not missing, missing
    jobs = []
    for slug, (anime, seq, _) in art.items():
        model = models[anime]
        jobs.append(dict(slug=slug, dir=f'models/{Path(found[model]).stem}', model=model, seq=seq))
    (out / 'jobs.json').write_text(json.dumps(dict(containers=found, jobs=jobs), indent=1), encoding='utf-8')
    print(f'exported {len(found)} models, {len(jobs)} jobs -> {out}')


def pack(art=ART, out=OUT, public=PUBLIC, sources_path=Path('data/sources/game-anomaly-art.json')):
    meta = json.loads((out / 'jobs.json').read_text(encoding='utf-8'))
    public.mkdir(parents=True, exist_ok=True)
    sources = {}
    for job in meta['jobs']:
        im = Image.open(out / 'renders' / f"{job['slug']}.png").convert('RGBA')
        im = im.crop(im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox())
        pad = 6
        canvas = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad))
        canvas.paste(im, (pad, pad))
        canvas.thumbnail((256, 256), Image.LANCZOS)
        canvas.save(public / f"{job['slug']}.webp", 'WEBP', quality=88, method=6)
        anime, seq, used_by = art[job['slug']]
        sources[job['slug']] = dict(anime=anime, model=job['model'], container=meta['containers'][job['model']],
                                    sequence=seq, used_by=used_by, width=canvas.width, height=canvas.height)
    sources_path.write_text(json.dumps(dict(
        source='anime.dat model names; FAN models in data/fairy_1_00.dat, rendered with src/components/art/portraitRenderer.ts',
        build='25311578', images=sources), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'packed {len(sources)} images -> {public}')


if __name__ == '__main__':
    art, out, public, sources_path = SETS[sys.argv[2] if len(sys.argv) > 2 else 'anomalies']
    step = sys.argv[1] if len(sys.argv) > 1 else 'export'
    export(art, out) if step == 'export' else pack(art, out, public, sources_path)
