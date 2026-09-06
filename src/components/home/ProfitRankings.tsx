import { withBase } from '../../lib/sitePath';
import type { Entity } from '../../data/types';
import { entityUrl } from '../../data/clientSearch';
import { qualityLabel } from '../../domain/quality';
import { useQuality } from '../quality/qualityPreference';

function metric(value: number) {
  const shown = Number.isInteger(value) ? String(value) : `≈${value.toFixed(1)}`;
  return `${value >= 0 ? '+' : ''}${shown} / 日`;
}

function fallback(entity: Entity) {
  return `/icons/fallback/${entity.kind === 'crops' || entity.kind === 'processes' ? entity.kind : 'default'}.svg`;
}

function Ranking({ title, link, rows, quality }: { title: string; link: string; rows: Array<{ entity: Entity; perDay: number }>; quality: string }) {
  return <section>
    <div className="section-title"><h2>{title}</h2><a href={withBase(link)}>查看全部 →</a></div>
    <div className="profit-list card">{rows.map(({ entity, perDay }, index) => {
      const placeholder = fallback(entity);
      return <a key={entity.id} href={withBase(entityUrl(entity))}>
        <b>{index + 1}</b>
        <img src={withBase(entity.icon_path || placeholder)} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = withBase(placeholder); }} alt="" width="44" height="44" loading="lazy" />
        <span>{entity.name.zh_hans}<small>{entity.name.ja}</small></span>
        <strong>{metric(perDay)}<small>{quality}</small></strong>
      </a>;
    })}</div>
  </section>;
}

type RankingRow={entity:Entity;perDay:number};
export default function ProfitRankings({rankings}:{rankings:Record<string,{crops:RankingRow[];processes:RankingRow[]}>}) {
  const [quality]=useQuality();
  const {crops:cropRows,processes:processRows}=rankings[quality];
  const label = qualityLabel(quality);

  return <div className="rankings">
    <Ranking title="加工日净收益" link="/data/processes/?sort=profit&dir=desc" rows={processRows} quality={label} />
    <Ranking title="单格作物日净收益" link="/data/crops/?sort=profit&dir=desc" rows={cropRows} quality={label} />
    <style>{`
      .rankings section{margin-top:3.5rem}.section-title{display:flex;align-items:end;justify-content:space-between;gap:1rem;margin-bottom:1rem}.section-title h2{margin:0;font-size:1.65rem}.profit-list a{display:grid;grid-template-columns:2rem 44px 1fr auto;align-items:center;gap:.8rem;padding:.72rem 1rem;color:var(--ink);text-decoration:none;border-bottom:1px solid var(--border)}.profit-list a:last-child{border-bottom:0}.profit-list a:hover{background:var(--green-soft)}.profit-list b{color:var(--vermilion)}.profit-list img{border-radius:8px;object-fit:contain;background:var(--paper-deep)}.profit-list span,.profit-list strong{display:grid}.profit-list small{color:var(--muted);font-weight:400}.profit-list strong{color:var(--gold);text-align:right}.profit-list strong small{margin-top:.18rem}
      @media(max-width:600px){.profit-list a{grid-template-columns:1.5rem 40px 1fr}.profit-list img{width:40px;height:40px}.profit-list strong{grid-column:3;text-align:left}.section-title{align-items:center}.section-title h2{font-size:1.35rem}}
    `}</style>
  </div>;
}
