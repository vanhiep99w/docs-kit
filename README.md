# @vanhiep99w/docs-kit

Bộ component và tích hợp build-time dùng chung cho các website tài liệu MDX/Fumadocs. D2, Source Explorer, Code Walkthrough, Terminal Session, Code Diff, Protocol Exchange và Span Waterfall có entry point riêng, không kéo build-time renderer/highlighter vào client bundle.

**Bản 0.11.0:** thêm [Example Explorer](./docs/example-explorer.md): nút Example mở modal, nhiều ví dụ/phiên bản trên một trang, launcher nổi và deep link; không chiếm khung lớn trong bài hay thu hẹp layout. LiveDemo cũ vẫn tương thích.

**Từ 0.10.0:** thêm [LiveDemo](./docs/live-demo.md), iframe tải theo yêu cầu, fallback mở tab mới và stylesheet độc lập.

**Từ 0.9.8:** D2 mặc định dùng scale **`0.85`** và bật sẵn viewer với zoom in/out, fit, fullscreen, source và tải SVG. Host cần đăng ký `D2InteractiveDiagram` cùng `D2Diagram`. Dùng `interactive=false` để giữ component server-only hoặc `scale=1` để render ở kích thước D2 gốc. Override đang có trong host vẫn được giữ.

Từ `0.9.7`, sequence có viền rõ, nền group trong suốt và padding phù hợp dùng chung cho mọi host. SVG tải xuống cũng giữ cách hiển thị này; style tác giả khai báo trong D2 vẫn được ưu tiên, hoặc chọn `sequenceStyle: 'native'` để dùng giao diện D2 cũ.

**Giao diện 0.9.0:** ưu tiên code/dữ liệu thay cho nhiều lớp header. [Thay đổi UI và vị trí thông tin mở rộng →](./docs/compact-ui.md).

## Mục lục

