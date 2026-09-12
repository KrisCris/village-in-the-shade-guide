import { Converter } from 'opencc-js/t2cn';

// Match the catalog's Chinese locale. Apply only to game-provided display text,
// never to editable save values such as player, animal or container names.
export const simplifySaveText = Converter({ from: 'tw', to: 'cn' });

export function simplifySaveEntry<T extends { name: string; description?: string }>(entry: T): T {
  return {
    ...entry,
    name: simplifySaveText(entry.name),
    ...(entry.description !== undefined ? { description: simplifySaveText(entry.description) } : {}),
  };
}
