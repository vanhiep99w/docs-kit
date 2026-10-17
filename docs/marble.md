# Marble Diagram

**Giao diện 0.7.1 đã được tinh gọn:** xem [nội dung chính và thông tin mở rộng](./compact-ui.md). API/data cũ vẫn dùng được.

> Bản chuẩn bị phát hành 0.7.1, chưa publish. Chỉ minh họa notification/lifecycle; không chạy RxJS, operator hay TestScheduler.

Marble dùng chung trục frame cho nhiều lane, hỗ trợ next/complete/error/subscribe/unsubscribe, nhóm cùng frame, legend giá trị và chú thích vùng thời gian. SVG, legend và bảng sự kiện dạng text đều được render trên server. Mặc định không cần client component, ResizeObserver, timer hoặc highlighter. Zoom là wrapper client opt-in, không đổi renderer/parser mặc định.

## 1. Tích hợp MDX/Fumadocs

Thêm plugin vào cấu hình hiện có:

```ts
import { defineConfig } from 'fumadocs-mdx/config';
import { remarkMarble } from '@vanhiep99w/docs-kit/marble';

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMarble],
  },
});
```

Đăng ký component trong map MDX, giữ nguyên component khác:

```tsx
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { MarbleDiagram } from '@vanhiep99w/docs-kit/components/marble';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    MarbleDiagram,
    ...components,
  };
}
```

Import CSS sau stylesheet của website:

```css
@import '@vanhiep99w/docs-kit/styles/marble.css';
```

Không cần Next.js, Fumadocs provider hoặc Source Explorer. Plugin chạy với MDX thông thường, chỉ xử lý fence `marble`; đặt trước plugin khác có thể thay thế code fence.

## 2. Viết trong MDX

````mdx
```marble
title: filter(even) → map(×10)
frameLabel: Cột minh họa, không phải ms
rows:
  - id: source
    label: source$
    kind: source
    marble: '-a-b-c-|'
  - id: output
    label: output$
    kind: output
    marble: '---x---|'
values:
  a: '1'
  b: '2'
  c: '3'
  x: '20'
caption: b và x ở frame 3; cả hai lane complete ở frame 7.
annotations:
  - id: mapping
    row: output
    frames: [3, 3]
    title: Đổi giá trị, giữ frame
    description: filter giữ 2; map đổi thành 20, không thêm delay.
```
````

Các chuỗi do tác giả cung cấp; component không suy ra output từ title hoặc code. Viết `switchMap(...)` không khiến package kiểm chứng được cancellation policy.

## 3. Ký pháp: visual-column, không phải TestScheduler

Parser giữ quy tắc cột của component hiện có trong `rxjs-learn`. Mọi lane dùng frame **tuyệt đối**, bắt đầu từ **0**.

| Ký hiệu | Ý nghĩa | Tiến trục frame |
| --- | --- | --- |
| `-` | Không có sự kiện ở cột này | 1 |
| Chữ ASCII hoặc số đơn, như `a`, `B`, `2` | Next với symbol đó | 1 |
| `\|` | Complete | 1 |
| `#` | Error | 1 |
| `^` | Subscribe | 1 |
| `!` | Unsubscribe | 1 |
| `(ab)` hoặc `(a\|)` | Các sự kiện cùng frame theo thứ tự trong nhóm | **1 cho cả nhóm** |
| Whitespace | Căn dòng, bỏ qua | 0 |

Ví dụ:

- `--a--|`: `a` ở frame 2, complete ở frame 5.
- `--(a|)-b` không hợp lệ: có next sau complete.
- `--(a|)--`: next và complete cùng ở frame 2, rồi hai cột trống.
- `-^-x-!`: subscribe ở 1, next ở 3, unsubscribe ở 5.

**Khác TestScheduler:**

- `(...)` ở đây chỉ chiếm **một cột**; không dùng cách RxJS đếm toàn bộ ký tự group để tiến thời gian.
- `^` là marker lifecycle có chiếm cột, không đặt lại zero của hot Observable. Không có frame âm.
- Không hỗ trợ time progression như `10ms`, `2s`, `1m`, kể cả khi kẹp giữa các dấu `-`. Các chuỗi chữ/số giống duration này được dành riêng và bị từ chối để tránh hiểu nhầm là đồng hồ thật.
- Không hỗ trợ nested groups, `-` trong group, Unicode làm symbol, payload nhiều ký tự, escape syntax hoặc operator execution.
- Payload dài/Unicode nằm trong `values`, không nằm trong symbol trên hình.

