# Concurrency Lanes

**Giao diện 0.7.1 đã được tinh gọn:** xem [nội dung chính và thông tin mở rộng](./compact-ui.md). API/data cũ vẫn dùng được.

Timeline cho nhiều transaction/thread/actor: sự kiện tại một mốc, khoảng thực thi/chờ/giữ tài nguyên, và mũi tên tham chiếu các sự kiện. Dành cho giải thích lịch thực thi được biên soạn hoặc trace đã lọc; **không phải scheduler, SQL/JVM simulator hay công cụ chứng minh happens-before**.

## Tích hợp MDX / Fumadocs

Thêm vào pipeline và MDX components hiện có:

```ts
import { remarkConcurrencyLanes } from '@vanhiep99w/docs-kit/concurrency-lanes';

const mdxOptions = { remarkPlugins: [remarkConcurrencyLanes] };
```

```tsx
import { ConcurrencyLanes } from '@vanhiep99w/docs-kit/components/concurrency-lanes';

const components = { ConcurrencyLanes }; // merge với components hiện có
```

```css
@import '@vanhiep99w/docs-kit/styles/concurrency-lanes.css';
```

Import CSS sau stylesheet website. Font kế thừa website, màu dùng biến Fumadocs với fallback riêng; dark mode theo `.dark` hoặc `[data-theme='dark']` trên ancestor. Không cần provider, Next.js, D2, RxJS, Inspector hoặc tracing backend.

## Cú pháp

````mdx
```concurrency-lanes
title: Hai actor phối hợp
unit: step
provenance:
  kind: illustrative
  description: Lịch tổng hợp, không phải phép đo hay kiểm chứng một memory model.
lanes:
  - id: a
    label: Actor A
  - id: b
    label: Actor B
events:
  - id: release
    lane: a
    at: 2
    label: Giải phóng tài nguyên
  - id: acquire
    lane: b
    at: 3
    label: Lấy tài nguyên
intervals:
  - id: waiting
    lane: b
    start: 1
    end: 3
    kind: wait
    label: Chờ tài nguyên
    description: Khoảng chờ do tác giả khai báo; không phải CPU execution.
relations:
  - id: handoff
    from: release
    to: acquire
    label: Chuyển giao tài nguyên
    description: Quan hệ được biên soạn theo giả định của ví dụ, không được suy ra từ tọa độ.
```
````

## API React

Không cần helper chuẩn bị riêng khi đã có object đúng schema:

```tsx
import { ConcurrencyLanes, type ConcurrencyLanesData } from '@vanhiep99w/docs-kit/components/concurrency-lanes';

const data: ConcurrencyLanesData = {
  title: 'Một action', unit: 'step',
  provenance: { kind: 'illustrative', description: 'Dữ liệu tổng hợp.' },
  lanes: [{ id: 'actor', label: 'Actor' }],
  events: [{ id: 'e', lane: 'actor', at: 0, label: 'Bắt đầu' }],
};

export function Example() { return <ConcurrencyLanes data={data} />; }
```

Props: `{ data: ConcurrencyLanesData; className?: string }`.

Public entry points:

- `@vanhiep99w/docs-kit/concurrency-lanes`: **build-only**, `parseConcurrencyLanesDescriptor`, `remarkConcurrencyLanes` và types. YAML parser không đi vào client component.
- `@vanhiep99w/docs-kit/concurrency-lanes/data`: `validateConcurrencyLanes`, `layoutConcurrencyLanes`, `formatConcurrencyTime` và types; không React/Node/parser.
- `@vanhiep99w/docs-kit/components/concurrency-lanes`: component client có thể SSR trên React 18.3/19; selection là progressive enhancement.
- `@vanhiep99w/docs-kit/styles/concurrency-lanes.css`: stylesheet độc lập, không import các component khác.

## Hợp đồng dữ liệu

| Field | Ý nghĩa |
| --- | --- |
| `title`, `description?` | Tiêu đề và mô tả text |
| `unit` | `step` (bước logic), `ms`, `us` hoặc `s`; toàn bộ lane chung đơn vị và mốc 0 |
| `provenance` | Bắt buộc `{ kind: 'illustrative' \| 'measured', description }`; tác giả chịu trách nhiệm nhãn và giả định đo |
| `lanes` | 1–16 `{ id, label, description? }`, giữ thứ tự tác giả; lane trống hợp lệ |
| `events` | Bắt buộc, có thể rỗng nếu có interval; `{ id, lane, at, label, description? }` |
| `intervals?` | `{ id, lane, start, end, kind, label, description? }` |
| `relations?` | `{ id, from, to, label, description }`; description bắt buộc |

- Mọi ID duy nhất **xuyên lanes, events, intervals và relations**, ASCII `[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}`. Reference `lane` phải tồn tại.
- Tọa độ hữu hạn trong `[0, 1e12]`; `step` chỉ nhận số nguyên. Đây là vị trí tương đối, không phải timestamp tuyệt đối hoặc arbitrary-precision time.
- Interval có `end > start`; dùng event cho hành động tức thời. `kind`: `work` (thực thi), `wait` (chờ), `hold` (giữ tài nguyên). Nhãn tự khai báo được dùng cho lock, commit, cancellation… mà không tạo thêm mô hình thực thi.
- `from` và `to` chỉ trỏ tới **event**, không phải lane/interval, và không được cùng một event. Với handoff ở biên interval, khai báo event acquire/release rõ ràng.
- Quan hệ là mũi tên được tác giả đặt tên. Validator chỉ kiểm tra cấu trúc/reference, **không** xác minh program order, lock ownership, read-from, causality hoặc happens-before; không tìm deadlock, transitive closure hoặc cycle. Các assertion có chu trình hay tọa độ ngược vẫn được giữ nguyên để không giả vờ làm solver. Tác giả phải kiểm tra ý nghĩa và nêu giả định.
- Không tự tạo quan hệ vì hai điểm cùng mốc, nằm trên cùng lane hoặc xuất hiện trái/phải. Không suy ra trạng thái lock từ overlap, không tự thêm cạnh program order.

