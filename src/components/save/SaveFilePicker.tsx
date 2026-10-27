import { useState } from 'react';
import { tr } from '../../i18n/active';

export const SAVE_FOLDER = '%APPDATA%\\Nippon Ichi Software, Inc\\Honogurashinoniwa\\';

/** The slot-save drop zone shared by the save editor and the daily view. The parent owns the file input. */
export default function SaveFilePicker({ disabled, onChoose, onFile, onNotice, onError }: {
  disabled?: boolean;
  onChoose: () => void;
  onFile: (file: File) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return <div className={`save-dropzone${dragging ? ' is-dragging' : ''}`}
    onDragOver={(event) => { if (disabled || !event.dataTransfer.types.includes('Files')) return; event.preventDefault(); setDragging(true); }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={(event) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files[0];
      if (file && !disabled) onFile(file);
    }}>
    <div className="save-file-label">
      <span className="save-file-icon" aria-hidden="true">↑</span>
      <span>
        <button type="button" disabled={disabled} onClick={onChoose}>{tr('选择游戏存档')}</button>
        <small>{tr('save.001–save.005，也可以把文件拖到这里')}</small>
      </span>
    </div>
    <div className="save-location">
      <span>{tr('Steam 存档位置')}</span>
      <code>{SAVE_FOLDER}</code>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(SAVE_FOLDER); onNotice(tr('已复制存档目录。')); } catch { onError(tr('复制失败，请手动复制上面的目录。')); } }}>{tr('复制路径')}</button>
      <small>{tr('网页不能直接打开这个目录。点“选择游戏存档”后，把路径粘贴到文件窗口的地址栏，再进入以数字命名的 Steam ID 文件夹。')}</small>
    </div>
  </div>;
}
