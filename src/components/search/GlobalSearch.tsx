import { useMemo, useRef, useState } from 'react';
import { kindLabels, secondaryName, type Entity } from '../../data/types';
import { entityUrl, expandSearchRows, rankEntities } from '../../data/clientSearch';
import type { CompactSearchRow } from '../../data/clientSearch';
import { I18nProvider, useI18n } from '../../i18n/react';
import type { Locale } from '../../i18n/locales';

export default function GlobalSearch({ prominent = false, locale }: { prominent?: boolean; locale?: Locale }) {
  return <I18nProvider locale={locale}><SearchBox prominent={prominent} /></I18nProvider>;
}

function SearchBox({ prominent }: { prominent: boolean }) {
  const { t, href, data, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const request = useRef<Promise<void> | null>(null);
  const loadIndex = () => {
    if (!request.current) {
      setLoading(true);
      request.current = fetch(data('/search-index.json'))
        .then((response) => response.json())
        .then((data: { rows: CompactSearchRow[] }) => setRows(expandSearchRows(data.rows)))
        .finally(() => setLoading(false));
    }
    return request.current;
  };
  const results = useMemo(() => rankEntities(query, rows).slice(0, 12), [query, rows]);
  return <div className={`global-search ${prominent ? 'prominent' : ''}`}>
    <label htmlFor="global-query">{t('搜索物品、作物、机械、料理或角色')}</label>
    <input id="global-query" type="search" value={query} onFocus={loadIndex} onChange={(event) => { setQuery(event.target.value); void loadIndex(); }} placeholder={t('洋葱 / yangcong / yc / タマネギ')} autoComplete="off" />
    {query && <div className="search-results" role="listbox" aria-label={t('搜索结果')}>
      {loading && rows.length === 0 ? <p>{t('正在读取搜索索引…')}</p> : results.length ? results.map((entity) => <a key={`${entity.kind}:${entity.id}`} href={href(entityUrl(entity))} role="option">
        <span>{entity.name.zh_hans}</span><small>{kindLabels[entity.kind] ? t(kindLabels[entity.kind]) : entity.kind}{locale !== 'ja' && ` · ${secondaryName(entity.name, locale) || entity.id}`}</small>
      </a>) : <p>{t('没有匹配项')}</p>}
    </div>}
    <style>{`
      .global-search{position:relative;max-width:780px}.global-search label{display:block;margin-bottom:.45rem;color:var(--muted);font-size:.9rem}
      .global-search input{width:100%;min-height:${prominent ? '58px' : '44px'};padding:.8rem 1rem;border:1px solid var(--border);border-radius:12px;background:var(--paper-raised);color:var(--ink);box-shadow:var(--shadow)}
      .search-results{position:absolute;z-index:40;top:100%;width:100%;margin-top:.4rem;padding:.4rem;border:1px solid var(--border);border-radius:12px;background:var(--paper-raised);box-shadow:var(--shadow);max-height:440px;overflow:auto}
      .search-results a{display:flex;justify-content:space-between;gap:1rem;padding:.65rem .7rem;border-radius:8px;text-decoration:none;color:var(--ink)}.search-results a:hover{background:var(--green-soft)}.search-results small{color:var(--muted);text-align:right}.search-results p{padding:.4rem .7rem}
    `}</style>
  </div>;
}
