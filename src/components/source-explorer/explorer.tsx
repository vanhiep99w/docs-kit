'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { writeSourceURL, type SourceFile, type SourceManifest, type SourceRequest, type SourceSnapshot } from '../../source-explorer/index.js';

const cache = new Map<string, Promise<unknown>>();
function loadJSON<T>(url: string): Promise<T> {
  if (!cache.has(url)) {
    cache.set(url, fetch(url, { cache: 'no-cache' }).then((response) => {
      if (!response.ok) throw new Error(`Không tải được source (${response.status}).`);
      return response.json();
    }).catch((error) => { cache.delete(url); throw error; }));
  }
  return cache.get(url) as Promise<T>;
}

type LoadedSource = { manifest: SourceManifest; snapshot: SourceSnapshot };
type Props = {
  request: SourceRequest;
  onNavigate: (request: SourceRequest) => void;
  onClose: () => void;
  manifestUrl: string;
  scrollAnchorSelector?: string;
};

function Folder({ files, selected, onSelect, prefix = '' }: {
  files: SourceFile[];
  selected: string;
  onSelect: (file: string) => void;
  prefix?: string;
}) {
  const children = new Map<string, SourceFile[]>();
  for (const file of files) {
    const part = file.path.slice(prefix.length).split('/')[0];
    children.set(part, [...(children.get(part) ?? []), file]);
  }
  const entries = [...children].sort(([a, af], [b, bf]) => {
    const ad = af[0].path !== `${prefix}${a}`;
    const bd = bf[0].path !== `${prefix}${b}`;
    return Number(bd) - Number(ad) || a.localeCompare(b);
  });
  return (
    <ul className="source-files">
      {entries.map(([name, items]) => {
        const path = `${prefix}${name}`;
        const directory = items[0].path !== path;
        return <li key={path}>{directory ? (
          <details open>
            <summary><span aria-hidden="true">▾</span> {name}</summary>
            <Folder files={items} prefix={`${path}/`} selected={selected} onSelect={onSelect} />
          </details>
        ) : (
          <button type="button" title={items[0].displayPath ?? path} aria-current={selected === path ? 'page' : undefined} onClick={() => onSelect(path)}>
            <span className="source-file-icon" aria-hidden="true">{items[0].language === 'tsx' ? '⊙' : '≡'}</span>
            {name}
          </button>
        )}</li>;
      })}
    </ul>
  );
}

// Keep the current paragraph in view when the desktop layout makes room for the drawer.
function setDrawerLayout(open: boolean, scrollAnchorSelector?: string) {
  const anchor = (scrollAnchorSelector ? Array.from(document.querySelectorAll<HTMLElement>(scrollAnchorSelector)) : [])
    .find((element) => element.getBoundingClientRect().bottom > 80);
  const top = anchor?.getBoundingClientRect().top;
  document.body.toggleAttribute('data-source-drawer-open', open);
  if (anchor && top !== undefined) window.scrollBy(0, anchor.getBoundingClientRect().top - top);
}

