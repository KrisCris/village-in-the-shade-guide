import RankIcon from '../save/RankIcon';
import type { QualityTargetModel } from '../../domain/relations';
import { useI18n } from '../../i18n/react';

// ITEM_RANK_COPPER, _SILVER, _GOLD in gamedefine.dat.
const RANKS = { copper: 1, silver: 2, gold: 3 } as const;

/** Harvest counts for 铜★, 银★ and 金★ on a crop, seed or harvest item page, with the plants one season takes. */
export default function QualityTarget({ target }: { target: QualityTargetModel }) {
  const { t, href } = useI18n();
  const basis = target.perSeed == null ? null
    : target.perennial ? t('株数按提前种好、整个结果季收 {harvests} 次、共 {count} 个计算。', { harvests: target.harvests ?? 0, count: target.perSeed })
    : (target.harvests ?? 0) > 1 ? t('株数按每株一季（28 天）收 {harvests} 次、共 {count} 个计算。', { harvests: target.harvests ?? 0, count: target.perSeed })
    : t('株数按每株收一次、每次 {count} 个计算。', { count: target.perSeed });
  return <section className="quality-target"><h2>{t('品质门槛')}</h2>
    <p>{t('累计收获的{crop}达到下面的个数后，之后的收获都是这一档。',{ crop: target.countItem.name.zh_hans })}{target.shared.length > 0 && t('{items}也算在这个计数里。', { items: target.shared.map(item => item.name.zh_hans).join(t('、')) })}</p>
    <div className="quality-steps">{target.steps.map(step => <div key={step.quality}>
      <span className="quality-step-rank"><RankIcon rank={RANKS[step.quality]} decorative />{step.label}</span>
      <strong>{t('{count} 个', { count: step.count })}</strong>
      {step.seeds != null && <small>{t('约 {seeds} 株', { seeds: step.seeds })}</small>}
    </div>)}</div>
    <p className="calculation-note">{basis} {t('品质按收获前的计数定，跨过门槛后的下一次收获才升档。')} <a href={href('/guides/crop-quality/')}>{t('施肥提前升档和拿品牌的方法')}</a></p>
    <style>{`
      .quality-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem}
      .quality-steps>div{display:grid;gap:.35rem;padding:.9rem 1rem;border:1px solid var(--border);border-radius:10px;background:var(--paper-raised)}
      .quality-step-rank{display:flex;align-items:center;gap:.4rem;font-size:.86rem;color:var(--muted);white-space:nowrap}
      .quality-step-rank .save-rank-icon{width:20px;height:auto;flex:none}
      @media (max-width:560px){.quality-steps{gap:.5rem}.quality-steps>div{padding:.7rem .75rem}.quality-step-rank{gap:.3rem;font-size:.8rem}.quality-step-rank .save-rank-icon{width:16px}}
      .quality-steps strong{font-size:1.3rem;color:var(--gold)}.quality-steps small{color:var(--muted)}
    `}</style>
  </section>;
}
