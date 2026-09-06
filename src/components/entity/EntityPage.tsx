import { withBase } from '../../lib/sitePath';
import { useEffect, useMemo, useState } from 'react';
import type { Catalog, Entity } from '../../data/types';
import { resolveCatalogEntity } from '../../data/entityLookup';
import { buildEntityDetailModel, type EntityDetailModel } from '../../domain/relations';
import { useQuality } from '../quality/qualityPreference';
import EntityDetail from './EntityDetail';

function catalogFromPayload(data: Omit<Catalog, 'byId' | 'generatedAt'>): Catalog {
  const byId: Record<string, Entity> = {};
  for (const entity of data.entities) byId[entity.id] ??= { ...entity, searchText: entity.searchText ?? '' };
  return { ...data, generatedAt: '', byId };
}

export default function EntityPage({ initialEntity, initialModel }: { initialEntity: Entity; initialModel: EntityDetailModel }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [quality] = useQuality();
  useEffect(() => {
    const controller = new AbortController();
    fetch(withBase('/game-data.json'), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => setCatalog(catalogFromPayload(data)))
      .catch((error) => { if (error.name !== 'AbortError') setLoadFailed(true); });
    return () => controller.abort();
  }, []);
  const model = useMemo(() => catalog ? buildEntityDetailModel(resolveCatalogEntity(catalog, initialEntity), catalog, quality) : initialModel, [catalog, initialEntity, initialModel, quality]);
  return <>
    <EntityDetail model={model} />
    {loadFailed && <p className="muted">动态品质数据读取失败；当前显示无星基础数据。</p>}
  </>;
}
