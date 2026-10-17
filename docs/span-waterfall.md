# Span Waterfall

Timeline tĩnh cho tài liệu về latency, cache/database và distributed tracing. Mỗi span có một dòng riêng, chung mốc 0 và một thang thời gian; không phải tracing dashboard hoặc OpenTelemetry importer.

## Tích hợp MDX / Fumadocs

Thêm plugin vào pipeline hiện có, không bỏ plugin khác:

```ts
import { remarkSpanWaterfall } from '@vanhiep99w/docs-kit/span-waterfall';

// source.config.ts / mdxOptions
const mdxOptions = { remarkPlugins: [remarkSpanWaterfall] };
```

Đăng ký component trong MDX components và import CSS sau stylesheet website:

```tsx
import { SpanWaterfall } from '@vanhiep99w/docs-kit/components/span-waterfall';

const components = { SpanWaterfall }; // merge với components hiện có
```

```css
@import '@vanhiep99w/docs-kit/styles/span-waterfall.css';
```

Stylesheet này đã import `data-inspector.css`. Không cần Source Explorer provider, Next.js, tracing backend hay cấu hình riêng cho Fumadocs. Font kế thừa website; màu dùng biến Fumadocs nếu có, với fallback light/dark. Dark theo `.dark` hoặc `[data-theme='dark']` trên ancestor.

## Descriptor

````mdx
```span-waterfall
title: API gọi database
unit: ms
provenance:
  kind: illustrative
  description: Dữ liệu tổng hợp, cùng mốc thời gian; không phải benchmark.
spans:
  - id: request
    name: GET /demo
    service: api
    start: 0
    duration: 100
    status: ok
  - id: query
    parent: request
    name: SELECT demo
    service: postgres
    start: 15
    duration: 60
    attributes: '{"db.system.name":"postgresql","demo.sequence":9007199254740993}'
annotations:
  - id: query-time
    span: query
    title: Thời gian truy vấn
    description: Không tự động đồng nghĩa với critical path của request.
```
````

`attributes` là **chuỗi JSON strict**, không phải YAML object. Dùng `|-` cho JSON nhiều dòng nếu không muốn thêm newline cuối. Số lớn và number lexeme được giữ nguyên qua Data Inspector; không serialize lại qua JavaScript Number.

## API React / build helper

Helper chỉ dùng lúc build hoặc trên server:

```tsx
import { prepareSpanWaterfall } from '@vanhiep99w/docs-kit/span-waterfall';
import { SpanWaterfall } from '@vanhiep99w/docs-kit/components/span-waterfall';

const data = prepareSpanWaterfall({
  title: 'Local demo', unit: 'ms',
  provenance: { kind: 'illustrative', description: 'Dữ liệu tổng hợp.' },
  spans: [{ id: 'r', name: 'Request', service: 'api', start: 0, duration: 10 }],
});

export function Example() { return <SpanWaterfall data={data} />; }
```

Không import helper build-time vào client component. Với client, host truyền `PreparedSpanWaterfall` đã chuẩn bị sẵn.

| Field | Hợp đồng |
| --- | --- |
| `title` | Bắt buộc, chuỗi không rỗng |
| `description` | Mô tả tùy chọn |
| `unit` | `ms`, `us` hoặc `s`; tất cả span dùng cùng đơn vị |
| `provenance` | Bắt buộc: `{ kind: 'illustrative' \| 'measured', description }`; tác giả chịu trách nhiệm tính xác thực |
| `spans` | 1–256 span, ID duy nhất |
| `annotations` | Tùy chọn: 1–100 `{ id, span, title, description }`; `span` phải tồn tại |

Mỗi span:

- `id`, `name`, `service`, `start`, `duration` bắt buộc.
- `parent`: ID của span cha, có thể khai báo sau con; không tồn tại hoặc cycle đều báo lỗi.
- `start` là offset không âm từ mốc 0 chung, **không phải timestamp tuyệt đối**.
- `start`, `duration`, `start + duration` phải hữu hạn trong `[0, 1e12]`. Thời lượng dương không được nhỏ đến mức mất hoàn toàn khi cộng vào `start` theo precision của JavaScript Number. Thời gian không có cam kết chính xác kiểu arbitrary precision.
- `status`: `ok`, `error`, `unset`; bỏ qua tương đương `unset`, không suy ra trạng thái từ attributes.
- `description`: giải thích do tác giả khai báo.
- `attributes`: chuỗi JSON tùy chọn. Prepared span thay chuỗi bằng `PreparedDataInspector`.

Props component: `{ data: PreparedSpanWaterfall; className?: string }`.

Các export:

