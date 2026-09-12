import { useEffect, useMemo, useRef, useState } from 'react';
import { identifySave, readSession, restoreOriginal, SESSION_KEY, storeOriginal, type SaveIdentity } from '../../lib/saveSession';
import { decodeSave } from '../../lib/saveEditor';
import {
  exportSave,
  parseSaveModel,
  pendingChanges,
  type SaveField,
  type SaveModel,
  type SaveSectionId,
} from '../../lib/saveModel';
import type { SaveSlot, SlotAssignment, SlotEdits } from '../../lib/saveItems';
import { loadSaveNames, lookupName, type SaveNameTables } from '../../lib/saveNames';
import { itemLabel } from './ItemGrid';
import ItemsPanel from './ItemsPanel';
import SystemSaveHint from './SystemSaveHint';
import QuestsPanel from './QuestsPanel';
import AnimalsPanel from './AnimalsPanel';
import { animalEditCount, type AnimalEdits } from '../../lib/saveAnimals';
import type { MachineEdits, MachineEdit } from '../../lib/saveMachines';
import RawTree from './RawTree';
import ProgressPanel from './ProgressPanel';
import { progressCount, PROGRESSION, type ProgressEdits } from '../../lib/saveProgress';
import { UNLOCKS } from '../../lib/saveDeliveries';
import SaveDialog from './SaveDialog';
import SaveDataTable from './SaveDataTable';
import SaveFieldTable from './SaveFieldTable';
import AppearancePanel from './AppearancePanel';
import StatusPanel from './StatusPanel';
import { TOOLS, TOOL_RANGE_FIELDS, undoToolDraft } from '../../lib/saveTools';
import { achievementWarnings } from '../../lib/saveValidation';

interface StructuralLine {
  key: number;
  label: string;
  text: string;
}

/** One line per slot that is being filled or emptied, for the change list. */
function slotStructuralSummaries(model: SaveModel, slotEdits: SlotEdits, names: SaveNameTables): StructuralLine[] {
  const show = (itemId: string, count: string): string => `${itemLabel(names, itemId)} ×${count}`;
  const lines: StructuralLine[] = [];
  for (const container of model.containers) {
    for (const slot of container.slots) {
      if (!Object.prototype.hasOwnProperty.call(slotEdits, slot.pointer)) continue;
      const assignment = slotEdits[slot.pointer];
      const before = slot.item ? show(slot.item.itemId, slot.item.count) : '空';
      lines.push({
        key: slot.pointer,
        label: `${container.title} 第 ${slot.index + 1} 格`,
        text: `${before} → ${assignment ? show(assignment.itemId, assignment.count) : '清空'}`,
      });
    }
  }
  return lines;
}

/** The slot number is the extension, so the marker goes on the end: the user
 *  drops `.edited` to put the file back as `save.00N`. */
function downloadName(name: string): string {
  return `${name}.edited`;
}

