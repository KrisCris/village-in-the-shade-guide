import { useSyncExternalStore } from 'react';

const KEY = 'village-quality-labels';
const EVENT = 'village-quality-labels-change';
let current: boolean | undefined;
function read() {
  if (current !== undefined) return current;
  try { return window.localStorage.getItem(KEY) === 'shown'; } catch { return false; }
}
function subscribe(notify: () => void) {
  const storage = () => { current = undefined; notify(); };
  window.addEventListener(EVENT, notify);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(EVENT, notify); window.removeEventListener('storage', storage); };
}
export function useQualityLabels(): [boolean, (shown: boolean) => void] {
  const shown = useSyncExternalStore(subscribe, read, () => false);
  return [shown, next => {
    current = next;
    try { window.localStorage.setItem(KEY, next ? 'shown' : 'hidden'); } catch { /* Session preference still works. */ }
    window.dispatchEvent(new Event(EVENT));
  }];
}