- [Yêu cầu](#yêu-cầu)
- [Cài đặt](#cài-đặt)
- [Tích hợp Fumadocs](#tích-hợp-fumadocs)
- [Example Explorer](#example-explorer)
- [Live Demo](#live-demo)
- [Source Explorer](#source-explorer)
- [Code Walkthrough](#code-walkthrough)
- [Terminal Session](#terminal-session)
- [Code / Config Diff](#code--config-diff)
- [Protocol Exchange](#protocol-exchange)
- [Span Waterfall](#span-waterfall)
- [Viết diagram](#viết-diagram)
- [Cấu hình D2](#cấu-hình-d2)
- [D2 nâng cao: viewer, nhiều board và tài nguyên](./docs/d2.md)
- [Worker pool và cache CI](#worker-pool-và-cache-ci)
  - [Số đo local](#số-đo-local)
  - [Cloudflare Pages](#cloudflare-pages)
- [Kiến trúc package](#kiến-trúc-package)
- [Phát triển và kiểm thử](#phát-triển-và-kiểm-thử)
- [Phát hành](#phát-hành)

## Chuyển đổi API

**0.9.8:** fence D2 không khai báo `interactive` giờ sinh `D2InteractiveDiagram`, không còn mặc định sinh `D2Diagram`. Đăng ký cả hai component như ví dụ bên dưới. Nếu muốn giữ hành vi cũ trên toàn site, đặt `remarkD2({ interactive: false, scale: 1 })`; từng fence vẫn override được các giá trị này. Scale mặc định mới là `0.85`, không tự ghi đè `scale` đã khai báo trong source config/fence.

**0.9.0:** xoá hẳn ConcurrencyLanes cùng các entry point `concurrency-lanes`, `concurrency-lanes/data`, `components/concurrency-lanes`, stylesheet và remark plugin. Gỡ import/MDX map và thay các fence tương ứng trong website.

Các component AnnotatedExample, DataInspector, MarbleDiagram (cả bản zoom) và StateTransitionExplorer đã được xoá cùng entry point, CSS và remark plugin. Gỡ các import/MDX map tương ứng trong website sử dụng package.

CodeWalkthrough hoạt động độc lập: đổi helper import sang `@vanhiep99w/docs-kit/code-walkthrough`, validator/types sang `@vanhiep99w/docs-kit/code-walkthrough/data`. Schema snapshots/steps và component import không đổi; helper `walkthroughExample` không còn tồn tại. Ví dụ chuyển sang `examples/code-walkthrough/`.

CodeDiff không render caption, lời giải thích annotation hoặc footer mô tả; ProtocolExchange không render descriptions/annotations. Viết thông tin ngữ cảnh cần thiết trong bài MDX bao quanh component. Parser vẫn nhận metadata cũ để các descriptor đang dùng không bị lỗi.

## Yêu cầu

- Node.js 22 trở lên để build tài liệu.
- React 18.3 hoặc 19; một MDX pipeline hỗ trợ remark plugin.
- Package là ESM. Không cần cài D2 CLI, Go hay Java.

Renderer chỉ chạy lúc build. Website static export không cần WASM hoặc server D2 khi người dùng đọc tài liệu. Nhánh component không import renderer hay Node.js APIs.

## Cài đặt

**Cài từ npm:**

```bash
npm install @vanhiep99w/docs-kit@0.11.0
```

Các cách dưới đây dành cho phát triển local hoặc kiểm tra bản chưa phát hành.

**Hai repository nằm cạnh nhau:**

```bash
# Trong docs-kit
npm ci
npm run build

# Trong website docs
npm install --install-links ../docs-kit
```

`--install-links` cài một bản đóng gói thông thường, không dùng symlink. Khi dùng cách này, thêm `install-links=true` vào `.npmrc` của website để `npm ci` dùng cùng cấu hình. Cần có checkout `docs-kit` ở đường dẫn đó khi cài dependency; để deploy độc lập với repo bên cạnh, dùng dependency theo version trên registry.

**Kiểm tra hoặc chia sẻ bản đóng gói:**

```bash
# Trong docs-kit
npm pack

# Trong một website khác
npm install /path/to/vanhiep99w-docs-kit-0.9.0.tgz
```

**Git dependency**, sau khi code đã được commit và push:

```bash
npm install 'git+https://github.com/vanhiep99w/docs-kit.git#<commit-or-tag>'
```

`prepare` build package khi cài từ Git. Pin commit hoặc tag để tránh các website tự nhận thay đổi ngoài dự kiến.

## Tích hợp Fumadocs

### 1. Đăng ký plugin build-time

Trong `source.config.ts`, giữ nguyên collections và các plugin đang có:

```ts
import { defineDocs, defineConfig } from 'fumadocs-mdx/config';
import { remarkD2 } from '@vanhiep99w/docs-kit/d2';

export const docs = defineDocs({ dir: 'content/docs' });

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkD2],
  },
});
```

### 2. Đăng ký component MDX

Trong `mdx-components.tsx`:

```tsx
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { D2Diagram } from '@vanhiep99w/docs-kit/components/d2';
import { D2InteractiveDiagram } from '@vanhiep99w/docs-kit/components/d2-interactive';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    D2Diagram,
    D2InteractiveDiagram,
    ...components,
  };
}
```

Giữ nguyên các component riêng đã đăng ký trong website.

### 3. Import CSS một lần

Trong global CSS, sau stylesheet của Fumadocs:

```css
@import 'tailwindcss';
@import 'fumadocs-ui/css/style.css';
@import '@vanhiep99w/docs-kit/styles/d2.css';
```

CSS chỉ tác động `.d2-diagram`, không sửa layout/sidebar của website. Light/dark theo class `.dark` hoặc `[data-theme='dark']` của website, không phụ thuộc riêng vào theme hệ điều hành. Các biến màu Fumadocs có fallback.

## Example Explorer

Dùng `ExampleExplorerProvider` với registry app tin cậy, đăng ký `ExampleRef` trong MDX map và import `styles/example-explorer.css`. Mỗi reference là một link nhỏ; click mở modal có chọn ví dụ, phiên bản, tải lại, mở tab mới và đóng. Có thêm launcher **Example** phía trên nút Source code. Một trang có nhiều reference nhưng chỉ chạy một app trong dialog tại một thời điểm, không thu hẹp nội dung bài.

Xem [API, nhiều phiên bản, URL và giới hạn iframe](./docs/example-explorer.md). Không cần remark plugin hay copy dependencies của demo vào site docs.

## Live Demo

Khung inline tương thích từ 0.10.0. Để không chiếm diện tích trong bài, ưu tiên **Example Explorer** ở trên.

Nhúng app thật từ một deployment riêng mà không kéo dependencies của app vào docs-kit. Đăng ký `LiveDemo` từ `@vanhiep99w/docs-kit/components/live-demo`, import `@vanhiep99w/docs-kit/styles/live-demo.css`, rồi dùng trực tiếp trong MDX. Không cần remark plugin. Iframe chỉ tải khi bấm **Chạy thử**; link mở riêng hoạt động cả khi tắt JavaScript.

Xem [API, lifecycle và trust boundary](./docs/live-demo.md). Chỉ dùng với app tin cậy, ưu tiên origin khác với docs; component không phải editor hoặc môi trường chạy code tùy ý.

## Source Explorer

Drawer đọc source dùng chung cho React 18.3/19, không phụ thuộc Next.js, Fumadocs, Shiki runtime hay editor. Có file tree, snapshot, highlight vùng/dòng, copy, deep link, Back/Forward và lazy-load code/dữ liệu khi mở. Source không được thực thi.

### Tích hợp vào website

Đăng ký một provider ở layout và `SourceRef` trong MDX components:

```tsx
'use client';

import { SourceExplorerProvider } from '@vanhiep99w/docs-kit/components/source-explorer';

export function Provider({ children }: { children: React.ReactNode }) {
  return <SourceExplorerProvider>{children}</SourceExplorerProvider>;
}
```

```tsx
import { SourceRef } from '@vanhiep99w/docs-kit/components/source-explorer';

// Giữ các MDX components hiện có.
const components = { SourceRef };
```

Import CSS một lần sau stylesheet của website:

```css
@import '@vanhiep99w/docs-kit/styles/source-explorer.css';
/* Chỉ với Fumadocs: dành không gian đọc, tạm ẩn TOC trên desktop. */
@import '@vanhiep99w/docs-kit/styles/source-explorer-fumadocs.css';
```

CSS chính có fallback màu/font khi không dùng Fumadocs; syntax theme tối theo class `.dark`. Website khác tự định nghĩa layout theo `body[data-source-drawer-open]` và `--source-drawer-width` nếu muốn dành không gian bên cạnh drawer.

Với Next.js App Router, truyền `usePathname()` từ wrapper client của website để reset drawer khi chuyển bài bằng client-side navigation. Không truyền search params làm navigation key vì query source thay đổi ngay khi chọn file:

```tsx
const pathname = usePathname(); // import từ next/navigation trong website, không phải library

<SourceExplorerProvider
  navigationKey={pathname}
  manifestUrl="/source-examples/manifest.json"
  scrollAnchorSelector="#nd-page .prose > *"
>
  {children}
</SourceExplorerProvider>
```

| Provider prop | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `manifestUrl` | `/source-examples/manifest.json` | Manifest của website; dùng prefix riêng cho base path/CDN |
| `navigationKey` | Không có | Pathname từ router; đổi key reset trạng thái khi chuyển bài |
| `scrollAnchorSelector` | Không có | Selector các đoạn bài viết để giữ vị trí đọc lúc layout đổi |

Dùng reference trong MDX:

```mdx
<SourceRef project="demo" file="src/main.tsx" region="entry" variant="button">
  Mở source đầy đủ
</SourceRef>
```

Props: `project` bắt buộc; `snapshot`, `file`, `region` hoặc `lines="1-4"`, `variant="inline" | "button"`, `children` tùy chọn. Không kết hợp `region` và `lines`. Khi bỏ snapshot/file, viewer chọn default từ dữ liệu. Nhãn UI hiện bằng tiếng Việt. Mỗi trang chỉ cần một provider; `SourceRef` tự đăng ký nút nổi. Query `source`, `snapshot`, `file`, `region`, `lines` dành riêng cho viewer; các query/hash khác được giữ lại.

### Hợp đồng dữ liệu tĩnh

Website chịu trách nhiệm sinh JSON và validate reference lúc build; module này chỉ cung cấp UI, types và URL helpers, **không** tự đọc filesystem hay tạo assets. Có thể dùng pipeline riêng theo types `SourceManifest`, `SourceSnapshot`, `SourceFile` từ `@vanhiep99w/docs-kit/source-explorer`.

Manifest là mảng project:

```json
[{
  "id": "demo",
  "title": "Demo",
  "defaultSnapshot": "basic",
  "snapshots": [{ "id": "basic", "title": "Cơ bản", "asset": "demo-basic.json" }]
}]
```

Snapshot asset (`asset` tương đối với URL manifest, hoặc URL tuyệt đối):

```json
{
  "project": "demo",
  "snapshot": "basic",
  "defaultFile": "src/main.tsx",
  "files": [{
    "path": "src/main.tsx",
    "language": "tsx",
    "code": "console.log('demo');",
    "html": "<pre><code><span class=\"line\" data-line=\"1\">console.log('demo');</span></code></pre>",
    "regions": { "entry": [1, 1] }
  }]
}
```

`displayPath` tùy chọn cho tên artifact có hash. HTML highlight cần `.line[data-line]` đánh số từ 1; ranges tính trên `code` hiển thị sau khi bỏ region markers. Với Shiki, sinh dual theme và giữ các biến `--shiki-dark`. Khi fetch cross-origin, cấu hình CORS trên host assets.

**Ranh giới tin cậy:** `html` được nhúng trực tiếp, không sanitize. Chỉ cung cấp HTML đã escape/highlight từ source tin cậy; không dùng manifest hay HTML do người dùng không tin cậy kiểm soát. Assets được publish công khai; không đưa secrets vào source. Pipeline mẫu hiện nằm ở `interview-question/scripts/build-source-examples.mjs` cùng registry/examples của website đó.

Public entry points:

- `@vanhiep99w/docs-kit/components/source-explorer`: client components + props/types.
- `@vanhiep99w/docs-kit/source-explorer`: types và `readSourceURL` / `writeSourceURL`, dùng được ngoài React.
- `@vanhiep99w/docs-kit/styles/source-explorer.css`: CSS viewer.
- `@vanhiep99w/docs-kit/styles/source-explorer-fumadocs.css`: layout adapter tùy chọn.

## Code Walkthrough

Khung code kiểu terminal: tên file, copy, chọn bước và trước/sau. Chỉ hiện snapshot cùng lời giải thích của bước đang chọn; nhiều range được highlight đồng thời. Shiki chạy lúc build, copy giữ nguyên code gốc. Không thực thi code. Không JavaScript vẫn đọc được mọi snapshot và bước.

- Plugin/helper: `remarkCodeWalkthrough`, `prepareCodeWalkthrough` từ `@vanhiep99w/docs-kit/code-walkthrough`.
- Component: `CodeWalkthrough` từ `@vanhiep99w/docs-kit/components/code-walkthrough`.
- Adapter tùy chọn: `CodeWalkthroughWithSource` từ `@vanhiep99w/docs-kit/components/code-walkthrough-source`.
- CSS: `@vanhiep99w/docs-kit/styles/code-walkthrough.css`.

**[Tích hợp, snapshots/steps, API và giới hạn →](./docs/code-walkthrough.md)** · **[Ví dụ guard](./examples/code-walkthrough/walkthrough-guard.mdx)** · **[Ví dụ Dockerfile](./examples/code-walkthrough/walkthrough-dockerfile.mdx)**

## Terminal Session

MVP local cho transcript lệnh theo bước: context local/container/pod/remote, stdout/stderr có nhãn, copy riêng command gốc, cảnh báo, kết quả kỳ vọng và exit code do tác giả khai báo. Output dài dùng disclosure native; không JavaScript vẫn đọc/mở được nội dung. Không thực thi shell, không kết nối dịch vụ ngoài và không có ANSI parser.

- Plugin: `remarkTerminalSession` từ `@vanhiep99w/docs-kit/terminal-session`.
- Component: `TerminalSession` từ `@vanhiep99w/docs-kit/components/terminal-session`.
- CSS: `@vanhiep99w/docs-kit/styles/terminal-session.css`.

**[Tích hợp, cú pháp MDX và API →](./docs/terminal-session.md)** · **[Ví dụ Kubernetes, Docker, Redis CLI →](./examples/terminal-session/)**

## Code / Config Diff

MVP local cho inline/split diff trước/sau, với word detail opt-in: số dòng từng bên, dấu thêm/xóa, highlight theo side/range, phần không đổi thu gọn native và copy nguyên bản. Xử lý file rỗng, Unicode, CRLF và newline cuối file; diff engine và Shiki chỉ chạy lúc build, không kéo vào browser. Source Explorer adapter mở đúng snapshot/file của từng bên khi host đã tích hợp provider.

- Plugin/helper: `remarkCodeDiff`, `prepareCodeDiff` từ `@vanhiep99w/docs-kit/code-diff`.
- Component: `CodeDiff` từ `@vanhiep99w/docs-kit/components/code-diff`.
- Adapter tùy chọn: `CodeDiffWithSource` từ `@vanhiep99w/docs-kit/components/code-diff-source`.
- CSS: `@vanhiep99w/docs-kit/styles/code-diff.css`.

**[Tích hợp, ngữ nghĩa newline, API và giới hạn →](./docs/code-diff.md)** · **[Ví dụ Dockerfile, IAM, SQL →](./examples/code-diff/)**

## Protocol Exchange

MVP local cho request/response HTTP tĩnh: method/URL/status, header có thứ tự và trùng tên, text/JSON body và các tình huống mở/thu native. Không còn các khối mô tả/chú thích dài. JSON được định dạng dễ đọc nhưng không làm tròn số; copy giữ source và số lớn. Không gửi request, follow redirect hoặc lưu credential; bản copy chỉ là transcript đọc được, không phải cURL/wire format.

- Plugin/helper: `remarkProtocolExchange`, `prepareProtocolExchange` từ `@vanhiep99w/docs-kit/protocol-exchange`.
- Component: `ProtocolExchange` từ `@vanhiep99w/docs-kit/components/protocol-exchange`.
- CSS: `@vanhiep99w/docs-kit/styles/protocol-exchange.css`.

**[Tích hợp, headers/body, API và giới hạn →](./docs/protocol-exchange.md)** · **[Ví dụ REST/Auth, GraphQL, OAuth redirect →](./examples/protocol-exchange/)**

## Span Waterfall

MVP local cho timeline latency phân cấp: span có start/duration/parent/service, chung mốc 0 và thang thời gian; chọn span xem JSON attributes được định dạng dễ đọc. Có nhãn trace minh họa/đo thực tế, chú thích, trạng thái lỗi không chỉ dựa vào màu và bảng thời gian native đọc được khi tắt JavaScript. Không kết nối tracing backend, sửa clock skew hoặc suy ra critical path.

- Plugin/helper: `remarkSpanWaterfall`, `prepareSpanWaterfall` từ `@vanhiep99w/docs-kit/span-waterfall`.
- Component: `SpanWaterfall` từ `@vanhiep99w/docs-kit/components/span-waterfall`.
- CSS: `@vanhiep99w/docs-kit/styles/span-waterfall.css`.

**[Tích hợp, thời gian/parent, API và giới hạn →](./docs/span-waterfall.md)** · **[Ví dụ API/cache/database và fan-out microservices →](./examples/span-waterfall/)**

## Viết diagram

````mdx
```d2 title="Guard quyết định, resolver chuẩn bị dữ liệu"
direction: right
router: Router
guard: Cho phép? { shape: diamond }
resolver: Resolver
component: Component
blocked: Chặn hoặc redirect
router -> guard
guard -> resolver: Có
resolver -> component
guard -> blocked: Không
```
````

- D2 mặc định dùng sketch, layout ELK, scale `0.85`, nền trong suốt và viewer có sẵn toolbar. Không cần thêm flag `interactive` cho mỗi fence.
- Rectangle và diamond được đo nhãn bằng font thực tế rồi bố trí lại nếu ô quá nhỏ. Không dùng ước lượng theo số ký tự.
- Caption của container, sequence message và nhãn trên mũi tên vẫn giữ vị trí theo ngữ nghĩa của D2.
- Sequence group tự có nền trong suốt, viền theo light/dark và không bị blend mờ/chồng màu; không cần CSS hoặc màu hard-code tại host. Chỉ style mặc định được thay; fill/stroke/độ dày tác giả đặt rõ được giữ nguyên. Canvas sequence có padding riêng, nhưng không tự tăng giới hạn `90vh` hay thay sizing của ER/architecture. Xem [`sequenceStyle` và CSS variables](./docs/d2.md#sequence-frames-và-khoảng-đệm).
- Dùng luồng ngang, nhãn ngắn và xuống dòng hợp lý. Tách quy trình dài thành các giai đoạn thay vì thu nhỏ chữ đến mức khó đọc.
- Diagram server-only cuộn ngang để giữ chữ rõ. Từ `0.9.3`, `interactive` mở sẵn với toolbar icon zoom/fit/fullscreen và tự fit tối đa `90vh`; source nằm trong panel nổi, không có hàng footer. Có thể đổi giới hạn bằng `--d2-viewport-max-height` (viewer) và `--d2-preview-max-height` (fallback); xem [hướng dẫn D2](./docs/d2.md#1-viewer-mặc-định-và-chế-độ-static).
- Giữ cây thư mục, log, payload và những ví dụ text theo vị trí ở dạng text khi phù hợp.

**Ranh giới tin cậy:** chỉ compile MDX/D2 do người viết tài liệu đáng tin cậy quản lý trong repository. SVG được nhúng trực tiếp vào HTML; đây không phải sanitizer hay dịch vụ render input công khai. Không nhận D2 không tin cậy từ người dùng.

## Cấu hình D2

```ts
remarkPlugins: [[remarkD2, {
  sketch: true,
  layout: 'elk',
  scale: 0.85,
  interactive: true,
  padding: 12,
  themes: { light: 0, dark: 200 },
  cacheDir: '.cache/docs-kit/d2',
  concurrency: 1,
  poolIdleTimeoutMs: 30_000,
  defaultCaption: 'Sơ đồ',
}]],
```

| Option | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `sketch` | `true` | Phong cách vẽ tay |
| `layout` | `'elk'` | Engine mặc định: `elk`, `dagre` hoặc `tala`; có thể ghi đè theo page/block |
| `scale` | `0.85` | Scale SVG, phải lớn hơn 0; đặt `1` để dùng kích thước D2 gốc |
| `interactive` | `true` | Viewer mở sẵn với toolbar; `false` dùng server-only khi mode là static |
| `padding` | `12` | Padding canvas SVG, không âm |
| `sequenceStyle` | `'readable'` | Viền/nền group dễ đọc và padding sequence dùng chung; `'native'` giữ D2 gốc |
| `themes.light` / `themes.dark` | `0` / `200` | ID theme D2 cho từng chế độ |
| `cacheDir` | `.cache/docs-kit/d2` | Tương đối với working directory của website, hoặc đường dẫn tuyệt đối |
| `concurrency` | `1` | Từ 1 đến 8 worker; các tiến trình có cùng cache directory và pool settings dùng chung pool |
| `poolIdleTimeoutMs` | `30000` | Tự đóng pool sau khi rảnh; từ 1000 đến 600000 ms |
| `defaultCaption` | `'Diagram'` | Caption khi fence không có `title` |

Để dùng TALA cho sơ đồ kiến trúc/nhiều container:

```ts
remarkPlugins: [[remarkD2, { layout: 'tala' }]],
```

TALA hỗ trợ khóa vị trí bằng `top`/`left`, `near` trỏ tới node khác và `direction` riêng từng container. Engine được tích hợp trong `@d2lang/d2` (WASM), không cần cài CLI/plugin hay license riêng. ELK vẫn là mặc định; TALA có thể chạy chậm hơn với sơ đồ lớn và thay đổi bố cục nhiều khi sửa source.

### Chọn engine theo page hoặc block

Thứ tự ưu tiên: **`layout` của block → `d2Layout` trong frontmatter → `remarkD2({ layout })` → ELK**.

````mdx
---
title: Kiến trúc hệ thống
d2Layout: tala
---

```d2 title="Kiến trúc — dùng TALA của page"
client -> api -> database
```

```d2 layout="dagre" title="Luồng xử lý — riêng block này dùng Dagre"
request -> validate -> respond
```
````

`layout` trong fence chấp nhận `layout=tala`, `layout="tala"` hoặc `layout='tala'`. Chỉ nhận `elk`, `dagre`, `tala` (chữ thường). Giá trị không hợp lệ hoặc khai báo `layout` lặp trong cùng block sẽ báo lỗi kèm file/vị trí, không tự fallback.

Plugin tự nhận diện YAML frontmatter, không cần thêm plugin cho ví dụ trên. Nếu host đã tách frontmatter (như Fumadocs), plugin đọc `file.data.frontmatter.d2Layout`. Với collection có schema lọc field, hãy thêm `d2Layout: z.enum(['elk', 'dagre', 'tala']).optional()` vào schema để field không bị loại trước khi remark chạy. Plugin không tự export frontmatter thành biến MDX.

Override chỉ tác động page/block tương ứng; các page khác vẫn dùng cấu hình chung. Cache dùng engine đã resolve nên đổi engine sẽ không dùng nhầm SVG cũ.

Thêm `.cache/` vào `.gitignore` của website. Cache bao gồm source, vị trí tương đối trong project, phiên bản SDK/renderer và options. Đường dẫn checkout tuyệt đối không nằm trong cache key nên cache có thể dùng lại trên máy/CI khác. Lỗi cú pháp hiển thị file và vị trí fence, không bị giấu thành hình trống.

## D2 nâng cao

Viewer mặc định có toolbar và tự tải chunk controls sau hydration, nhưng D2/WASM vẫn chỉ chạy lúc build. Luôn đăng ký cả hai component; `interactive=false` chọn component server-only:

```tsx
import { D2InteractiveDiagram } from '@vanhiep99w/docs-kit/components/d2-interactive';
// Thêm D2InteractiveDiagram vào MDX components bên cạnh D2Diagram.
```

````mdx
```d2 mode=steps title="Rollback"
account: "10M"
steps: {
  update: {account: "0 — chưa commit"}
  rollback: {account: "10M — đã rollback"}
}
```
````

- `interactive=true` (mặc định): mở sẵn toolbar icon fit/zoom/fullscreen và pan; source/copy/tải SVG trong panel nổi. `interactive=false` tắt toolbar cho mode static.
- `mode=steps`: bước trước/sau; `mode=tabs`: scenarios; `mode=explorer`: layers/drill-down.
- `mode=animation`: phát có điều khiển và tải animated SVG. Không autoplay khi mở trang.
- Source Explorer adapter mở implementation khi click node, không reload.
- Imports `.d2`, icon local và TTF tùy chỉnh chạy lúc build, có giới hạn tài nguyên và cache theo nội dung.
- Giữ fallback đọc source/các board không cần JS, dark mode, keyboard và reduced-motion.

**[Hướng dẫn, API, ví dụ và giới hạn →](./docs/d2.md)** · **[Bộ mẫu D2 →](./examples/d2/)**

Không thêm D2 CLI hoặc WASM vào browser. Chunk viewer tự tải sau hydration, không cần bấm Explore. ELK algorithms nâng cao và export PNG/PDF/PPTX không nằm trong API này.

## Worker pool và cache CI

Bản `0.1.0` khởi động Node/WASM cho từng diagram. Từ `0.2.0`, một broker local điều phối hàng đợi cho các worker giữ sẵn instance D2. Next.js compile MDX ở nhiều tiến trình vẫn dùng chung pool, thay vì mỗi tiến trình tạo thêm một pool riêng.

- Mặc định một worker để ưu tiên RAM khi build trên CI nhỏ. Thử hai worker nếu đã đo thấy phù hợp; không tăng số worker một cách máy móc.
- Mỗi worker chỉ xử lý một diagram tại một thời điểm để giới hạn tài nguyên sử dụng.
- Light/dark, sketch và đo chữ vừa ô vẫn giữ nguyên. Pool tối ưu phần khởi động, không bỏ bước render.
- Pool tự đóng khi rảnh, không giữ tiến trình build chờ nó. Worker bị treo được dừng sau timeout; tác vụ lỗi được báo rõ và worker được tạo lại cho tác vụ tiếp theo.
- Socket, khóa khởi động và log nằm trong thư mục tạm riêng của hệ điều hành, không đi vào cache CI. Đây không phải HTTP service công khai hay Cloudflare Worker.

### Số đo local

Đo ngày 2026-10-16 trên Node 24.21.0, Intel Core Ultra 7 265U. Bộ mẫu lấy từ tài liệu `angular-learn`; không phải số đo trên Cloudflare:

| Trường hợp | Kết quả |
| --- | --- |
| 12 diagram, Node/WASM mới mỗi diagram, không disk cache | 62.56 giây |
| Cùng 12 diagram, một worker dùng lại, không disk cache | 5.84 giây; SVG light/dark giống hệt baseline |
| Toàn bộ site, xóa cache Next/MDX/D2 trước khi build | 113.21 giây; 205 diagram, một worker khởi tạo |
| Build lại site với cache, đã tắt worker từ lượt trước | 40.52 giây; không khởi động worker mới |

Tốc độ tăng khoảng 10.7 lần ở **bộ mẫu render 12 diagram**, không phải cam kết toàn bộ build hoặc mọi máy đều nhanh hơn theo cùng tỷ lệ. Cấu hình CPU/RAM và trạng thái cache của CI ảnh hưởng kết quả.

### Cloudflare Pages

Bật **Settings → Build → Build cache** trên Pages, dùng build system V2 hoặc mới hơn. Với Next.js, tài liệu Cloudflare liệt kê `.next/cache` là thư mục được lưu/khôi phục. Không mặc định cho rằng `.cache/docs-kit/d2` cũng được nền tảng lưu lại.

```ts
remarkPlugins: [[remarkD2, {
  cacheDir: '.next/cache/docs-kit/d2',
}]],
```

Nếu site dùng `distDir: 'dist'`, có thể đặt cache D2 riêng tại `.next/cache/docs-kit/d2` để trùng đường dẫn Cloudflare công bố. Cache D2 không phải output để deploy. Kiểm tra log restore cache trên nền tảng thực tế; package không tự bật được setting trong dashboard.

Cache có thể bị xóa hoặc hết hạn. Worker pool vẫn giúp build khi cache lạnh; cache chỉ bỏ qua việc render các diagram không đổi. Thời gian chạy local không đảm bảo tương đương thời gian trên Cloudflare.

Nguồn: [Cloudflare Pages build caching](https://developers.cloudflare.com/pages/configuration/build-caching/).

## Kiến trúc package

```text
src/
├── d2/
│   ├── index.ts          # Remark plugin + cache portable
│   ├── pool-client.ts   # Kết nối/shared startup giữa các MDX process
│   ├── pool-server.mjs  # Broker local, hàng đợi và lifecycle worker
│   ├── pool-worker.mjs  # Instance D2/WASM dùng lại
│   └── render.mjs       # Render light/dark, đo và fit nhãn
├── components/
│   ├── d2.tsx                  # Pure React component
│   └── source-explorer/        # Client provider, SourceRef và lazy drawer
├── source-explorer/
│   └── index.ts                # Types và URL helpers, không phụ thuộc React
└── styles/
    ├── d2.css
    ├── source-explorer.css
    └── source-explorer-fumadocs.css # Layout adapter tùy chọn
```

Public entry points:

- `@vanhiep99w/docs-kit/d2`: **build-time / Node.js**, không import trong client component.
- `@vanhiep99w/docs-kit/components/d2`: React component + `D2DiagramProps`.
- `@vanhiep99w/docs-kit/components/d2-interactive`: optional client boundary + automatically loaded viewer.
- `@vanhiep99w/docs-kit/styles/d2.css`: stylesheet cho static và viewer.

Không có barrel export gom plugin và component. Khi thêm tính năng, tạo module/component/CSS và subpath export tương ứng; không cần tạo package mới ngay. Giữ default an toàn và thêm tests trước khi đưa component mới vào API công khai.

## Phát triển và kiểm thử

```bash
npm ci
npm run typecheck
npm test
npm run test:pack
npm run test:browser # Chrome local hoặc Chromium của Playwright
npm run benchmark -- --count 12
# Hoặc lấy mẫu từ tài liệu thực tế:
npm run benchmark -- --docs ../angular-learn/content/docs --count 12
```

- `npm run benchmark`: so sánh một Node/WASM mới cho mỗi diagram với một worker dùng lại, không dùng disk cache; kiểm tra SVG light/dark giống hệt nhau. Kết quả phụ thuộc máy đo, không phải cam kết tốc độ CI.
- `npm test`: build và kiểm tra chuyển đổi MDX, config, cache portable, SVG ID, accessibility, label fitting, pool đa tiến trình, crash/timeout/restart, tự đóng, giới hạn bộ nhớ đệm; Source Explorer URL helpers, SSR không cần Next.js và các client/lazy/CSS entry points. Các tests cũng chạy từ working directory không chứa code của host.
- `npm run test:pack`: tạo `.tgz`, cài vào consumer độc lập trong thư mục tạm, compile MDX và render component. Bước này cần registry để cài dependency của consumer.
- `npm pack`: tự build qua `prepare`; đóng gói `dist`, README, license và package manifest.

Sau khi thay đổi package local, build lại và cài lại bản package trong website. Với bản `.tgz`, tạo pack mới trước khi cài. Nâng version khi chia sẻ thay đổi giữa các repository.

## Phát hành

Package dùng [MIT License](./LICENSE). CI chỉ chạy kiểm thử, không tự động publish và không lưu token trong repository.

Quy trình phát hành:

1. Chạy unit tests và isolated packed-consumer test.
2. Nâng version khi tạo bản phát hành mới.
3. Commit thay đổi và push branch lên GitHub.
4. Đăng nhập tài khoản có quyền trên npm scope `@vanhiep99w`, chạy `npm publish --access public` và xác nhận 2FA nếu npm yêu cầu.
5. Kiểm tra version trên registry, rồi tạo/push tag `v<version>` tương ứng với commit đã phát hành.

Không commit `.tgz`, `dist`, cache, token hay `node_modules`. Một version đã publish không được ghi đè; thay đổi tiếp theo cần version mới.