Không copy chuỗi này vào `TestScheduler` rồi mặc định chúng có cùng thời gian. Dùng test RxJS riêng để kiểm chứng hành vi; package này chỉ kiểm tra schema/cú pháp, không kiểm tra tính đúng đắn của operator.

### Terminal và cửa sổ hiển thị

Sau `|`, `#` hoặc `!`, lane không được có thêm sự kiện, kể cả cùng group. Có thể thêm `-` để giữ độ rộng cửa sổ. Mỗi lane có tối đa một `^`; dùng lane khác cho execution/subscription khác.

Không bắt buộc mọi lane phải có terminal marker. Lane rỗng hoặc chỉ có `-` biểu diễn cửa sổ không có sự kiện. Baseline và mũi tên chỉ là trục thời gian, **không chứng minh producer vẫn chạy** sau terminal marker.

`kind` chỉ là nhãn trình bày; không biến lane thành một mô hình subscription được thực thi hoặc một assertion RxJS. Component không tự suy ra cold/hot, sharing, teardown vật lý, thread hoặc scheduler.

## 4. Hợp đồng dữ liệu

### Diagram

| Field | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `title` | Có | Tiêu đề ngắn, thường là tên operator hoặc hành vi |
| `rows` | Có | 1–40 lane trên cùng trục frame |
| `caption` | Không | Giải thích kết luận/giả định |
| `frameLabel` | Không | Diễn giải thang đo; mặc định ghi rõ là frame minh họa, không mặc định ms |
| `values` | Không | Map symbol chữ/số đơn → chuỗi mô tả không rỗng |
| `showLegend` | Không | Hiện legend ký hiệu; mặc định `true` |
| `zoom` | Không | Boolean, mặc định `false`; remark sinh `MarbleZoomDiagram` khi `true` |
| `annotations` | Không | 1–100 chú thích nếu cung cấp |

### Row

- `label`: chuỗi không rỗng; label dài xuống dòng trong cột HTML riêng, không đè lên marker.
- `marble`: chuỗi ký pháp; có thể rỗng.
- `kind?`: `source`, `inner`, `output`, `subscription`.
- `id?`: ID duy nhất trong diagram nếu có. Bắt đầu bằng chữ/số ASCII, chỉ gồm chữ/số/`_`/`-`. Cần ID khi row được annotation tham chiếu.

Mỗi row tối đa 4096 ký tự đầu vào, 512 cột; mỗi group tối đa 12 sự kiện. Đây là giới hạn bảo vệ layout cơ bản, không phải sandbox/quota cho dịch vụ public.

### Annotation

```yaml
annotations:
  - id: cancel
    row: inner-a
    frames: [5, 5]
    title: Hủy inner cũ
    description: Input mới unsubscribe inner A, không gọi complete handler của A.
```

- `id`: duy nhất trong danh sách annotation, cùng quy tắc ASCII identifier.
- `row`: tham chiếu **row.id**, không dùng label hoặc số thứ tự.
- `frames`: `[start, end]`, zero-based, gồm cả hai đầu, nằm trong trục chung của diagram.
- `title`, `description`: text không rỗng; không interpret HTML/Markdown.
- Có thể chú thích vùng không có event hoặc sau điểm kết thúc của lane ngắn hơn để giải thích sự vắng mặt. Không được vượt cửa sổ chung.

Vùng chú thích được đánh dấu sẵn, kèm danh sách giải thích. Không cần hover, selection, animation hay JavaScript để đọc được nội dung.

## 5. Layout và accessibility