- `@vanhiep99w/docs-kit/span-waterfall`: `prepareSpanWaterfall`, `parseSpanWaterfallDescriptor`, `remarkSpanWaterfall` và types; build-only.
- `@vanhiep99w/docs-kit/span-waterfall/data`: validators input/prepared, `waterfallRows`, `waterfallExtent`, `formatSpanTime` và types; không parser/React. Helpers rows/extent nhận dữ liệu đã validate.
- `@vanhiep99w/docs-kit/components/span-waterfall`: client component + props/types; SSR được trên React 18.3/19.
- `@vanhiep99w/docs-kit/styles/span-waterfall.css`: CSS riêng + Inspector.

## Ngữ nghĩa timeline

- Thứ tự dòng là depth-first theo parent; siblings và roots giữ thứ tự tác giả, **không tự sort theo timestamp**. Thứ tự trên/dưới không chứng minh quan hệ nhân quả.
- Trục bắt đầu từ 0, kết thúc tại `max(start + duration)`; giữ cả khoảng idle đầu. Không dùng tổng duration để tính latency.
- Parent không bắt buộc chứa toàn bộ khoảng thời gian child: công việc bất đồng bộ hoặc clock skew có thể đi ra ngoài. Component không tự sửa timestamp, không phát hiện clock skew. Tác giả cần giải thích trường hợp này trong `description`/provenance.
- Span thời lượng 0 hiển thị vạch, không đổi timestamp để né chồng. Các duration dương rất ngắn có minimum 1px để nhìn thấy, không phải bằng chứng thời lượng tối thiểu.
- Khi tất cả span bắt đầu ở 0 và có duration 0, dùng miền hiển thị `[0, 1]` theo đơn vị đã chọn; duration trong dòng/bảng vẫn là 0. Đây là scale fallback, không phải trace kéo dài 1 đơn vị.
- Nhãn thời gian được rút gọn tới 12 chữ số có nghĩa để hạn chế nhiễu floating-point. Giá trị nguồn dùng để bố trí, không thay đổi dữ liệu.
- Màu phân biệt service (palette 6 màu luân phiên); luôn có nhãn service. Lỗi có nhãn “Lỗi” và họa tiết, không chỉ màu. Span không khai báo status có nhãn “Chưa xác định”.
- Không tính self time, critical path, phần trăm bottleneck hoặc quan hệ happens-before; không cộng/loại trừ overlap tự động.

## Tương tác và fallback

Chọn tên span bằng chuột hoặc Enter để mở và đi tới chi tiết. Dòng được chọn có `aria-current`; chi tiết dùng `<details>` native, không ép các mục khác đóng lại. Tại đó, Data Inspector cung cấp search và copy pointer/value cho attributes.

Khi không JavaScript, timeline/timing vẫn SSR đầy đủ; người đọc mở từng chi tiết và bảng thời gian bằng `<summary>`. Link vẫn có anchor thật, nhưng trạng thái chọn/mở tự động là progressive enhancement. Mọi span và attributes đều có trong HTML, không bị giấu chỉ vì chưa được chọn.

Trên màn hình hẹp, timeline cuộn ngang thay vì co chữ hoặc đổi thang giữa các dòng; bảng có vùng cuộn riêng, không đẩy rộng page. Không animation/autoplay nên reduced-motion không cần tắt hiệu ứng nào.

## Giới hạn và ranh giới tin cậy

- Độ sâu parent tối đa 16 (root = 0), ID ASCII dài tối đa 128 ký tự, text field tối đa 16384 UTF-16 code units. Tổng text source chính (title/description/provenance/name/service/attributes/annotations) tối đa 1048576 code units.
- Mỗi attributes dùng giới hạn Inspector: JSON 262144 code units, 1024 value nodes, depth 32; strict JSON, không duplicate keys/comment/trailing comma.
- Descriptor YAML tối đa 2097152 code units, alias expansion có giới hạn; unknown properties/duplicate keys báo lỗi. Remark error giữ file/vị trí fence.
- Không nhận HTML thô, không fetch trace, không export request/chạy code, không auto-redact secrets. Tất cả text được React escape.
- Attributes, kể cả native disclosure đang đóng, được publish công khai trong HTML/MDX assets. Chỉ đưa trace đã lọc, có quyền sử dụng; đừng đưa token, thông tin cá nhân hoặc dữ liệu production chưa kiểm tra vào docs.
- Hai fixture đều là dữ liệu tổng hợp, không có benchmark hoặc cam kết hiệu năng hệ thống: [API/cache/database](../examples/span-waterfall/api-cache.mdx), [fan-out microservices](../examples/span-waterfall/parallel-services.mdx).

MVP local chưa tích hợp/deploy trên website docs thật, chưa publish.
