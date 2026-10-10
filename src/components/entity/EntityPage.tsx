import { useEffect, useMemo, useState } from 'react';
import type { Catalog, Entity } from '../../data/types';
import { resolveCatalogEntity } from '../../data/entityLookup';
import { buildEntityDetailModel, type EntityDetailModel } from '../../domain/relations';
import { useQuality } from '../quality/qualityPreference';
import EntityDetail from './EntityDetail';
import { I18nProvider, useI18n } from '../../i18n/react';
import type { Locale } from '../../i18n/locales';

function catalogFromPayload(data: Omit<Catalog, 'byId' | 'generatedAt'>): Catalog {
  const byId: Record<string, Entity> = {};
  for (const entity of data.entities) byId[entity.id] ??= { ...entity, searchText: entity.searchText ?? '' };
  return { ...data, generatedAt: '', byId };
}

type Props = { initialEntity: Entity; initialModel: EntityDetailModel };

export default function EntityPage({ locale, ...props }: Props & { locale?: Locale }) {
  return <I18nProvider locale={locale}><EntityPageBody {...props} /></I18nProvider>;
}

function EntityPageBody({ initialEntity, initialModel }: Props) {
  const { t, data } = useI18n();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [quality] = useQuality();
  useEffect(() => {
    const controller = new AbortController();
    fetch(data('/game-data.json'), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => setCatalog(catalogFromPayload(data)))
      .catch((error) => { if (error.name !== 'AbortError') setLoadFailed(true); });
    return () => controller.abort();
  }, [data]);
  const model = useMemo(() => catalog ? buildEntityDetailModel(resolveCatalogEntity(catalog, initialEntity), catalog, quality, false, t) : initialModel, [catalog, initialEntity, initialModel, quality, t]);
  return <>
    <EntityDetail model={model} />
    {loadFailed && <p className="muted">{t('动态品质数据读取失败；当前显示无星基础数据。')}</p>}
  </>;
}
