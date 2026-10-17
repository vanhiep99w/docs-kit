# Code Walkthrough

Chế độ theo bước của [Annotated Example](./annotated-example.md): mỗi bước chọn một snapshot và một hoặc nhiều vùng dòng để giải thích. **Không có code viewer thứ hai**: copy, syntax tokens, range highlight, code viewport và chú thích vẫn do `AnnotatedExample` render.

Snapshot do tác giả cung cấp sẵn. Đây không phải playground, diff engine, Git history hoặc runtime kiểm chứng code.

## Tích hợp MDX / Fumadocs

Thêm plugin riêng khi cần, giữ các plugin hiện có:

```ts
import { remarkCodeWalkthrough } from '@vanhiep99w/docs-kit/annotated-example/walkthrough';

const mdxOptions = { remarkPlugins: [remarkCodeWalkthrough] };
```

`remarkAnnotatedExample` vẫn chỉ xử lý fence `annotated`. Có thể dùng hai plugin cùng lúc, không cần thay đổi các ví dụ cũ.

```tsx
import { CodeWalkthrough } from '@vanhiep99w/docs-kit/components/code-walkthrough';

const components = { CodeWalkthrough }; // merge với components hiện có
```

```css
@import '@vanhiep99w/docs-kit/styles/code-walkthrough.css';
```

Stylesheet đã import `annotated-example.css`; đặt sau CSS của website. Font kế thừa website, màu dùng biến Fumadocs với fallback; dark theo `.dark` hoặc `[data-theme='dark']` trên ancestor. Không cần Next.js hoặc provider cho component cơ bản.

## Descriptor

````mdx
```code-walkthrough
title: Thêm guard cho input nullable
language: typescript
snapshots:
  - id: before
    title: Trước
    code: |-
      function greet(name: string) {
        return name.trim();
      }
  - id: after
    title: Sau
    code: |-
      function greet(name: string | null) {
        if (name === null) return 'guest';
        return name.trim();
      }
steps:
  - id: contract
    snapshot: before
    title: Hợp đồng cũ
    description: Hàm nhận string, không phải runtime validation cho input từ mạng.
    ranges: [[1, 2]]
  - id: guard
    snapshot: after
    title: Kiểm tra null trước
    description: Guard trả sớm trước khi gọi trim.
    ranges: [[1, 2]]
  - id: string-path
    snapshot: after
    title: Nhánh string
    description: Đọc tiếp phần code sau guard; không chạy code để suy ra kết quả.
    ranges: [[3, 3]]
```
````

Một snapshot được dùng bởi nhiều bước chỉ được highlight lúc build và render code **một lần**, không nhân bản toàn bộ code cho mỗi bước. Thứ tự bước theo `steps`; có thể quay lại snapshot trước đó.

## Schema

| Field | Ý nghĩa |
| --- | --- |
| `title`, `description?` | Tiêu đề và lời dẫn text |
| `language?` | Ngôn ngữ mặc định cho snapshot; bỏ qua là `text` |
| `snapshots` | 1–12 `{ id, title, code, language?, source?, tokens? }` |
| `steps` | 1–64 `{ id, title, description, snapshot, ranges }` theo thứ tự tác giả |

- `snapshot.id` và `step.id` duy nhất trong từng nhóm, ASCII dài tối đa 128 ký tự. Hai nhóm có namespace riêng.
- Mỗi snapshot phải có ít nhất một bước tham chiếu; reference không tồn tại hoặc snapshot không dùng đều báo lỗi.
- `snapshot.language` ghi đè language chung. Shiki chỉ chạy lúc build, dùng themes và tập ngôn ngữ như Annotated Example.
- `ranges` là 1–16 `[start, end]`, one-based inclusive trên **snapshot của bước đó**, không phải file MDX hoặc source đầy đủ. Range chồng nhau và nhiều vùng rời nhau hợp lệ; vùng đầu tiên là mục tiêu cuộn code viewport.
- `code` có thể rỗng. LF/CRLF/CR tách dòng hiển thị như Annotated Example; copy giữ nguyên source, Unicode và newline cuối. YAML block scalar áp dụng trước khi component nhận chuỗi (`|-` bỏ newline cuối, `|` giữ một newline).
- `source` theo hợp đồng Source Explorer hiện có; `region` và `lines` không được dùng đồng thời. Inline range không tự chuyển thành source line range.
- `tokens` chỉ dùng cho API React/prepared data. Descriptor không nhận tokens; helper tạo tokens đã escape/validate, không HTML thô.

### Giới hạn

Mỗi code snapshot tối đa 262144 UTF-16 code units và 4096 dòng hiển thị; tổng tối đa 8192 dòng, 131072 prepared tokens và 1048576 text/code units. Text field không rỗng, tối đa 16384 units; descriptor YAML tối đa 2097152 units, alias expansion giới hạn 100. Unknown fields trong descriptor/schema và duplicate YAML keys đều bị từ chối; lỗi remark giữ file/vị trí fence.

Giới hạn token/dòng cũng áp dụng cho dữ liệu sau khi prepare; dùng file ngắn trong walkthrough và Source Explorer cho project lớn. Không virtualize, lazy-fetch hoặc giấu code ngoài HTML.

## Tương tác và fallback

