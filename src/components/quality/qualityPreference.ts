import { useEffect, useState } from 'react';
import { parseQuality, type Quality } from '../../domain/quality';

const STORAGE_KEY = 'village-quality';
const QUALITY_EVENT = 'village-quality-change';
const URL_BASE = 'https://village-quality.local';

export function readQuality(search: string, storageValue: string | null): Quality {
  const urlQuality = new URLSearchParams(search).get('quality');
  return urlQuality === null ? parseQuality(storageValue) : parseQuality(urlQuality);
}

export function writeQualityToUrl(url: string, quality: Quality): string {
  const absolute = new URL(url, URL_BASE);
  if (quality === 'normal') {
    absolute.searchParams.delete('quality');
  } else {
    absolute.searchParams.set('quality', quality);
  }

  return absolute.origin === URL_BASE ? `${absolute.pathname}${absolute.search}${absolute.hash}` : absolute.toString();
}

function initialQuality(): Quality {
  if (typeof window === 'undefined') return 'normal';
  return readQuality(window.location.search, window.localStorage.getItem(STORAGE_KEY));
}

export function useQuality(): [Quality, (next: Quality) => void] {
  const [quality, setQuality] = useState<Quality>('normal');

  useEffect(() => {
    setQuality(initialQuality());
    const onQualityChange = (event: Event) => {
      setQuality(parseQuality((event as CustomEvent<string>).detail));
    };
    window.addEventListener(QUALITY_EVENT, onQualityChange);
    return () => window.removeEventListener(QUALITY_EVENT, onQualityChange);
  }, []);

  const updateQuality = (next: Quality) => {
    const parsed = parseQuality(next);
    window.localStorage.setItem(STORAGE_KEY, parsed);
    window.history.replaceState(null, '', writeQualityToUrl(window.location.href, parsed));
    setQuality(parsed);
    window.dispatchEvent(new CustomEvent<Quality>(QUALITY_EVENT, { detail: parsed }));
  };

  return [quality, updateQuality];
}
