import { lazy, Suspense, useRef, useState } from 'react';
import { I18nProvider } from '../../i18n/react';
import type { Locale } from '../../i18n/locales';
import SaveFilePicker from '../save/SaveFilePicker';
import SystemSaveHint from '../save/SystemSaveHint';
import { loadSaveNames, type SaveNameTables } from '../../lib/saveNames';
import { addToFarmArea, emptyFarmArea, learnFarmArea, readFarmArea, removeFromFarmArea, writeFarmArea, type FarmArea } from '../../lib/farmArea';
import type { DailySnapshot } from '../../lib/saveDaily';
import type { SerDocument } from '../../lib/ser';
import { tr } from '../../i18n/active';

// The save parser, item names, the daily rules and the map load only after a save is chosen.
const DailyReport = lazy(() => import('./DailyReport'));

const browserStorage = () => { try { return window.localStorage; } catch { return undefined; } };

export default function DailyPlanner({ locale }: { locale?: Locale }) {
  return <I18nProvider locale={locale}><Daily /></I18nProvider>;
}

function Daily() {
  const [loaded, setLoaded] = useState<{ doc: SerDocument; snapshot: DailySnapshot } | null>(null);
  const [area, setArea] = useState<FarmArea>(emptyFarmArea);
  const [names, setNames] = useState<SaveNameTables>({});
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);

  async function loadFile(file: File) {
    const current = ++generation.current;
    setBusy(true);
    setError('');
    setNotice(tr('正在读取存档…'));
    loadSaveNames().then(setNames);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { readDailySave } = await import('../../lib/saveDaily');
      const result = readDailySave(bytes, file.name);
      if (current !== generation.current) return;
      const storage = browserStorage(), player = result.snapshot.player;
      const learned = learnFarmArea(readFarmArea(storage, player) ?? emptyFarmArea(), result.snapshot.cells);
      setStorageFailed(!writeFarmArea(storage, player, learned));
      setArea(learned);
      setLoaded(result);
      setNotice('');
    } catch (caught) {
      if (current !== generation.current) return;
      setError(caught instanceof Error ? caught.message : tr('无法解析这个存档。'));
      setNotice('');
    } finally {
      if (current === generation.current) setBusy(false);
    }
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