- Ban đầu chọn bước đầu tiên và mở snapshot mà bước đó tham chiếu, không nhất thiết là snapshot đầu mảng.
- Nút trước/sau và danh sách bước đổi highlight, mở snapshot tương ứng, đóng các snapshot khác. Không autoplay hoặc wrap từ cuối về đầu.
- Nút ở biên có `aria-disabled`, vẫn nhận focus để không làm mất vị trí bàn phím; kích hoạt tại biên không có tác dụng.
- Chọn chú thích ngay trong Annotated Example cũng cập nhật bước đang chọn. Các lời giải thích của cùng snapshot vẫn hiện đầy đủ, không chỉ lời giải thích của bước active.
- Điều hướng bước không thay URL/history, không kéo focus ra khỏi control hoặc cuộn cả trang; renderer chỉ cuộn viewport code tới đầu range đầu tiên nếu cần.
- Người đọc vẫn có thể mở/thu snapshot bằng summary native để so sánh. Lần điều hướng bước tiếp theo đưa về chế độ đọc snapshot của bước được chọn.
- Khi host thay `data` bằng object mới, selection và disclosure reset về bước đầu, kể cả khi ID giữ nguyên. Host nên giữ identity ổn định khi dữ liệu không đổi.
- Copy luôn lấy **toàn bộ code của snapshot**, không chỉ ranges, không có số dòng/annotation/diff markers. Clipboard bị chặn có thông báo copy thủ công như component gốc.

Không JavaScript: mọi snapshot và lời giải thích đều đã SSR, mở/thu bằng `<details>`; danh sách bước có anchor thật tới snapshot và chú thích có anchor tới dòng. Nút trước/sau/copy ẩn khi chưa hydrate. Không hứa tự chọn nhiều vùng hoặc thay đổi step state khi không JavaScript; nội dung vẫn đọc đầy đủ bằng summary/line links.

Không có deep link bền vững theo step ID hoặc đồng bộ D2 trong MVP. Instance IDs được tạo theo React để không đụng nhau trên cùng trang.

## Source Explorer tùy chọn

Khi **bất kỳ** snapshot có `source`, plugin sinh `CodeWalkthroughWithSource`; đăng ký adapter:

```tsx
import { CodeWalkthroughWithSource } from '@vanhiep99w/docs-kit/components/code-walkthrough-source';

const components = { CodeWalkthrough, CodeWalkthroughWithSource };
```

```yaml
# Bên trong một snapshot:
source:
  project: demo
  snapshot: v2
  file: src/main.ts
  region: handler
```

Adapter dùng `SourceRef`/provider hiện có và mở đúng snapshot/file của panel, không tạo explorer mới. Ngoài provider, link chỉ là URL reference; host chịu trách nhiệm tạo manifest, validate file/region và cung cấp đích source nếu muốn đọc hoàn toàn không JavaScript. Thêm Source Explorer CSS/provider theo [README](../README.md#source-explorer).

## Dùng ngoài MDX

```tsx
// Build/server only
import { prepareCodeWalkthrough } from '@vanhiep99w/docs-kit/annotated-example/walkthrough';
import { CodeWalkthrough } from '@vanhiep99w/docs-kit/components/code-walkthrough';

const data = await prepareCodeWalkthrough({
  title: 'Một bước', language: 'typescript',
  snapshots: [{ id: 'a', title: 'Code', code: 'const retries = 3;' }],
  steps: [{ id: 'retry', snapshot: 'a', title: 'Giới hạn retry', description: 'Giá trị minh họa.', ranges: [[1, 1]] }],
}, { themes: { light: 'github-light', dark: 'github-dark' } });

export function Example() { return <CodeWalkthrough data={data} />; }
```

Có thể truyền `CodeWalkthroughData` không tokens trực tiếp để render text escaped. Không import helper/parser vào client component.

Props: `{ data, className?, renderSourceLink?: (snapshot) => ReactNode }`. Callback cho host thay source link từng snapshot; trả `false` để ẩn. Adapter cũng tôn trọng callback này.

### Controlled selection của Annotated Example

Component gốc có thêm props tùy chọn, không đổi API/data cũ:

```tsx
<AnnotatedExample
  data={example}
  activeAnnotation={selectedId} // string ID hợp lệ hoặc null để xóa highlight
  onAnnotationSelect={setSelectedId}
/>
```

Không truyền `activeAnnotation` thì selection vẫn internal như trước. Trong controlled mode, parent chịu trách nhiệm cập nhật ID; callback chỉ chạy khi chọn annotation, không khi code/highlight tự đổi. ID không thuộc `data.annotations` sẽ báo lỗi. Cơ chế này là phần Walkthrough dùng để điều hướng viewer gốc.

## Entry points và an toàn

- `@vanhiep99w/docs-kit/annotated-example/walkthrough`: build helper, descriptor parser, remark plugin và types.
- `@vanhiep99w/docs-kit/annotated-example/walkthrough-data`: validator, `walkthroughExample` (adapter dữ liệu đã validate sang AnnotatedExampleData) và types; không React/Node/Shiki/YAML.
- `@vanhiep99w/docs-kit/components/code-walkthrough`: lớp điều hướng + AnnotatedExample; không kéo Source Explorer provider/drawer vào client mặc định.
- `@vanhiep99w/docs-kit/components/code-walkthrough-source`: adapter opt-in.
- `@vanhiep99w/docs-kit/styles/code-walkthrough.css`: wrapper CSS + import stylesheet Annotated Example.

Chỉ build nội dung tác giả tin cậy quản lý. Không chạy code, apply patch, tự suy ra diff hoặc tải file từ filesystem/network. Source và mọi snapshot, kể cả panel đang đóng, được publish công khai trong HTML/dữ liệu trang; đừng đưa secrets hoặc dữ liệu production chưa lọc vào ví dụ.

Ví dụ: [nullable guard](../examples/annotated-example/walkthrough-guard.mdx), [Dockerfile layer order](../examples/annotated-example/walkthrough-dockerfile.mdx).

MVP local, chưa tích hợp/deploy website thật và chưa publish.
