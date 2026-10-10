import { useEffect, useState } from 'react';
import ShrinePanel from './ShrinePanel';
import { loadSaveNames, type SaveNameTables } from '../../lib/saveNames';
import { I18nProvider } from '../../i18n/react';
import type { Locale } from '../../i18n/locales';

export default function ShrineWiki({ locale }: { locale?: Locale }) {
  return <I18nProvider locale={locale}><ShrineNames /></I18nProvider>;
}

function ShrineNames() {
  const [names, setNames] = useState<SaveNameTables>({});
  useEffect(() => { loadSaveNames().then(setNames); }, []);
  return <div className="save-progress"><ShrinePanel names={names} /></div>;
}
