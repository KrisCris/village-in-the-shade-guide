"""Growth-stage art for plantable crops, joined from crops.dat and the farm sprite manifest.

crops.dat gives each form's stages as (growth points, changeForm): the form a
plant takes when it is harvested or cut at that stage, 0 when it is removed.
The farm manifest (tools/extract-map-art.py) gives each stage's animation
sequence and the sprite drawn for it in each season.
"""
from __future__ import annotations

from PIL import Image


def visible_box(image: Image.Image, sprite: dict, threshold: int = 8) -> tuple[int, int, int, int] | None:
    """Painted pixels of a sprite, in the crop's ground coordinates (the sprite anchor is the origin)."""
    box = image.getchannel("A").point(lambda alpha: 255 if alpha > threshold else 0).getbbox()
    if not box:
        return None
    return (sprite["x"] + box[0], sprite["y"] + box[1], sprite["x"] + box[2], sprite["y"] + box[3])


def growth_forms(forms: dict[int, list[tuple[int, int]]], art: dict) -> dict[str, list[list]]:
    """Each form's stages as [points, next form, sprite], or four seasonal sprites when they differ."""
    result = {}
    for form, stages in forms.items():
        drawn = art["states"].get(str(form))
        if not stages or drawn is None:
            continue
        if [points for points, _ in stages] != [points for points, _ in drawn]:
            raise ValueError(f"form {form} thresholds disagree with the sprite manifest")
        rows = []
        for (points, change), (_, sequence) in zip(stages, drawn):
            sprites = [season.get(str(sequence)) for season in art["seasons"]]
            if not all(sprites):
                raise ValueError(f"form {form} sequence {sequence} has no sprite")
            rows.append([points, change, sprites[0] if all(s == sprites[0] for s in sprites) else sprites])
        result[str(form)] = rows
    return result
