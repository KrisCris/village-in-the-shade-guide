"""Build compact shrine recipe inputs from the committed game snapshot."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--snapshot', type=Path, default=Path('data/generated/build-24969282/entities'))
parser.add_argument('--output', type=Path, default=Path('data/sources/game-shrine-recipe-materials.json'))
args = parser.parse_args()
items = json.loads((args.snapshot / 'items.json').read_text(encoding='utf-8'))
ids = {item['id']: item['numeric_id'] for item in items}
rows = []
for kind in ['craft-recipes', 'cooking-recipes']:
    recipes = json.loads((args.snapshot / f'{kind}.json').read_text(encoding='utf-8'))
    for recipe in recipes:
        output = recipe.get('output', {}).get('item_id')
        if not recipe.get('unlock_flag') or output not in ids:
            continue
        inputs = recipe.get('inputs', [])
        if any(material.get('item_id') not in ids for material in inputs):
            raise ValueError(f"Unresolved shrine recipe ingredients: {recipe['id']}")
        rows.append({
            'output': ids[output],
            'materials': [{'itemId': ids[material['item_id']], 'count': material.get('quantity', 1)} for material in inputs],
        })
args.output.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
