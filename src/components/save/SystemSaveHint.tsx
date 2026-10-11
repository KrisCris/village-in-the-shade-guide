import { useRef, useState } from 'react';
import { decodeSave } from '../../lib/saveEditor';
import { SerDocument } from '../../lib/ser';
import { tr } from '../../i18n/active';
export default function SystemSaveHint() {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  return <details className="save-system-hint"><summary>{tr('如何确认当前使用哪个存档文件？')}</summary><p>{tr('可选择同目录的 .systemsave，查看三个游戏槽位当前对应的文件。')}</p><button type="button" onClick={() => input.current?.click()}>{tr('读取 .systemsave')}</button><input ref={input} hidden type="file" accept=".systemsave,application/octet-stream" onChange={async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const doc = new SerDocument(decodeSave(new Uint8Array(await file.arrayBuffer()), file.name).data);
      const node = doc.resolve('lastSaveDataIndex_');
      if (!node || node.size !== 12) throw new Error(tr('未找到有效的槽位索引，请选择 .systemsave 文件。'));
      const bytes = doc.payload(node), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const indices = Array.from({ length: 3 }, (_, index) => view.getUint32(index * 4, true));
      setText(indices.map((index, slot) => tr('槽位 {slot}：{file}', { slot: slot + 1, file: index < 5 ? `save.${String(index + 1).padStart(3, '0')}` : tr('尚无存档') })).join('　·　'));
    } catch (error) { setText(error instanceof Error ? error.message : tr('无法读取槽位索引。')); }
  }} />{text && <p role="status">{text}</p>}</details>;
}