export default function SourceExplorer({ request, onNavigate, onClose, manifestUrl, scrollAnchorSelector }: Props) {
  const drawer = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const code = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<LoadedSource | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useLayoutEffect(() => {
    const element = drawer.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDrawerLayout(true, scrollAnchorSelector);
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      const returnFocus = element?.contains(document.activeElement);
      setDrawerLayout(false, scrollAnchorSelector);
      if (returnFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      clearTimeout(timer.current);
    };
  }, [scrollAnchorSelector]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setLoaded(null);
    setError('');
    async function load() {
      try {
        const manifests = await loadJSON<SourceManifest[]>(manifestUrl);
        const manifest = manifests.find((item) => item.id === request.project);
        if (!manifest) throw new Error(`Không tìm thấy project “${request.project}”.`);
        const target = manifest.snapshots.find((item) => item.id === (request.snapshot ?? manifest.defaultSnapshot));
        if (!target) throw new Error('Phiên bản source không tồn tại.');
        const snapshot = await loadJSON<SourceSnapshot>(new URL(target.asset, new URL(manifestUrl, window.location.href)).href);
        if (active) setLoaded({ manifest, snapshot });
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : 'Không tải được source.');
      }
    }
    void load();
    return () => { active = false; };
  }, [request.project, request.snapshot, manifestUrl, retry]);

  const file = loaded?.snapshot.files.find((item) => item.path === (request.file ?? loaded.snapshot.defaultFile));
  const reference = useMemo(() => {
    if (!file) return { range: undefined, error: '' };
    const count = file.code.trimEnd().split('\n').length;
    if (request.region) {
      return { range: file.regions[request.region], error: file.regions[request.region] ? '' : `Vùng “${request.region}” không còn tồn tại trong file này.` };
    }
    if (request.lines) {
      const match = request.lines.match(/^(\d+)(?:-(\d+))?$/);
      const start = Number(match?.[1]);
      const end = Number(match?.[2] ?? match?.[1]);
      if (!match || start < 1 || end < start || end > count) return { range: undefined, error: 'Khoảng dòng trong reference không hợp lệ.' };
      return { range: [start, end] as [number, number], error: '' };
    }
    return { range: undefined, error: '' };
  }, [file, request.region, request.lines]);

  useEffect(() => {
    const container = code.current;
    if (!container || !file) return;
    for (const line of Array.from(container.querySelectorAll<HTMLElement>('[data-line]'))) {
      const number = Number(line.dataset.line);
      line.classList.toggle('is-highlighted', !!reference.range && number >= reference.range[0] && number <= reference.range[1]);
    }
    const target = reference.range && container.querySelector<HTMLElement>(`[data-line="${reference.range[0]}"]`);
    container.scrollTop = target ? Math.max(0, target.offsetTop - container.clientHeight / 3) : 0;
    container.scrollLeft = 0;
  }, [file, reference, loaded]);

  function selectFile(path: string) {
    onNavigate({ project: request.project, snapshot: loaded?.snapshot.snapshot ?? request.snapshot, file: path });
    setAnnouncement('');
  }

  async function copy(kind: 'file' | 'link') {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      const normalized = { ...request, snapshot: loaded?.snapshot.snapshot ?? request.snapshot, file: file?.path ?? request.file };
      const value = kind === 'file' ? file?.code : writeSourceURL(new URL(window.location.href), normalized).href;
      if (!value) return;
      await navigator.clipboard.writeText(value);
      setAnnouncement(kind === 'file' ? 'Đã copy nội dung file.' : 'Đã copy link tới source đang xem.');
    } catch {
      setAnnouncement('Không truy cập được clipboard. Bạn có thể chọn code để copy hoặc lấy link trên thanh địa chỉ.');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAnnouncement(''), 5000);
  }

  return (
    <div ref={drawer} id="source-explorer" role="dialog" aria-modal="false" className="source-drawer" aria-labelledby="source-explorer-title" aria-describedby="source-explorer-description">
      <div className="source-workbench">
        <h2 id="source-explorer-title" className="source-sr-only">{loaded?.manifest.title ?? request.project}</h2>
        <p id="source-explorer-description" className="source-sr-only">Xem source bên cạnh bài viết, chọn file hoặc phiên bản. Bài viết vẫn có thể cuộn và tương tác. Nhấn Escape để thu drawer.</p>
        <div className="source-toolbar">
          <button ref={closeButton} type="button" className="source-close" onClick={onClose} aria-label="Đóng source explorer" title="Thu drawer (Esc)">×</button>
          {loaded && <label className="source-snapshot-label">Phiên bản
            <select aria-label="Phiên bản source" value={loaded.snapshot.snapshot} onChange={(event) => {
              onNavigate({ project: request.project, snapshot: event.target.value });
            }}>
              {loaded.manifest.snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.title}</option>)}
            </select>
          </label>}
          <div className="source-toolbar-actions">
            <button type="button" onClick={() => void copy('link')}>Copy link ↗</button>
            <button type="button" disabled={!file} onClick={() => void copy('file')}>Copy file</button>
          </div>
        </div>
        {error ? <div className="source-message" role="alert">
          <h3>Chưa mở được source</h3><p>{error}</p>
          <button type="button" onClick={() => { cache.clear(); setRetry((value) => value + 1); }}>Thử lại</button>
        </div> : !loaded ? <div className="source-message" role="status">Đang tải source ví dụ…</div> : (
          <div className="source-workspace">
            <nav className="source-sidebar" aria-label="Files của project">
              <div className="source-sidebar-title">FILES <span>{loaded.snapshot.files.length}</span></div>
              <Folder files={loaded.snapshot.files} selected={file?.path ?? ''} onSelect={selectFile} />
            </nav>
            <section className="source-editor" aria-label="Nội dung source">
              <div className="source-mobile-files"><label>File
                <select aria-label="Chọn file source" value={file?.path ?? ''} onChange={(event) => selectFile(event.target.value)}>
                  {!file && <option value="" disabled>Chọn file</option>}
                  {loaded.snapshot.files.map((item) => <option key={item.path} value={item.path}>{item.path}</option>)}
                </select>
              </label></div>
              <div className="source-file-tab"><span title={file?.path}>{file?.displayPath ?? file?.path ?? request.file}</span>{reference.range && <span className="source-range">L{reference.range[0]}–{reference.range[1]}</span>}</div>
              {reference.error && <p className="source-reference-error" role="status">{reference.error}</p>}
              {file ? <div ref={code} className="source-code" tabIndex={0} aria-label={`Source ${file.path}`}
                // Only repository-owned files, escaped and highlighted at build time by Shiki.
                dangerouslySetInnerHTML={{ __html: file.html }} /> : <div className="source-message" role="alert"><h3>Không tìm thấy file</h3><p>Chọn một file trong danh sách để tiếp tục. Reference này có thể đã cũ.</p></div>}
            </section>
          </div>
        )}
        <footer className="source-footer">
          <span className="source-announcement" role="status" aria-live="polite">{announcement || (file ? `${file.language} · ${file.code.trimEnd().split('\n').length} dòng` : 'Source tải khi mở, không chạy trong trình xem.')}</span>
          <span className="source-escape-hint"><kbd>esc</kbd> thu drawer</span>
        </footer>
      </div>
    </div>
  );
}
