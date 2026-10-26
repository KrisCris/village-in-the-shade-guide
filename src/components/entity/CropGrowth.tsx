import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { withBase } from '../../lib/sitePath';
import { entityUrl } from '../../data/clientSearch';
import type { Entity } from '../../data/types';
import { SEASONS, seasonLabels, type CropGrowthModel, type GrowthBox, type GrowthSprite, type GrowthYield } from '../../domain/cropGrowth';
import { useI18n } from '../../i18n/react';

const percent = (value: number) => `${(value * 100).toFixed(3)}%`;
/** Native pixels of air kept around painted bounds. */
const PAD = 4;
const padded = ([left, top, right, bottom]: GrowthBox): GrowthBox => [left - PAD, top - PAD, right + PAD, bottom + PAD];

/**
 * A sprite drawn inside a frame given in ground coordinates. Stages that share a
 * frame keep their relative size and stand on the same ground line.
 */
function StageArt({ sprite, frame, alt, contain = false }: { sprite?: GrowthSprite; frame: GrowthBox; alt: string; contain?: boolean }) {
  const [left, top, right, bottom] = padded(frame);
  const width = right - left, height = bottom - top;
  const size: CSSProperties = contain ? (width >= height ? { width: '100%' } : { height: '100%' }) : {};
  return <span className="growth-art" style={{ aspectRatio: `${width} / ${height}`, '--ground': percent(-top / height), ...size } as CSSProperties}>
    {sprite && <img src={withBase(`/maps/farm/${sprite.file}`)} alt={alt} loading="lazy" decoding="async" draggable={false}
      style={{ left: percent((sprite.x - left) / width), top: percent((sprite.y - top) / height), width: percent(sprite.w / width), height: percent(sprite.h / height) }} />}
  </span>;
}

function Yields({ rows }: { rows: GrowthYield[] }) {
  if (!rows.length) return null;
  return <span className="growth-yields">{rows.map((row) => <span key={row.id}>
    {row.icon && <img src={withBase(row.icon)} alt="" width="20" height="20" loading="lazy" />}
    {row.name}{row.quantity ? ` ×${row.quantity}` : ''}
  </span>)}</span>;
}

/** Lanes wider than the page scroll sideways; only then are they a tab stop, with a fade on each side where stages are hidden. */
function ScrollLane({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ overflow: false, start: true, end: true });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setScroll({
      overflow: node.scrollWidth > node.clientWidth + 1,
      start: node.scrollLeft <= 1,
      end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 1,
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    node.addEventListener('scroll', measure, { passive: true });
    return () => { observer.disconnect(); node.removeEventListener('scroll', measure); };
  }, []);
  const fade = scroll.overflow ? [!scroll.start && 'start', !scroll.end && 'end'].filter(Boolean).join(' ') : '';
  return <div ref={ref} className="growth-scroll" data-fade={fade || undefined}
    {...(scroll.overflow ? { tabIndex: 0, role: 'region', 'aria-label': label } : {})}>{children}</div>;
}