- Mặc định 48px mỗi frame, không thu nhỏ marker/chữ để ép vừa mobile. Static prop `frameWidth` có thể chọn 36–96px; zoom wrapper dùng cùng primitive này.
- Tất cả lane và ruler dùng cùng tọa độ x. Nhóm cùng frame được xếp **dọc**, nối theo cùng một cột; không dịch marker sang thời điểm khác để né chồng lấp.
- Cột label riêng rộng 10rem, sticky khi cuộn ngang; label dài tự xuống dòng.
- Timeline rộng có horizontal scroll; vùng scroll focus được bằng keyboard. Có zoom opt-in ở phần dưới; pan vẫn là horizontal scroll native.
- SVG không bị kéo giãn theo container, không có đo lại bằng JavaScript; diagram ngắn có thể để lại khoảng trống bên phải.
- Dark mode theo `.dark` hoặc `[data-theme='dark']` của host; có fallback màu ngoài Fumadocs. Không animation/autoplay.
- SVG được đánh dấu trang trí với trình đọc màn hình. Caption, legend, annotation và **Bảng sự kiện** native cung cấp nội dung dạng text đầy đủ.
- Mở Bảng sự kiện bằng click hoặc Enter/Space trên summary, kể cả khi tắt JavaScript. Có cả chuỗi gốc và từng sự kiện/frame/payload; không phải chỉ một ảnh SVG không có diễn giải.
- Màu hỗ trợ phân biệt symbol, không mang ngữ nghĩa duy nhất. Error, complete, subscribe và unsubscribe có hình/nhãn riêng.

### Zoom opt-in

Đăng ký thêm component client, giữ `MarbleDiagram` cho diagram thường:

```tsx
import { MarbleZoomDiagram } from '@vanhiep99w/docs-kit/components/marble-zoom';
const components = { MarbleDiagram, MarbleZoomDiagram };
```

Thêm `zoom: true` vào descriptor `marble`; dùng cùng `marble.css`, không thêm stylesheet. Với JSX, chọn `<MarbleZoomDiagram data={data} />` hoặc direct props `<MarbleZoomDiagram title="..." rows={rows} />`. Chỉ truyền `zoom` cho static `<MarbleDiagram>` không tự biến server component thành client viewer; flag này là lựa chọn của remark.

- Năm mức spacing: 36/48/60/72/96px tương ứng 75/100/125/150/200%; mặc định 100%. Tất cả lane, ruler và annotation bands dùng cùng spacing.
- Marker/font/khoảng xếp group theo chiều dọc không đổi; timestamps/frame và payload giữ nguyên. Không scale SVG bằng transform hoặc ép vừa container.
- Thu nhỏ/phóng to/đặt lại hỗ trợ keyboard, focus giữ tại control kể cả ở biên (`aria-disabled`). Đặt lại chỉ trở về 100%, không fit toàn bộ timeline.
- Khi đổi mức, cố gắng giữ frame ở giữa vùng đọc (không tính cột label sticky); scrollLeft vẫn bị giới hạn bởi browser ở hai đầu.
- Native event-table disclosure giữ trạng thái khi zoom. `data`/direct-props identity mới reset zoom về 100%; không mutate model tại chỗ.
- Không JavaScript: toolbar ẩn, diagram SSR 48px/frame, legend/chú thích/bảng vẫn đọc được. Không thêm timer/autoplay, ResizeObserver hoặc RxJS.

Ví dụ: [Marble zoom](../examples/marble/zoom.mdx). Static component vẫn không có `use client`, `useState` hoặc `useEffect`; bundle zoom chỉ được import khi host chọn entry này.

## 6. API JSX và migration từ rxjs-learn

Giữ API JSX trực tiếp để không cần sửa mọi bài viết cũ:

```tsx
import { MarbleDiagram } from '@vanhiep99w/docs-kit/components/marble';

<MarbleDiagram
  title="switchMap(project)"
  rows={[
    { label: 'outer', marble: '-a---b----|', kind: 'source' },
    { label: 'inner A', marble: '-^-x-!', kind: 'inner' },
    { label: 'inner B', marble: '-----^-x---y|', kind: 'inner' },
    { label: 'output', marble: '---x---x---y|', kind: 'output' },
  ]}
  values={{ a: 'Input A', b: 'Input B', x: 'Kết quả đầu', y: 'Kết quả sau' }}
  frameLabel="Frame minh họa"
  caption="B ở frame 5 hủy A; output chờ inner B kết thúc."
/>
```

Cũng hỗ trợ `<MarbleDiagram data={data} className="..." />` giống các component mới của docs-kit. Không trộn `data` với các field direct; `className` là prop ngoài dữ liệu.

### Migration đề xuất

