import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Native modal provides focus containment and keeps expanded controls out of page layout. */
export default function SaveDialog({ title, onClose, children, compact = false }: {
  title: string; onClose: () => void; children: ReactNode; compact?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className={`save-dialog${compact ? ' compact' : ''}`} aria-labelledby={heading}
    onKeyDownCapture={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    } }}>
    <header className="save-dialog-head"><h3 id={heading}>{title}</h3><button type="button" className="save-slot-close" aria-label="关闭弹窗" onClick={onClose}>×</button></header>
    <div className="save-dialog-body">{children}</div>
  </dialog>;
}
