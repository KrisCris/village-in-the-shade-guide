import type { Entity } from './types';
import type { EntityDetailModel, RelationRowModel } from '../domain/relations';

/** Pages render the built growth model; the raw stage table is only needed once the full catalog loads. */
export function pageEntity(entity: Entity): Entity {
  if (!('growth' in entity)) return entity;
  const page = { ...entity };
  delete page.growth;
  return page;
}

/** Relationship cards need their computed labels, not each entity's raw game record. */
export function compactDetailModel(model: EntityDetailModel, embedded = false): EntityDetailModel {
  const card = (entity: Entity): Entity => ({
    id: entity.id, kind: entity.kind, name: entity.name, searchText: '',
    icon_path: entity.icon_path, duration_minutes: entity.duration_minutes,
  });
  const row = (value: RelationRowModel) => ({ ...value, entity: card(value.entity) });
  return {
    ...model,
    entity: embedded ? card(model.entity) : pageEntity(model.entity),
    groups: model.groups.map(group => ({ ...group, rows: group.rows.map(row) })),
    ingredientOptions: model.ingredientOptions.map(option => ({ ...option, rows: option.rows.map(row) })),
    totalProcessingPlans: model.processingPlans.length,
    processingPlans: model.processingPlans.slice(0, 12).map(plan => compactDetailModel(plan, true)),
  };
}
