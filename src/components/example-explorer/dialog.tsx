'use client';

import { useEffect, useRef, useState } from 'react';
import { resolveExample, type ExampleDefinition, type ExampleRequest } from '../../example-explorer/index.js';
import { CodeIcon, ExampleIcon, OpenIcon, ReloadIcon } from './icons.js';

type Props = {
  id: string;
  examples: readonly ExampleDefinition[];
  choices: readonly ExampleDefinition[];
  request: ExampleRequest;
  onNavigate: (request: ExampleRequest) => void;
  onClose: () => void;
};

let locks = 0;
let restoreScroll = () => {};
function lockScroll() {
  if (locks++ === 0) {
    const root = document.documentElement;
    const overflow = root.style.overflow;
    const gutter = root.style.scrollbarGutter;
    if (window.innerWidth > root.clientWidth) root.style.scrollbarGutter = 'stable';
    root.style.overflow = 'hidden';
    restoreScroll = () => { root.style.overflow = overflow; root.style.scrollbarGutter = gutter; };
  }
  return () => { if (--locks === 0) restoreScroll(); };
}

export default function ExampleDialog({ id, examples, choices, request, onNavigate, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pressedBackdrop = useRef(false);
  const [attempt, setAttempt] = useState(0);
  let selected: ReturnType<typeof resolveExample> | undefined;
  let error = '';
  try { selected = resolveExample(examples, request); }
  catch (issue) { error = issue instanceof Error ? issue.message : 'Chưa mở được example.'; }

  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockScroll();
    element.showModal(); // Native top layer: no portal, layout resize, custom inert, or focus-trap dependency.
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      unlock();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const outside = (x: number, y: number) => {
    const rect = dialog.current!.getBoundingClientRect();
    return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
  };

  return <dialog ref={dialog} id={id} className="example-dialog" aria-modal="true"
    aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onPointerDown={event => { pressedBackdrop.current = event.target === event.currentTarget && outside(event.clientX, event.clientY); }}
    onClick={event => {
      if (pressedBackdrop.current && event.target === event.currentTarget && outside(event.clientX, event.clientY)) onClose();
      pressedBackdrop.current = false;
    }}>
    <h2 id={`${id}-title`} className="example-sr-only">Example: {selected?.example.title ?? request.example}</h2>
    <p id={`${id}-description`} className="example-sr-only">Chọn ví dụ và phiên bản để chạy trong dialog. Trang docs không bị thu hẹp. Đổi phiên bản, tải lại hoặc đóng sẽ reset app. Nếu khung trống, dùng nút mở tab mới. Escape đóng khi focus ở toolbar; phím trong app khác origin không được chuyển về trang cha.</p>
    <div className="example-workbench">
      <div className="example-toolbar">
        <span className="example-toolbar-icon"><ExampleIcon /></span>
        <label className="example-picker">Ví dụ
          <select aria-label="Chọn example" value={selected?.example.id ?? ''} onChange={event => onNavigate({ example: event.target.value })}>
            {!selected && <option value="" disabled>Chọn example</option>}
            {choices.map(example => <option key={example.id} value={example.id}>{example.title}</option>)}
          </select>
        </label>
        <label className="example-picker example-version-picker">Phiên bản
          <select aria-label="Phiên bản example" disabled={!selected} value={selected?.version.id ?? ''}
            onChange={event => onNavigate({ example: request.example, version: event.target.value })}>
            {!selected && <option value="">Không có</option>}
            {selected?.example.versions.map(version => <option key={version.id} value={version.id}>{version.title}</option>)}
          </select>
        </label>
        <div className="example-actions">
          <button type="button" disabled={!selected} onClick={() => setAttempt(value => value + 1)}
            aria-label="Tải lại example" title="Tải lại, reset state"><ReloadIcon /></button>
          {selected && <a href={selected.version.src} target="_blank" rel="noopener noreferrer"
            aria-label="Mở example trong tab mới" title="Khung trống? Mở example trong tab mới"><OpenIcon /></a>}
          {selected?.version.sourceUrl && <a href={selected.version.sourceUrl} target="_blank" rel="noopener noreferrer"
            aria-label="Mở source của example" title="Source code"><CodeIcon /></a>}
          <button ref={closeButton} type="button" onClick={onClose} aria-label="Đóng example" title="Đóng example">×</button>
        </div>
      </div>
      {error ? <div className="example-error" role="alert"><h3>Chưa mở được example</h3><p>{error}</p><p>Chọn lại ví dụ hoặc đóng dialog để tiếp tục đọc bài.</p></div>
        : selected && <ExampleFrame key={`${selected.example.id}/${selected.version.id}/${selected.version.src}/${attempt}`}
          src={selected.version.src} title={`${selected.example.title} — ${selected.version.title}`} />}
    </div>
  </dialog>;
}

function ExampleFrame({ src, title }: { src: string; title: string }) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  return <div className="example-frame">
    {loading && <p className="example-status" role="status">Đang tải example…</p>}
    {failed && <p className="example-status" role="status">Trình duyệt báo lỗi tải. Thử tải lại hoặc dùng nút mở tab mới.</p>}
    <iframe src={src} title={title} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer"
      onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }} />
  </div>;
}