export default function SaveEditor() {
  const [model, setModel] = useState<SaveModel | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [slotEdits, setSlotEdits] = useState<SlotEdits>({});
  const [animals, setAnimals] = useState<AnimalEdits>({});
  const [machines, setMachines] = useState<MachineEdits>({});
  const [progress, setProgress] = useState<ProgressEdits>({});
  const [names, setNames] = useState<SaveNameTables>({});
  const [tab, setTab] = useState<SaveSectionId>('basic');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [identity, setIdentity] = useState<SaveIdentity | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [storageError, setStorageError] = useState('');
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const loadGeneration = useRef(0);

  useEffect(() => { loadSaveNames().then(setNames); }, []);
  useEffect(() => {
    let cancelled = false;
    const generation = loadGeneration.current;
    (async () => {
      try {
        const session = readSession(sessionStorage);
        if (!session) return;
        const bytes = await restoreOriginal(session.identity);
        if (cancelled || generation !== loadGeneration.current) return;
        const parsed = parseSaveModel(decodeSave(bytes, session.identity.name));
        // Check every saved address before exposing the draft for export.
        pendingChanges(parsed, session.drafts);
        const slots = new Set(parsed.containers.flatMap(container => container.slots.map(slot => slot.pointer)));
        if (Object.keys(session.slots).some(offset => !slots.has(Number(offset)))) throw new Error('暂存草稿中的格子已无法匹配，请重新选择原始存档。');
        setModel(parsed); setIdentity(session.identity); setDrafts(session.drafts);
        setSlotEdits(session.slots); setProgress(session.progress ?? {}); setMachines(session.machines ?? {}); setAnimals(session.animals ?? {}); setTab(session.tab); setNotice('已恢复本次浏览会话的存档和未导出修改。');
      } catch (caught) {
        if (!cancelled) setStorageError(caught instanceof Error ? caught.message : '无法恢复暂存草稿。');
      } finally { if (!cancelled) setRestoring(false); }
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!model || !identity || restoring) return;
    const persist = () => {
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ version: 2, identity, drafts, slots: slotEdits, progress, machines, animals, tab }));
        setStorageError('');
      } catch { setStorageError('浏览器无法暂存草稿；离开前请导出修改副本。'); }
    };
    persist();
    window.addEventListener('pagehide', persist);
    return () => window.removeEventListener('pagehide', persist);
  }, [model, identity, drafts, slotEdits, progress, machines, animals, tab, restoring]);

  const changeState = useMemo(() => {
    if (!model) return { changes: [], error: '' };
    try {
      return { changes: pendingChanges(model, drafts), error: '' };
    } catch (caught) {
      return { changes: [], error: caught instanceof Error ? caught.message : '草稿中存在无效修改。' };
    }
  }, [model, drafts]);
  const changes = changeState.changes;
  const linkedRanges = useMemo(() => {
    const offsets = new Set<number>();
    if (!model) return offsets;
    for (const container of model.containers.filter(container => container.kind === 'tool')) for (const { item } of container.slots) {
      if (!item || drafts[item.itemIdOffset] === undefined || drafts[item.itemIdOffset] === item.itemId) continue;
      const tool = TOOLS.find(tool => String(tool.itemId) === item.itemId);
      const path = tool && TOOL_RANGE_FIELDS[tool.family];
      const range = path && model.doc.resolve(`pPlayerStatus_/p/${path}`);
      if (range) offsets.add(range.offset);
    }
    return offsets;
  }, [model, drafts]);
  const reviewChanges = changes.filter(change => !linkedRanges.has(change.field.offset));

  const slotEditCount = Object.keys(slotEdits).length;
  const progressEditCount = progressCount(progress);
  const editCount = reviewChanges.length + slotEditCount + progressEditCount + Object.keys(machines).length + animalEditCount(animals);
  function updateMachine(key: string, value?: MachineEdit) { setMachines(current => { const next = { ...current }; if (value) next[key] = value; else delete next[key]; return next; }); }
  function updateProgress(group: keyof ProgressEdits, id: string, value: boolean | number | undefined) {
    setProgress(current => {
      if (group === 'deliveries') {
        const entries = { ...current.deliveries };
        if (value === undefined) delete entries[id]; else if (typeof value === 'number') entries[id] = value;
        return { ...current, deliveries: entries };
      }
      const entries = { ...current[group] };
      if (value === undefined) delete entries[id]; else if (typeof value === 'boolean') entries[id] = value;
      return { ...current, [group]: entries };
    });
  }
  const risks = model ? achievementWarnings(model, changes, slotEdits) : [];
  if (progressEditCount) risks.push('收集、配方及技能解锁可能推进游戏进度或永久解锁成就。');
  useEffect(() => setRiskAcknowledged(false), [drafts, slotEdits, progress]);

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    loadGeneration.current++;
    setBusy(true);
    setError('');
    setNotice('正在读取存档…');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = parseSaveModel(decodeSave(bytes, file.name));
      if (parsed.doc.root.name !== 'SAVEDATA') throw new Error('请选择 save.001–save.005 槽位存档。');
      let nextIdentity: SaveIdentity | null = null;
      try {
        nextIdentity = await identifySave(bytes, file.name);
        await storeOriginal(nextIdentity, bytes);
        setStorageError('');
      } catch {
        nextIdentity = null;
        setStorageError('浏览器无法暂存原始文件；离开前请导出修改副本。');
        try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage may be disabled. */ }
      }
      setIdentity(nextIdentity);
      setModel(parsed);
      setDrafts({});
      setSlotEdits({});
      setProgress({});
      setMachines({});
      setAnimals({});
      setTab('basic');
      setNotice(`已读取 ${file.name}。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法解析这个存档。');
      setNotice('');
    } finally {
      setBusy(false);
    }
  }

  function updateField(field: SaveField, value: string) {
    setDrafts((current) => ({ ...current, [field.offset]: value }));
    setError('');
  }

  function updateDraft(offset: number, value: string) {
    setDrafts((current) => ({ ...current, [offset]: value }));
    setError('');
  }

  /**
   * Assign an item to a slot, empty it (`null`), or revert it (`undefined`).
   * Either way the slot stops being described by its leaf drafts — the node
   * they addressed is replaced wholesale — so those drafts are dropped.
   */
  function updateSlot(slot: SaveSlot, value: SlotAssignment | null | undefined) {
    setError('');
    setSlotEdits((current) => {
      const next = { ...current };
      if (value === undefined) delete next[slot.pointer];
      else next[slot.pointer] = value;
      return next;
    });
    const item = slot.item;
    if (!item) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const offset of [item.itemIdOffset, item.countOffset, item.rankOffset, item.qualityOffset]) {
        delete next[offset];
      }
      return next;
    });
  }

  function onDownload() {
    if (!model || !editCount) return;
    if (changeState.error) { setError(changeState.error); return; }
    if (risks.length && !riskAcknowledged) { setError('请先阅读并确认成就风险提示。'); return; }
    setBusy(true);
    setError('');
    setNotice('正在生成修改副本…');
    try {
      const packed = exportSave(model, changes, slotEdits, progress, machines, animals);
      const url = URL.createObjectURL(new Blob([packed.buffer as ArrayBuffer], { type: 'application/octet-stream' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = downloadName(model.save.fileName);
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(`已导出 ${editCount} 处修改；上传的文件本身没有被改动。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '重新打包失败。');
      setNotice('');
    } finally {
      setBusy(false);
    }
  }

  const section = model?.sections.find((entry) => entry.id === tab);

  return <section className="save-editor" aria-label="游戏存档编辑器">
    <div className={`save-dropzone${model ? ' loaded' : ''}`}>
      <label className="save-file-label">
        <span className="save-file-icon" aria-hidden="true">↑</span>
        <span>
          <strong>选择游戏存档</strong>
          <small>save.001–save.005；文件只在浏览器里处理，不会上传</small>
        </span>
        <input type="file" disabled={busy || restoring} accept=".001,.002,.003,.004,.005,application/octet-stream" onChange={onFileChange} />
      </label>
    </div>
    <SystemSaveHint />
    {busy && <p className="save-status" role="status">{notice}</p>}
    {!busy && notice && <p className="save-status success" role="status">{notice}</p>}
    {error && <p className="save-status error" role="alert">{error}</p>}
    {changeState.error && <p className="save-status error" role="alert">{changeState.error}</p>}
    {storageError && <p className="save-status error" role="alert">{storageError}</p>}

    {model && <>
      <div className="save-editor-intro">
        <div>
          <p className="eyebrow">{model.save.fileName} · 本地编辑</p>
          <h2>编辑存档</h2>
        </div>
        <button
          type="button"
          className="save-download"
          disabled={!editCount || busy}
          onClick={() => setReviewing(true)}
        >
          {editCount ? `导出 ${editCount} 处修改 ↓` : '导出修改副本 ↓'}
        </button>
      </div>

      <div className="save-notice-grid">{model.summary.filter(line => !line.startsWith('SER')).map((line) => <p key={line}>{line}</p>)}</div>
      {reviewing && <SaveDialog title="检查并导出修改" onClose={() => setReviewing(false)}>
      {risks.length > 0 && <div className="save-risk-notice">
        {risks.map(risk => <p key={risk}>{risk}</p>)}
        <label><input type="checkbox" checked={riskAcknowledged} onChange={event => setRiskAcknowledged(event.target.checked)} />我了解：游戏加载后可能永久解锁 Steam 成就，仍要导出。</label>
      </div>}

      <div className="save-changes">
        <p>待写入的修改（{editCount}）</p>
        <ul>
          {animalEditCount(animals) > 0 && <li><b>动物安置</b><span>{Object.keys(animals.moves ?? {}).length} 处移动，{Object.keys(animals.added ?? {}).length} 只新增</span><button type="button" onClick={() => setAnimals({})}>撤销安置修改</button></li>}
          {Object.entries(machines).map(([key, edit]) => <li key={key}><b>加工栏位 {Number(key.split('/')[1]) + 1}</b><span>{edit.recipeId !== undefined ? '加入加工任务' : '已有任务'} → {edit.finish ? '立即完成' : '开始计时'}</span><button type="button" onClick={() => updateMachine(key)}>撤销</button></li>)}
          {Object.entries(progress).flatMap(([group, entries]) => Object.entries(entries ?? {}).map(([id, enabled]) => <li key={`${group}-${id}`}>
            <b>{group === 'encyclopedia' ? '图鉴' : group === 'skills' ? '技能' : group === 'deliveries' ? '交付' : '解锁'}</b>
            <span>{group === 'deliveries' ? `${UNLOCKS.bundles.find(b => b.id === Number(id.split(':')[0]))?.name} · ${itemLabel(names, String(UNLOCKS.bundles.find(b => b.id === Number(id.split(':')[0]))?.items[Number(id.split(':')[1])]?.itemId))}` : group === 'encyclopedia' ? itemLabel(names, id) : group === 'skills' ? PROGRESSION.skills.find(skill => String(skill.id) === id)?.name : Number(id) === UNLOCKS.catalogFlag ? '村长家的交付目录' : UNLOCKS.nodes.find(n => String(n.flag) === id)?.name ?? PROGRESSION.flags.find(flag => String(flag.id) === id)?.name} → {group === 'deliveries' ? `已交付 ${enabled} 件` : enabled ? '已解锁' : '未解锁'}</span>
            <button type="button" onClick={() => updateProgress(group as keyof ProgressEdits, id, undefined)}>撤销</button>
          </li>))}
          {slotStructuralSummaries(model, slotEdits, names).map((line) => <li key={line.key}>
            <b>{line.label}</b>
            <span className="save-change-arrow">{line.text}</span>
            <button type="button" onClick={() => setSlotEdits(current => { const next = { ...current }; delete next[line.key]; return next; })}>撤销</button>
          </li>)}
          {reviewChanges.map((change) => <li key={change.field.offset}>
            <b>{change.field.label}</b>
            <span className="save-change-arrow">{lookupName(names, change.field.lookup, change.before) ?? (change.before || '（空）')} → {lookupName(names, change.field.lookup, change.after) ?? (change.after || '（空）')}</span>
            <button type="button" onClick={() => setDrafts(current => undoToolDraft(model, current, change.field.offset))}>撤销</button>
          </li>)}
        </ul>
      </div>

        <div className="save-review-actions"><button type="button" onClick={() => setReviewing(false)}>继续编辑</button><button type="button" className="save-download" disabled={busy || !editCount || (risks.length > 0 && !riskAcknowledged)} onClick={onDownload}>下载修改副本 ↓</button></div>
        {error && <p role="alert" className="save-status error">{error}</p>}
      </SaveDialog>}

      <nav className="save-tabs" aria-label="存档字段分类">
        {model.sections.map((entry) => <button
          type="button"
          key={entry.id}
          className={tab === entry.id ? 'active' : ''}
          onClick={() => setTab(entry.id)}
        >{entry.label}</button>)}
        <button type="button" className={tab === 'quests' ? 'active' : ''} onClick={() => setTab('quests')}>任务</button>
        <button type="button" className={tab === 'progress' ? 'active' : ''} onClick={() => setTab('progress')}>收集与解锁</button>
        <button type="button" className={tab === 'raw' ? 'active' : ''} onClick={() => setTab('raw')}>完整字段树</button>
      </nav>

      {tab === 'quests' ? <QuestsPanel model={model} drafts={drafts} onChange={updateField} /> : tab === 'progress' ? <ProgressPanel model={model} edits={progress} names={names} onChange={updateProgress} onReplace={setProgress} /> : tab === 'raw'
        ? <RawTree model={model} doc={model.doc} drafts={drafts} names={names} onChange={updateField} />
        : tab === 'barn' ? <AnimalsPanel model={model} drafts={drafts} names={names} edits={animals} onEdit={setAnimals} onField={updateField} />
        : tab === 'items'
        ? <>
          <p className="save-tab-description">{section?.description}</p>
          <ItemsPanel
            model={model}
            machines={machines}
            onMachine={updateMachine}
            drafts={drafts}
            slotEdits={slotEdits}
            names={names}
            onSlotEdit={updateSlot}
            onDraft={updateDraft}
          />
        </>
        : section && <>
          <p className="save-tab-description">{section.description}</p>
          {tab === 'player' && <StatusPanel model={model} drafts={drafts} onChange={updateField} />}
          <SaveFieldTable groups={section.groups.filter(group => tab !== 'player' || !['外观', '状态', '工具范围等级'].includes(group.title))} drafts={drafts} names={names} onChange={updateField} />
          {tab === 'player' && <AppearancePanel model={model} drafts={drafts} names={names} onChange={updateField} progress={progress} onUnlock={id => updateProgress('flags', String(id), true)} />}
          {section.tables.map((table) => <SaveDataTable
            key={table.id}
            table={table}
            drafts={drafts}
            names={names}
            onChange={updateField}
          />)}
          {section.groups.length === 0 && section.tables.length === 0
            && <p className="save-tab-empty">这个存档里没有这一类字段。</p>}
        </>}
    </>}

    {!model && !error && <div className="save-empty">
      <p>选择存档后即可开始编辑。</p>
    </div>}
  </section>;
}
