import { useState } from 'react';
import { transformHairPixel } from '../../lib/saveAppearance';
import SaveDialog from './SaveDialog';

export default function HairColorPicker({ value, onChange }: { value: number[]; onChange: (axis: number, value: number) => void }) {
  const [open, setOpen] = useState(false);
  // Blonde highlight sampled from the game's hair atlas, before its HSV shader.
  const swatch = `rgb(${transformHairPixel([231, 211, 134], value).join(' ')})`;
  return <div className="save-color-picker">
    <span>发色</span>
    <button type="button" className="save-hair-trigger" onClick={() => setOpen(true)} aria-label="调整发色">
      <span className="save-hair-swatch" style={{ background: swatch }} />调整发色
    </button>
    {open && <SaveDialog title="调整发色" compact onClose={() => setOpen(false)}>
      <div className="save-hair-controls"><div className="save-color-preview"><span style={{ background: `linear-gradient(135deg, rgb(${transformHairPixel([229, 228, 150], value).join(' ')}), ${swatch} 45%, rgb(${transformHairPixel([186, 161, 101], value).join(' ')}))` }} /><small>当前发色</small></div>
        {['色调', '饱和度', '明暗'].map((label, axis) => <label key={label}><span>{label}</span>
          <input aria-label={`发色${label}`} type="range" min={0} max={1} step={0.001} value={value[axis]} onChange={event => onChange(axis, Number(event.target.value))} />
        </label>)}
        <button type="button" onClick={() => [0, 1, 1].forEach((v, i) => onChange(i, v))}>恢复原始金色</button>
        <small>发色修改会同时应用于前、后发型。</small>
      </div>
    </SaveDialog>}
  </div>;
}
