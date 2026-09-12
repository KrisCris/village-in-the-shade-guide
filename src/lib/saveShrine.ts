import { UNLOCKS } from './saveDeliveries';
import { flagEnabled, readSkills, type ProgressEdits } from './saveProgress';
import { readSigned, type SerDocument } from './ser';

export function shrineLevel(doc: SerDocument): number | null {
  const root = doc.resolve('gameValues_');
  const children = root ? doc.children(root) : [];
  for (let i = 0; i < children.length; i += 2) {
    if (readSigned(doc, children[i]) !== 20000000n) continue;
    const value = doc.resolve('this->value_', children[i + 1]);
    return value ? Number(readSigned(doc, value)) : null;
  }
  return null;
}

export function shrineEnabled(doc: SerDocument, id: number, edits: ProgressEdits): boolean {
  const node = UNLOCKS.nodes.find(n => n.id === id)!;
  return node.skill && edits.skills?.[node.skill] !== undefined ? edits.skills[node.skill] : flagEnabled(doc, node.flag, edits);
}

/** All prerequisite flags are required by CUIUnion_SkillTree::check (0x140576477). */
export function shrineRelated(id: number, unlock: boolean): number[] {
  const ids = new Set<number>();
  function visit(id: number) {
    if (ids.has(id)) return;
    const node = UNLOCKS.nodes.find(n => n.id === id);
    if (!node) throw new Error('技能树节点不存在。');
    ids.add(id);
    (unlock ? node.parents : UNLOCKS.nodes.filter(n => n.parents.includes(id)).map(n => n.id)).forEach(visit);
  }
  visit(id);
  return [...ids];
}

export function changeShrine(doc: SerDocument, edits: ProgressEdits, id: number, unlock: boolean): ProgressEdits {
  const flags = { ...edits.flags }, skills = { ...edits.skills }, originalSkills = readSkills(doc);
  for (const related of shrineRelated(id, unlock)) {
    const node = UNLOCKS.nodes.find(n => n.id === related)!;
    if (flagEnabled(doc, node.flag) === unlock) delete flags[node.flag]; else flags[node.flag] = unlock;
    if (node.skill) {
      if (originalSkills.has(String(node.skill)) === unlock) delete skills[node.skill];
      else { skills[node.skill] = unlock; delete flags[node.flag]; }
    }
  }
  return { ...edits, flags, skills };
}