### Giới hạn

- Events tối đa 256, intervals tối đa 128; tổng events + intervals phải là 1–256. Relations tối đa 128.
- Mỗi text field không rỗng, tối đa 16384 UTF-16 code units; tổng title/description/provenance/lane/item/relation text tối đa 1048576.
- Descriptor YAML tối đa 2097152 code units; giới hạn alias expansion 100, unknown properties/duplicate keys đều báo lỗi. Remark errors giữ file/vị trí fence.
- Không nhận HTML, URL thực thi hoặc callback từ descriptor. Text được React escape, ID của DOM/SVG do component tạo riêng từng instance.

## Cách bố trí và đọc timeline

- Mỗi actor là một lane, chung trục từ 0 đến `max(event.at, interval.end)`, giữ cả khoảng trống đầu. Nếu tất cả ở 0, miền hiển thị 0–1 chỉ là fallback; dữ liệu vẫn ở 0 và có thông báo riêng.
- Event là marker tròn đánh số; interval là thanh có badge chữ nhật. Thực thi tô kín, chờ nét đứt, giữ tài nguyên viền dày. Nhãn text và loại luôn có trong chi tiết/bảng, không dựa vào màu đơn độc.
- Số ổn định theo thứ tự `events`, sau đó `intervals`, **không phải thứ tự thực thi**. Nội dung dưới hình nhóm theo lane, sắp xếp mốc bắt đầu; tie giữ thứ tự số. Sắp xếp này không khẳng định program order.
- Những mục quá gần/chồng nhau trong một lane được xếp vào các subtrack **theo chiều dọc**. Không dịch tọa độ ngang hoặc tăng thời lượng để né chồng. Subtrack không phải thread hay resource mới.
- Timeline có chiều rộng hình học 640px cộng cột lane 10rem. Trên mobile cuộn ngang giữ marker/font rõ, không co chữ và không đổi scale theo từng lane.
- Nhãn lane dài được ellipsis trong hình; nhãn và mô tả đầy đủ luôn ở phần chi tiết HTML. Nhãn item dài đặt bên dưới, không đè lên timeline.
- Nhãn số thời gian rút gọn 12 chữ số có nghĩa, không sửa source. Interval rất ngắn có thanh tối thiểu 1px và badge có bề rộng cố định để đọc số; không coi pixel là phép đo chính xác.
- Mũi tên có thể cắt qua mục khác trong hình dày; chọn relation hoặc endpoint để highlight, đọc tên và hai endpoint trong phần “Quan hệ được khai báo”. Với nhiều cạnh, tách ví dụ thay vì xem đây là graph router tự tránh mọi giao cắt.

## Tương tác và fallback

“Sự kiện và quan hệ” mặc định đóng; chọn số hoặc mũi tên bằng chuột/Enter để mở nhóm và `<details>` tương ứng rồi đi tới nội dung. Chọn event highlight cạnh liên quan; chọn relation highlight hai endpoint. Mở/thu summary bằng bàn phím vẫn là native disclosure; không ép các mục khác đóng lại.

SVG anchors có tên truy cập được và tham chiếu HTML thật. Khi không JavaScript, toàn bộ diagram, chi tiết, quan hệ và bảng vẫn SSR; người đọc mở từng summary để đọc. Auto-open/selection của ứng dụng là progressive enhancement, không phải điều kiện truy cập nội dung.

Không autoplay, không animation, không request mạng hoặc thực thi SQL/Java. Không có nút copy runnable session vì đây là sơ đồ diễn biến, không phải Terminal Session.

## Ví dụ và nguồn ngữ nghĩa

- [SQL row lock](../examples/concurrency-lanes/sql-row-lock.mdx): hai session PostgreSQL, READ COMMITTED, cùng `SELECT FOR UPDATE`; không timeout/savepoint/transaction thứ ba. Tham khảo [PostgreSQL — Row-Level Locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).
- [Java volatile publication](../examples/concurrency-lanes/java-publication.mdx): reader quan sát `ready=true` từ writer duy nhất; program order + synchronizes-with được khai báo, không suy ra từ trục. Tham khảo [JLS 21 §17.4.4](https://docs.oracle.com/javase/specs/jls/se21/html/jls-17.html#jls-17.4.4) và [§17.4.5](https://docs.oracle.com/javase/specs/jls/se21/html/jls-17.html#jls-17.4.5).

Cả hai fixture là minh họa, không phải benchmark hoặc execution được runtime kiểm chứng. Nội dung trong disclosure đang đóng vẫn nằm trong HTML công khai: không đưa secrets hoặc trace production chưa lọc vào docs.

MVP local chưa tích hợp/deploy trên website thật, chưa publish.
