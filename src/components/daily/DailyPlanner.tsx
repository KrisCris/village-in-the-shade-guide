import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { I18nProvider } from '../../i18n/react';
import type { Locale } from '../../i18n/locales';
import SaveFilePicker from '../save/SaveFilePicker';
import SystemSaveHint from '../save/SystemSaveHint';
import { loadSaveNames, type SaveNameTables } from '../../lib/saveNames';
import { addToFarmArea, emptyFarmArea, learnFarmArea, readFarmArea, removeFromFarmArea, writeFarmArea, type FarmArea } from '../../lib/farmArea';
import { readDailySession, writeDailySession } from '../../lib/dailySession';
import type { DailySnapshot } from '../../lib/saveDaily';
import type { SerDocument } from '../../lib/ser';
import type { SaveIdentity } from '../../lib/saveSession';
import { tr } from '../../i18n/active';

// The save parser, item names, the daily rules and the map load only after a save is chosen.
const DailyReport = lazy(() => import('./DailyReport'));

const browserStorage = () => { try { return window.localStorage; } catch { return undefined; } };
const tabStorage = () => { try { return window.sessionStorage; } catch { return undefined; } };

export default function DailyPlanner({ locale }: { locale?: Locale }) {
  return <I18nProvider locale={locale}><Daily /></I18nProvider>;
}

function Daily() {
  // Like the save editor, a refresh reopens the save this tab last read.
  const [saved] = useState(() => readDailySession(tabStorage()));
  const [loaded, setLoaded] = useState<{ doc: SerDocument; snapshot: DailySnapshot } | null>(null);
  const [area, setArea] = useState<FarmArea>(emptyFarmArea);
  const [names, setNames] = useState<SaveNameTables>({});
  const [busy, setBusy] = useState(saved !== null), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0), shown = useRef(0);

  useEffect(() => {
    if (saved) open(saved.name, async () => (await import('../../lib/saveSession')).restoreOriginal(saved), true);
  }, []);

  const loadFile = (file: File) => open(file.name, async () => new Uint8Array(await file.arrayBuffer()));

  /** A restored save is already stored; a chosen one is stored after it shows. */
  async function open(name: string, read: () => Promise<Uint8Array>, restored = false) {
    const current = ++generation.current;
    setBusy(true);
    setError('');
    setNotice(tr('正在读取存档…'));
    loadSaveNames().then(setNames);
    try {
      const bytes = await read();
      const { readDailySave } = await import('../../lib/saveDaily');
      const result = readDailySave(bytes, name);
      if (current !== generation.current) return;
      const storage = browserStorage(), player = result.snapshot.player;
      const learned = learnFarmArea(readFarmArea(storage, player) ?? emptyFarmArea(), result.snapshot.cells);
      setStorageFailed(!writeFarmArea(storage, player, learned));
      setArea(learned);
      setLoaded(result);
      shown.current = current;
      setNotice('');
      if (!restored) remember(bytes, name, current);
    } catch (caught) {
      if (current !== generation.current) return;
      if (restored) writeDailySession(tabStorage(), null);
      setError(caught instanceof Error ? caught.message : tr('无法解析这个存档。'));
      setNotice('');
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }

  async function remember(bytes: Uint8Array, name: string, current: number) {
    let stored: SaveIdentity | null = null;
    try {
      const { identifySave, storeOriginal } = await import('../../lib/saveSession');
      const identity = await identifySave(bytes, name);
      await storeOriginal(identity, bytes);
      stored = identity;
    } catch { /* Storage may be disabled or full; the planner still works, and a refresh asks for the file again. */ }
    // Point the tab at the save on screen, never at an earlier one.
    if (shown.current === current) writeDailySession(tabStorage(), stored);
  }

  function changeArea(next: FarmArea) {
    setArea(next);
    if (loaded) setStorageFailed(!writeFarmArea(browserStorage(), loaded.snapshot.player, next));
  }

  return <section className="daily-planner" aria-label={tr('每日规划')}>
    <input ref={fileInput} hidden type="file" disabled={busy} accept=".001,.002,.003,.004,.005,application/octet-stream"
      onChange={async (event) => { const file = event.target.files?.[0]; if (file) await loadFile(file); event.target.value = ''; }} />
    {!loaded && <>
      <SaveFilePicker disabled={busy} onChoose={() => fileInput.current?.click()} onFile={loadFile} onNotice={setNotice} onError={setError} />
      <SystemSaveHint />
    </>}
    {busy && <p className="save-status" role="status">{notice}</p>}
    {!busy && notice && <p className="save-status success" role="status">{notice}</p>}
    {error && <p className="save-status error" role="alert">{error}</p>}
    {loaded && <Suspense fallback={<p className="save-loading" role="status">{tr('正在整理今天的安排…')}</p>}>
      <DailyReport doc={loaded.doc} snapshot={loaded.snapshot} names={names} area={area} storageFailed={storageFailed}
        onAdd={(cells) => changeArea(addToFarmArea(area, cells))}
        onRemove={(cells) => changeArea(removeFromFarmArea(area, cells))}
        onSwitch={() => fileInput.current?.click()} />
    </Suspense>}
  </section>;
}
