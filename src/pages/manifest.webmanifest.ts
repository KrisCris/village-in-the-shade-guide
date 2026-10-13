import type { APIRoute } from 'astro';
import { getI18n } from '../i18n/server';
import { withBase } from '../lib/sitePath';
import { THEME_COLORS } from '../lib/pwa';

// Mirrored under each language prefix; an installed app opens in the language it was installed from.
export const GET: APIRoute = ({ url }) => {
  const { t, href, lang } = getI18n(url);
  const icon = (src: string, size: number, purpose: 'any' | 'maskable') => ({ src: withBase(src), sizes: `${size}x${size}`, type: 'image/png', purpose });
  const manifest = {
    id: withBase('/'),
    name: t('静谧田园 Wiki'),
    short_name: t('静谧田园'),
    description: t('《静谧田园》（Village in the Shade）中文版数据 Wiki 与攻略'),
    lang,
    start_url: href('/'),
    scope: withBase('/'),
    display: 'standalone',
    background_color: THEME_COLORS.night,
    theme_color: THEME_COLORS.night,
    categories: ['games', 'reference', 'utilities'],
    icons: [
      icon('/app/icon-192.png', 192, 'any'),
      icon('/app/icon-512.png', 512, 'any'),
      icon('/app/maskable-192.png', 192, 'maskable'),
      icon('/app/maskable-512.png', 512, 'maskable'),
    ],
    shortcuts: [
      { name: t('资料库'), url: href('/data/') },
      { name: t('攻略'), url: href('/guides/') },
      { name: t('生产工作流'), url: href('/planner/workflow/') },
      { name: t('存档编辑器'), url: href('/save-editor/') },
    ].map((shortcut) => ({ ...shortcut, icons: [icon('/app/icon-96.png', 96, 'any')] })),
  };
  return new Response(JSON.stringify(manifest, null, 2), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' } });
};
