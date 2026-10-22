'use client';

import { useId, useState, type CSSProperties } from 'react';

export type LiveDemoProps = {
  /** Trusted demo URL, ideally on a different origin from the documentation. */
  src: string;
  title: string;
  sourceUrl?: string;
  /** Fixed viewport height; the embedded document scrolls independently. */
  height?: number;
  className?: string;
};

function safeURL(value: string, label: string): string {
  if (typeof value !== 'string' || value !== value.trim() || /[\\\u0000-\u0020]/.test(value)) {
    throw new TypeError(`LiveDemo ${label} must be a valid HTTP(S) URL or root-relative path`);
  }
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  let url: URL;
  try { url = new URL(value); } catch {
    throw new TypeError(`LiveDemo ${label} must be a valid HTTP(S) URL or root-relative path`);
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new TypeError(`LiveDemo ${label} must use HTTP(S) without credentials`);
  }
  return value;
}

export function LiveDemo({ src, title, sourceUrl, height = 620, className }: LiveDemoProps) {
  const validatedSrc = safeURL(src, 'src');
  const validatedSource = sourceUrl === undefined ? undefined : safeURL(sourceUrl, 'sourceUrl');
  if (typeof title !== 'string' || !title.trim()) throw new TypeError('LiveDemo title is required');
  if (!Number.isFinite(height) || height < 200 || height > 1600) {
    throw new TypeError('LiveDemo height must be between 200 and 1600 pixels');
  }
  // Navigation to another demo must not preserve the previous iframe or its load state.
  return <DemoFrame key={validatedSrc} src={validatedSrc} title={title} sourceUrl={validatedSource} height={height} className={className} />;
}

function DemoFrame({ src, title, sourceUrl, height, className }: Required<Pick<LiveDemoProps, 'src' | 'title' | 'height'>> & Pick<LiveDemoProps, 'sourceUrl' | 'className'>) {
  const id = useId();
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const start = () => {
    setLoading(true);
    setFailed(false);
    setStarted(true);
    setAttempt(value => value + 1);
  };
  return <figure className={['live-demo', className].filter(Boolean).join(' ')} aria-labelledby={id}>
    <figcaption className="live-demo-toolbar">
      <span id={id} className="live-demo-title">{title}</span>
      <span className="live-demo-links">
        <a href={src} target="_blank" rel="noopener noreferrer">Mở tab mới ↗</a>
        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer">Source code ↗</a>}
      </span>
    </figcaption>
    <div className="live-demo-viewport" style={{ '--live-demo-height': `${height}px` } as CSSProperties}>
      {!started ? <div className="live-demo-placeholder">
        <p>Demo chạy độc lập với trang tài liệu. Chỉ tải khi bạn muốn thử.</p>
        <button type="button" onClick={start}>Chạy thử</button>
        <p className="live-demo-hint">Không dùng JavaScript? Chọn “Mở tab mới” để xem demo.</p>
      </div> : <>
        {loading && <p className="live-demo-loading" role="status">Đang tải demo…</p>}
        <iframe
          key={attempt}
          src={src}
          title={title}
          height={height}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setFailed(true); }}
        />
      </>}
    </div>
    <div className="live-demo-footer">
      <p className="live-demo-hint" role={failed ? 'status' : undefined}>
        {failed ? 'Trình duyệt báo lỗi tải demo. Thử tải lại hoặc mở tab mới.' : 'Nếu khung trống hoặc bị chặn, chọn “Mở tab mới”. Tải lại sẽ đặt lại state trong demo.'}
      </p>
      {started && <button type="button" onClick={start}>Tải lại demo</button>}
    </div>
  </figure>;
}
