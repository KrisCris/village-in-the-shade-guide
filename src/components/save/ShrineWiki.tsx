import { useEffect, useState } from 'react';
import ShrinePanel from './ShrinePanel';
import { loadSaveNames, type SaveNameTables } from '../../lib/saveNames';
export default function ShrineWiki() {
  const [names, setNames] = useState<SaveNameTables>({});
  useEffect(() => { loadSaveNames().then(setNames); }, []);
  return <div className="save-progress"><ShrinePanel names={names} /></div>;
}
