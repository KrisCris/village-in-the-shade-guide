import { describe, expect, it } from 'vitest';
import { createTranslate } from '../../i18n/translate';
import { portraitLabel } from './portraitLabels';

// i18n-ignore-file — fixtures use the game's Japanese layer labels.
describe('portrait labels', () => {
  const zh = createTranslate('zh-CN', {});
  const ja = createTranslate('ja', {});

  it('translates known Japanese layer terms on Chinese pages', () => {
    expect(portraitLabel('chr_yuta_笑顔_L', zh, 'zh-CN')).toBe('笑脸');
    expect(portraitLabel('chr_yuta_腕組み_真顔', zh, 'zh-CN')).toBe('抱臂 · 严肃');
  });

  it('shows the game labels as-is on Japanese pages', () => {
    expect(portraitLabel('chr_yuta_腕組み_真顔_R', ja, 'ja')).toBe('腕組み · 真顔');
  });

  it('falls back to the neutral pose and keeps unknown terms', () => {
    expect(portraitLabel('chr_yuta', zh, 'zh-CN')).toBe('通常');
    expect(portraitLabel('chr_yuta', ja, 'ja')).toBe('通常');
    expect(portraitLabel('chr_yuta_未知', zh, 'zh-CN')).toBe('未知');
  });
});