1. Cài bản docs-kit local/đóng gói đã build vào website RxJS.
2. Đổi import trong `mdx-components.tsx` sang `@vanhiep99w/docs-kit/components/marble`, giữ merge order của MDX map.
3. Import `@vanhiep99w/docs-kit/styles/marble.css` trong global CSS.
4. Build website và kiểm tra các bài có group, label dài, cancellation và frameLabel định lượng.
5. Sau khi xác nhận mới xóa component/CSS module cũ. Nếu còn import trực tiếp đường dẫn local, có thể tạm dùng shim:

```ts
export { MarbleDiagram } from '@vanhiep99w/docs-kit/components/marble';
export type { MarbleDiagramProps, MarbleRow } from '@vanhiep99w/docs-kit/components/marble';
```

**Chưa sửa repository RxJS trong đợt triển khai này.** Package giữ vị trí frame của 301 chuỗi unique lấy từ checkout RxJS hiện tại, có snapshot test hermetic trong `tests/fixtures/marble-legacy-rows.json`. Layout được điều chỉnh: title ở header, marker cùng frame xếp dọc, cột label HTML, không còn operator band hoặc ResizeObserver. Không coi snapshot syntax test là kiểm chứng mọi output của các operator trong bài viết.

Implementation được xây từ quy tắc và API của `rxjs-learn/components/marble-diagram.tsx`, đồng thời tách parser/validation và bỏ phụ thuộc CSS module/framework. Không cần checkout repo RxJS để build, test hoặc sử dụng package.

## 7. Parser và module dữ liệu

Dùng parser YAML tại build/server:

```ts
import { parseMarbleDescriptor } from '@vanhiep99w/docs-kit/marble';
const data = parseMarbleDescriptor(yamlSource);
```

Types và parser cột nhẹ dùng được ngoài Node.js:

```ts
import { parseMarble, prepareMarbleDiagram, validateMarbleDiagram } from '@vanhiep99w/docs-kit/marble/data';

const row = parseMarble({ label: 'output', marble: '--(a|)' });
// row.tokens: next a @ frame 2; complete @ frame 2.
// row.frameCount: 3.
```

`prepareMarbleDiagram(data)` validate và trả `{ rows, frameCount }`; mỗi parsed row có `tokens` và `frameCount`. Không mutate input. `validateMarbleDiagram(unknown)` chỉ validate/narrow type. `describeMarbleToken` là text helper; ký hiệu và nhãn có qua `marbleSymbols`, `marbleSyntaxLabels`.

Không import module YAML `/marble` trong client component. Dùng `/marble/data` nếu cần parser hoặc types ở browser; đây vẫn chỉ là parser minh họa, không đưa RxJS vào bundle.

## 8. An toàn và giới hạn

- React escape mọi label, caption, legend, annotation và payload. Không nhận SVG/HTML thô, không evaluate JavaScript từ descriptor.
- Schema, ID, range, ký hiệu không hỗ trợ, group lỗi và sự kiện sau terminal đều báo lỗi; remark kèm file/vị trí fence. Không tự sửa timeline sai.
- Chỉ compile nội dung do tác giả tin cậy quản lý. Giới hạn cú pháp không thay thế sandbox, quota hoặc kiểm duyệt dữ liệu public.
- Diagram và Bảng sự kiện đều được publish công khai trong HTML; không đưa secrets vào values/caption.
- Không có timeline span/duration, critical path, concurrency simulator, negative frames hoặc kiểm chứng happens-before. Các biến thể đó là hạng mục khác, không được suy ra từ Marble.

## 9. Entry points và ví dụ

- `@vanhiep99w/docs-kit/marble`: remark plugin và parser YAML build-time.
- `@vanhiep99w/docs-kit/marble/data`: types, parser/validation và text helpers; không Node.js/RxJS/YAML.
- `@vanhiep99w/docs-kit/components/marble`: component React server-first, hỗ trợ direct/data props và `frameWidth?: number` (36–96).
- `@vanhiep99w/docs-kit/components/marble-zoom`: `MarbleZoomDiagram` client opt-in, cùng direct/data props, không nhận `frameWidth` override.
- `@vanhiep99w/docs-kit/styles/marble.css`: CSS độc lập.

Ví dụ: [filter/map](../examples/marble/filter-map.mdx), [switchMap](../examples/marble/switch-map.mdx), [lifecycle/group](../examples/marble/lifecycle.mdx).
