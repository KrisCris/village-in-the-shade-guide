/** Installable-app support: service worker, browser theme colour and the install prompt. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const THEME_COLORS = { day: '#ece8db', night: '#14251f' } as const;

let deferredPrompt: InstallPromptEvent | null = null;

function setInstallable(value: boolean) {
  const root = document.documentElement;
  if (value) root.dataset.installable = 'true';
  else delete root.dataset.installable;
  window.dispatchEvent(new Event('app-installable-change'));
}

export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iOS Safari has no install prompt; players add the site from the share sheet. */
export function needsManualInstall() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone();
}

export function canPromptInstall() {
  return deferredPrompt !== null;
}

export async function promptInstall() {
  const event = deferredPrompt;
  if (!event) return false;
  deferredPrompt = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  setInstallable(false);
  return outcome === 'accepted';
}

/** Runs once per full page load; Astro view transitions keep it alive. */
export function registerApp() {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  const syncThemeColor = () => meta?.setAttribute('content', root.dataset.theme === 'night' ? THEME_COLORS.night : THEME_COLORS.day);
  syncThemeColor();
  new MutationObserver(syncThemeColor).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    setInstallable(true);
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setInstallable(false);
  });

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const register = () => navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
    // The site works without offline support.
  });
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