const RegrowIcon = () => <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.2 8.4A5.2 5.2 0 1 1 11.6 4.3M12.3 1.6v3.1H9.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export default function CropGrowth({ growth, entity, onOpen }: { growth: CropGrowthModel; entity: Entity; onOpen?: (entity: Entity) => void }) {
  const { t, href } = useI18n();
  const [season, setSeason] = useState(growth.season);
  useEffect(() => setSeason(growth.season), [growth.crop.id, growth.season]);
  const crop = growth.crop;
  const pick = (art: GrowthSprite[]) => art[season] ?? art[0];
  const seasonName = (index: number) => t(seasonLabels[SEASONS[index]]);
  const sameDay = growth.lanes.some((lane) => lane.stages.some((stage, index) => index > 0 && !stage.gain));
  const [left, top, right, bottom] = padded(growth.frame);
  const frameWidth = right - left, frameHeight = bottom - top;
  // Every lane shares the column count and scale, so regrowth lines up under the first growth.
  const layout = {
    '--columns': Math.max(...growth.lanes.map((lane) => lane.stages.length)),
    '--aspect': (frameWidth / frameHeight).toFixed(4),
    '--ground': percent(-top / frameHeight),
    '--scene-max': `${Math.round(Math.min(220, Math.max(112, frameHeight * 1.2)))}px`,
  } as CSSProperties;
  const openCrop = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onOpen || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen({ id: crop.id, kind: crop.kind, icon_path: crop.icon, searchText: '', name: { zh_hans: crop.name, zh_hant: '', ja: '', internal: crop.id, aliases: [], review_status: '' } });
  };
  return <section className="crop-growth" style={layout}>
    <h2>{t('生长过程')}</h2>
    {entity.id !== crop.id && <a className="growth-crop" href={href(entityUrl(crop))} onClick={openCrop}>
      {crop.icon && <img src={withBase(crop.icon)} alt="" width="30" height="30" />}<span>{t('种下后长成{name}', { name: crop.name })}</span><span aria-hidden="true">→</span>
    </a>}

    {growth.grown && <div className="growth-block">
      <div className="growth-block-head"><h3>{t('长成后的样子')}</h3><span>{t('选一个季节，下面各阶段也换成那个季节')}</span></div>
      <div className="growth-season-picker" role="group" aria-label={t('季节')}>
        {growth.grown.art.map((sprite, index) => <button key={index} type="button" aria-pressed={season === index} onClick={() => setSeason(index)}
          aria-label={growth.bearing.includes(index) ? t('{season}（结果季）', { season: seasonName(index) }) : undefined}>
          <StageArt sprite={sprite} frame={growth.grown!.frame} alt="" />
          <span className="growth-season-name">{seasonName(index)}{growth.bearing.includes(index) && <span className="growth-tag">{t('结果季')}</span>}</span>
        </button>)}
      </div>
    </div>}

    {growth.lanes.map((lane, laneIndex) => <div className="growth-block" key={lane.key}>
      <div className="growth-block-head"><h3>{laneIndex > 0 && <RegrowIcon />}{lane.title}</h3><span>{t('共 {days} 天', { days: lane.days })}</span></div>
      <ScrollLane label={lane.title}><ol className="growth-track" style={{ '--count': lane.stages.length } as CSSProperties}>
        {lane.stages.map((stage, index) => <li key={index} className={`growth-step${stage.yields.length ? ' is-harvest' : ''}`}>
          <span className="growth-scene"><StageArt sprite={pick(stage.art)} frame={growth.frame} alt={`${crop.name} · ${stage.label}`} /></span>
          <span className="growth-axis" aria-hidden="true"><i /></span>
          {index > 0 && <span className={`growth-gain${stage.gain ? '' : ' is-same'}`}>{stage.gain ? t('+{days} 天', { days: stage.gain }) : t('同一天')}</span>}
          <span className="growth-text">
            <b>{stage.label}</b>
            {stage.points > 0 && <small>{t('成长点 {points}', { points: stage.points })}</small>}
            <Yields rows={stage.yields} />
            {stage.note && <small>{stage.note}</small>}
          </span>
        </li>)}
      </ol></ScrollLane>
    </div>)}

    {growth.looks.length > 0 && <div className="growth-block">
      <div className="growth-block-head"><h3>{t('其他状态')}</h3></div>
      <ul className="growth-looks">{growth.looks.map((look) => <li key={look.key}>
        <span className="growth-look-art"><StageArt sprite={pick(look.art)} frame={look.frame} alt={`${crop.name} · ${look.title}`} contain /></span>
        <span className="growth-text"><b>{look.title}</b>{look.note && <small>{look.note}</small>}<Yields rows={look.yields} /></span>
      </li>)}</ul>
    </div>}

    <p className="calculation-note">{t('天数按每天 100 成长点计算，与收益规划相同。')}{sameDay && ` ${t('标“同一天”的阶段与前一阶段同一天长到，前一个样子平时看不到。')}`}</p>
    <style>{`
      .crop-growth{container-type:inline-size;--sky:color-mix(in srgb,var(--paper-deep) 65%,var(--paper-raised));--soil:color-mix(in srgb,var(--gold) 24%,var(--paper-deep));--soil-deep:color-mix(in srgb,var(--gold) 34%,var(--paper-deep))}
      .growth-crop{display:inline-flex;align-items:center;gap:.5rem;margin:.1rem 0 .2rem;padding:.25rem .85rem .25rem .3rem;border:1px solid var(--border);border-radius:999px;background:var(--paper-raised);color:var(--ink);font-size:.86rem;text-decoration:none}
      .growth-crop:hover{border-color:var(--green);background:var(--green-soft)}.growth-crop img{object-fit:contain}.growth-crop span:last-child{color:var(--green)}
      .growth-block{margin-top:1.3rem}
      .growth-block-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:.2rem .7rem;margin-bottom:.65rem}.growth-block-head h3{display:flex;align-items:center;gap:.35rem;margin:0;font-size:1rem}.growth-block-head h3 svg{width:15px;height:15px;color:var(--green)}.growth-block-head>span{color:var(--muted);font-size:.8rem}
      .growth-art{position:relative;display:block;overflow:hidden}.growth-art img{position:absolute;max-width:none;user-select:none}
      .growth-tag{padding:.05rem .4rem;border-radius:4px;background:color-mix(in srgb,var(--gold) 16%,transparent);color:var(--gold);font-size:.72rem;font-weight:600}
      .growth-text{display:grid;justify-items:center;align-content:start;gap:.18rem;min-width:0;padding:0 .2rem;font-size:.78rem;line-height:1.4}.growth-text b{font-size:.88rem}.growth-text small{color:var(--muted);font-size:.72rem}
      .growth-yields{display:flex;flex-wrap:wrap;justify-content:inherit;gap:.25rem}.growth-yields>span{display:inline-flex;align-items:center;gap:.25rem;padding:.1rem .45rem .1rem .2rem;border-radius:999px;background:var(--green-soft);color:var(--ink);font-size:.74rem}.growth-yields img{object-fit:contain}

      .growth-season-picker{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.6rem}
      .growth-season-picker button{display:grid;gap:.4rem;min-height:0;padding:.35rem .35rem .5rem;border:1px solid var(--border);border-radius:12px;background:var(--paper-raised);color:var(--ink);font:inherit;text-align:left}
      .growth-season-picker button:hover{border-color:var(--green)}.growth-season-picker button[aria-pressed=true]{border-color:var(--green);background:var(--green-soft);box-shadow:0 0 0 1px var(--green)}
      .growth-season-picker button:focus-visible,.growth-crop:focus-visible{outline:2px solid var(--green);outline-offset:2px}
      .growth-season-picker .growth-art{border-radius:8px;background:linear-gradient(var(--sky) 0 var(--ground),var(--soil) 0,var(--soil-deep))}
      .growth-season-name{display:flex;align-items:center;justify-content:space-between;gap:.3rem;padding:0 .25rem;font-weight:600}

      .growth-scroll{overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scrollbar-width:thin;border-radius:12px}
      .growth-scroll[data-fade]{--fade-start:#000;--fade-end:#000;mask-image:linear-gradient(to right,var(--fade-start),#000 40px,#000 calc(100% - 40px),var(--fade-end));-webkit-mask-image:linear-gradient(to right,var(--fade-start),#000 40px,#000 calc(100% - 40px),var(--fade-end))}
      .growth-scroll[data-fade~=start]{--fade-start:transparent}.growth-scroll[data-fade~=end]{--fade-end:transparent}
      .growth-scroll:focus-visible{outline:2px solid var(--green);outline-offset:2px}
      .growth-track{--column:max(98px,calc(100cqi / var(--columns)));--scene:min(var(--scene-max),calc(var(--column) / var(--aspect)));position:relative;display:grid;grid-template-columns:repeat(var(--count),var(--column));width:max-content;margin:0;padding:0 0 .3rem;list-style:none}
      .growth-track::before{content:'';position:absolute;top:0;left:0;right:0;height:var(--scene);box-sizing:border-box;border:1px solid var(--border);border-radius:12px;background:linear-gradient(var(--sky) 0 var(--ground),var(--soil) 0,var(--soil-deep))}
      .growth-step{position:relative;display:grid;grid-template-rows:var(--scene) 30px auto;justify-items:center;min-width:0;margin:0;text-align:center;scroll-snap-align:start}
      .growth-scene{display:flex;justify-content:center;width:100%;height:var(--scene)}.growth-scene .growth-art{flex:none;width:calc(var(--scene) * var(--aspect))}
      .growth-axis{position:relative;align-self:stretch;justify-self:stretch}
      .growth-axis::before{content:'';position:absolute;top:50%;left:0;right:0;height:2px;margin-top:-1px;background:color-mix(in srgb,var(--green) 55%,transparent)}
      .growth-step:first-child .growth-axis::before{left:50%}.growth-step:last-child .growth-axis::before{right:50%}
      .growth-axis i{position:absolute;top:50%;left:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px var(--paper)}
      .is-harvest .growth-axis i{width:14px;height:14px;margin:-7px 0 0 -7px;background:var(--vermilion)}
      .growth-gain{position:absolute;z-index:1;top:calc(var(--scene) + 15px);left:0;transform:translate(-50%,-50%);padding:.05rem .5rem;border:1px solid color-mix(in srgb,var(--green) 45%,var(--border));border-radius:999px;background:var(--paper-raised);color:var(--green);font-size:.72rem;font-weight:700;white-space:nowrap}
      .growth-gain.is-same{border-color:var(--border);color:var(--muted);font-weight:400}

      .growth-looks{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.6rem;margin:0;padding:0;list-style:none}
      .growth-looks li{display:grid;grid-template-columns:64px minmax(0,1fr);align-items:center;gap:.7rem;margin:0;padding:.45rem .7rem .45rem .45rem;border:1px solid var(--border);border-radius:10px;background:var(--paper-raised)}
      .growth-looks .growth-text{justify-items:start;padding:0}.growth-looks .growth-yields{justify-content:flex-start}
      .growth-look-art{display:flex;align-items:center;justify-content:center;width:64px;height:64px;padding:4px;box-sizing:border-box;border-radius:8px;background:var(--paper-deep)}

      @container (max-width:540px){.growth-season-picker{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `}</style>
  </section>;
}
