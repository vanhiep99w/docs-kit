'use client';

import { useEffect, useId, useMemo, useState, type MouseEvent } from 'react';
import { inspectorInitialExpanded, inspectorParent, inspectorPreview, inspectorValue, searchInspector, validatePreparedDataInspector, type InspectorNode, type PreparedDataInspector } from '../data-inspector/data.js';

export type { DataInspectorInput, PreparedDataInspector, InspectorNode, InspectorNodeType, InspectorAnnotation } from '../data-inspector/data.js';
export type DataInspectorProps = { data: PreparedDataInspector; className?: string };

/** A static JSON document explorer. Native details and complete source survive without JS. */
export function DataInspector({ data, className }: DataInspectorProps) {
  const view = useMemo(() => {
    validatePreparedDataInspector(data);
    return { nodes: new Map(data.nodes.map((node) => [node.pointer, node])), indices: new Map(data.nodes.map((node, index) => [node.pointer, index])), initial: inspectorInitialExpanded(data) };
  }, [data]);
  const uid = useId();
  const titleId = `${uid}-title`;
  const searchId = `${uid}-search`;
  const nodeId = (pointer: string) => `${uid}-node-${view.indices.get(pointer)}`;
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [expanded, setExpanded] = useState(() => new Set(view.initial));
  const [status, setStatus] = useState('');
  useEffect(() => { setReady(true); }, []);
  useEffect(() => { setQuery(''); setSelected(''); setExpanded(new Set(view.initial)); setStatus(''); }, [data, view]);
  const searching = !!query.trim();
  const search = useMemo(() => searchInspector(data, query), [data, query]);
  const visible = new Set(search.visible);
  const matched = new Set(search.matches);
  const searchOpen = new Set(search.ancestors);
  const selectedNode = view.nodes.get(selected) ?? data.nodes[0];

  function reveal(event: MouseEvent<HTMLAnchorElement>, pointer: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    setQuery(''); setSelected(pointer);
    setExpanded((previous) => {
      const next = new Set(previous);
      let parent = inspectorParent(pointer);
      while (parent !== undefined) { next.add(parent); parent = inspectorParent(parent); }
      return next;
    });
    // Keep the native fragment link so annotation references also work without JS.
  }

  async function copy(kind: 'path' | 'value') {
    try {
      await navigator.clipboard.writeText(kind === 'path' ? selectedNode.pointer : inspectorValue(data, selectedNode.pointer));
      setStatus(kind === 'path' ? 'Đã sao chép JSON Pointer.' : 'Đã sao chép JSON value.');
    } catch { setStatus('Không thể sao chép. Hãy mở JSON gốc để chọn và sao chép thủ công.'); }
  }

  function renderNode(node: InspectorNode) {
    const parent = inspectorParent(node.pointer);
    const name = parent === undefined ? '(root)' : view.nodes.get(parent)?.type === 'array' ? `[${node.key}]` : JSON.stringify(node.key);
    const notes = (data.annotations ?? []).filter((annotation) => annotation.pointer === node.pointer);
    const descriptionIds = notes.map((annotation) => `${uid}-annotation-${annotation.id}`).join(' ') || undefined;
    const content = <><code className="data-inspector-key">{name}</code><span className="data-inspector-value" data-type={node.type}>{inspectorPreview(data, node)}</span><span className="data-inspector-type">{node.type}</span>{notes.length > 0 && <span className="data-inspector-note-label">có chú thích</span>}</>;
    const container = node.children.length > 0;
    return <li key={node.pointer} id={nodeId(node.pointer)} className="data-inspector-node" data-pointer={node.pointer}
      data-selected={selectedNode.pointer === node.pointer ? 'true' : undefined} data-match={matched.has(node.pointer) ? 'true' : undefined}>
      {container ? <details open={searching ? searchOpen.has(node.pointer) : expanded.has(node.pointer)}>
        <summary aria-describedby={descriptionIds} aria-disabled={searching ? 'true' : undefined} onClick={(event) => {
          event.preventDefault();
          if (searching) return;
          setExpanded((previous) => { const next = new Set(previous); if (next.has(node.pointer)) next.delete(node.pointer); else next.add(node.pointer); return next; });
        }}>{content}</summary>
        <ul>{node.children.filter((pointer) => visible.has(pointer)).map((pointer) => renderNode(view.nodes.get(pointer)!))}</ul>
      </details> : <div className="data-inspector-leaf">{content}</div>}
      <button type="button" className="data-inspector-select" hidden={!ready} aria-label={`Chọn ${node.pointer || 'root'}`}
        aria-pressed={selectedNode.pointer === node.pointer} aria-describedby={descriptionIds} onClick={() => setSelected(node.pointer)}>Chọn</button>
    </li>;
  }

  return <figure className={['data-inspector', 'not-prose', className].filter(Boolean).join(' ')} aria-labelledby={titleId}>
    <figcaption className="data-inspector-header"><span id={titleId}>{data.title}</span><small>JSON · {data.nodes.length} node</small>
      {data.description && <p>{data.description}</p>}
    </figcaption>
    <div className="data-inspector-controls" hidden={!ready}>
      <label htmlFor={searchId}>Tìm field, path hoặc giá trị</label>
      <div><input id={searchId} type="search" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ví dụ: /user/id hoặc trạng thái…" />
        <button type="button" onClick={() => setExpanded(new Set(data.nodes.filter((node) => node.children.length).map((node) => node.pointer)))} disabled={searching}>Mở tất cả</button>
        <button type="button" onClick={() => setExpanded(new Set())} disabled={searching}>Thu tất cả</button>
      </div>
      <span role="status" aria-label="Kết quả tìm kiếm">{searching ? `${search.matches.length} kết quả; hiện cả field cha.` : 'Tìm literal, không chạy JSONPath hoặc regex.'}</span>
    </div>
    <div className="data-inspector-selection">
      <span>JSON Pointer: <code>{selectedNode.pointer || '(root: "")'}</code><small>{selectedNode.type}</small></span>
      <button type="button" hidden={!ready} onClick={() => copy('path')}>Sao chép path</button>
      <button type="button" hidden={!ready} onClick={() => copy('value')}>Sao chép value</button>
    </div>
    <div className="data-inspector-tree-region" tabIndex={0} role="region" aria-label={`Cây JSON: ${data.title}`}>
      {searching && !search.matches.length ? <p className="data-inspector-empty">Không tìm thấy field phù hợp.</p>
        : <ul className="data-inspector-tree">{renderNode(data.nodes[0])}</ul>}
    </div>
    {data.annotations && <ol className="data-inspector-annotations" aria-label="Chú thích dữ liệu">
      {data.annotations.map((annotation) => <li key={annotation.id} id={`${uid}-annotation-${annotation.id}`}>
        <a href={`#${nodeId(annotation.pointer)}`} onClick={(event) => reveal(event, annotation.pointer)}>{annotation.title}</a>
        <code>{annotation.pointer || '(root: "")'}</code><p>{annotation.description}</p>
      </li>)}
    </ol>}
    <details className="data-inspector-source"><summary>JSON gốc</summary>
      <pre tabIndex={0} role="region" aria-label="JSON gốc đầy đủ"><code>{data.json}</code></pre>
    </details>
    <div className="data-inspector-status" role="status" aria-label="Sao chép" aria-live="polite">{status}</div>
  </figure>;
}
