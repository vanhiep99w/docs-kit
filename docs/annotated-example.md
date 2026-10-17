# Annotated Example

> MVP trong bản phát triển local; chưa publish. Không cần thay đổi cấu hình D2 hoặc Source Explorer đang có.

Ví dụ code, config hoặc output có chú thích gắn với vùng dòng. Chọn chú thích để highlight; tất cả code và lời giải thích vẫn hiển thị khi không có JavaScript.

- Syntax highlighting light/dark bằng Shiki lúc build; không gửi Shiki, WASM hay YAML parser xuống browser.
- Code và chú thích được React escape; không nhận HTML highlight thô.
- Copy dùng chuỗi code gốc, không lấy số dòng hoặc chú thích.
- Container rộng: code và chú thích cạnh nhau. Container hẹp: chú thích bên dưới, code cuộn ngang.
- Không có playground, thực thi code, tải project hoặc request đến dịch vụ bên ngoài.

## 1. Đăng ký plugin

Trong `source.config.ts`, giữ nguyên các collection và plugin khác:

```ts
import { defineConfig } from 'fumadocs-mdx/config';
import { remarkAnnotatedExample } from '@vanhiep99w/docs-kit/annotated-example';

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkAnnotatedExample],
  },
});
```

Plugin là remark plugin thông thường, dùng được với MDX ngoài Fumadocs. Chỉ xử lý fence ngôn ngữ `annotated`; không sửa các code fence khác. Plugin nên chạy trước các plugin chuyển code fence thành component khác.

## 2. Đăng ký component MDX

```tsx
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { AnnotatedExample } from '@vanhiep99w/docs-kit/components/annotated-example';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    AnnotatedExample,
    ...components,
  };
}
```

Import CSS một lần, sau stylesheet của website:

```css
@import '@vanhiep99w/docs-kit/styles/annotated-example.css';
```

Component kế thừa font và các biến màu Fumadocs, có màu fallback cho website khác. Dark mode theo `.dark` hoặc `[data-theme='dark']` ở phần tử tổ tiên. Không tự đổi theo theme hệ điều hành.

## 3. Viết trong MDX

Fence chứa một YAML descriptor, không phải code được thực thi:

````mdx
```annotated
title: Lọc và nhóm đơn hàng
language: sql
code: |-
  SELECT customer_id, SUM(total) AS revenue
  FROM orders
  WHERE status = 'paid'
  GROUP BY customer_id
  HAVING SUM(total) > 1000;
annotations:
  - id: input
    title: Lọc dòng đầu vào
    description: WHERE loại đơn chưa thanh toán trước khi tính tổng.
    ranges: [[2, 3]]
  - id: groups
    title: Lọc nhóm kết quả
    description: HAVING lọc trên kết quả tổng hợp theo khách hàng.
    ranges: [[1, 1], [4, 5]]
```
````

### Hợp đồng descriptor

| Field | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `title` | Có | Tiêu đề ví dụ |
| `code` | Có | Chuỗi code/config/output; có thể rỗng |
| `language` | Không | Tên/alias ngôn ngữ bundled của Shiki; mặc định `text` |
| `annotations` | Có | Mảng chú thích không rỗng |
| `source` | Không | Reference tới source đầy đủ; xem adapter bên dưới |

Mỗi annotation:

- `id`: duy nhất trong ví dụ, bắt đầu bằng chữ hoặc số; chỉ gồm chữ ASCII, số, `_`, `-`.
- `title`, `description`: chuỗi không rỗng, hiển thị như text; chưa hỗ trợ Markdown/MDX trong nội dung này.
- `ranges`: mảng `[start, end]`, tính từ **1**, gồm cả hai đầu. Một chú thích có thể có nhiều vùng; các chú thích được phép chồng vùng.
- Ranges chỉ trỏ vào **code hiển thị**, không phải số dòng trong file MDX hoặc source đầy đủ.

Code được tách dòng khi gặp LF, CRLF hoặc CR. Copy giữ nguyên chuỗi đầu vào của component. Khi viết YAML, quy tắc block scalar của YAML được áp dụng trước: `|-` bỏ newline cuối, `|` giữ một newline cuối, `|+` giữ các newline cuối. Một newline cuối tạo thêm một dòng trống được đánh số trong viewer.

Sai schema/range, ID lặp, YAML không hợp lệ, top-level field không hỗ trợ hoặc ngôn ngữ/theme không nhận diện được sẽ báo lỗi build kèm file và vị trí fence. Không tự fallback từ ngôn ngữ sai sang plain text.

### Tương tác và fallback

- Chuột hoặc Enter trên chú thích chọn toàn bộ ranges của chú thích đó.
- Không tự chuyển focus ra khỏi chú thích hoặc cuộn trang khi chọn; chỉ cuộn viewport code tới đầu vùng đầu tiên nếu cần.
- Không JavaScript: chú thích là liên kết đến dòng đầu của range đầu tiên; CSS đánh dấu dòng đích. Những vùng còn lại vẫn được ghi trong nhãn dòng.
- Nút copy chỉ xuất hiện sau khi hydrate. Nếu clipboard bị chặn hoặc không khả dụng, có thông báo để copy thủ công.
- Chế độ theo bước trước/sau đã có trong extension [Code Walkthrough](./code-walkthrough.md), dùng lại component này. Chưa đồng bộ node D2.

## 4. Tùy chọn highlighting

```ts
remarkPlugins: [[remarkAnnotatedExample, {
  themes: { light: 'github-light', dark: 'github-dark' },
}]],
```

Chỉ nhận tên theme bundled của Shiki. Theme tùy chỉnh dạng object chưa nằm trong API. Font style của từng theme được giữ riêng.

## 5. Kết nối Source Explorer tùy chọn

Khi descriptor có `source`, plugin sinh `AnnotatedExampleWithSource`. Đăng ký adapter này bên cạnh component chính:

```tsx
import { AnnotatedExampleWithSource } from '@vanhiep99w/docs-kit/components/annotated-example-source';

// Thêm vào map MDX components, giữ nguyên các component hiện có.
const components = { AnnotatedExample, AnnotatedExampleWithSource };
```

Thêm field vào descriptor:

```yaml
source:
  project: demo
  snapshot: basic
  file: src/main.ts
  region: entry
```

Dùng `SourceExplorerProvider`, manifest và CSS theo hướng dẫn [Source Explorer trong README](../README.md#source-explorer). Adapter dùng `SourceRef` hiện có; drawer vẫn chỉ lazy-load khi mở. Component cơ bản không import provider hoặc drawer.

Source reference hỗ trợ `project`, `snapshot`, `file`, `region` hoặc `lines`. Không kết hợp `region` với `lines`. `source.lines` là chuỗi dòng hoặc range như `'10-18'`, tính trên **source đầy đủ**; không tự cộng offset từ ví dụ inline.

Ngoài provider, liên kết source vẫn được render thành URL query nhưng không có drawer để mở. Không JavaScript cũng chỉ có URL reference; website muốn cung cấp trang source đọc được hoàn toàn không JavaScript cần tự xây trang đích. Plugin không tạo source assets và không kiểm tra file/region có tồn tại trong manifest; pipeline của website chịu trách nhiệm kiểm tra reference đó.

## 6. Dùng ngoài remark/MDX

Chuẩn bị dữ liệu ở build/server:

```ts
import { prepareAnnotatedExample } from '@vanhiep99w/docs-kit/annotated-example';

const data = await prepareAnnotatedExample({
  title: 'Một biến cấu hình',
  language: 'typescript',
  code: 'const retries = 3;',
  annotations: [{
    id: 'retry-limit',
    title: 'Giới hạn retry',
    description: 'Giá trị minh họa; cần chọn theo yêu cầu thực tế.',
    ranges: [[1, 1]],
  }],
});
```

Render bằng React:

```tsx
import { AnnotatedExample } from '@vanhiep99w/docs-kit/components/annotated-example';

<AnnotatedExample data={data} />
```

Có thể bỏ bước prepare và truyền dữ liệu không có `tokens`: component render code escaped, không syntax highlighting. Không import module build-time vào client component. Cả API trực tiếp và remark đều validate ranges.

`AnnotatedExampleProps` gồm `data`, `className?`, `sourceLink?: ReactNode`, `activeAnnotation?: string | null`, `onAnnotationSelect?: (id: string) => void`. Hai props cuối là controlled selection tùy chọn cho Walkthrough/host: bỏ qua thì hành vi internal selection không đổi; ID phải thuộc annotations, `null` xóa highlight. `sourceLink` dành cho host muốn thay liên kết source mặc định; truyền `false` để ẩn liên kết. Types thuần và validator dùng được từ `@vanhiep99w/docs-kit/annotated-example/data` mà không import Shiki hoặc Node.js.

MVP không tự đọc file từ filesystem hoặc resolve imports. Nếu muốn đưa file thật vào ví dụ, pipeline build của website đọc và cắt code trước khi gọi `prepareAnnotatedExample`.

## 7. An toàn và giới hạn

- Chỉ dùng pipeline build với nội dung do tác giả tin cậy quản lý. Có validation nhưng đây không phải dịch vụ compile input công khai có quota/sandbox.
- Không nhúng HTML tùy ý; token chỉ gồm text, màu hex và font-style bitmask được kiểm tra. Nội dung chú thích không được interpret thành HTML.
- Source, code và payload được publish công khai trong HTML/dữ liệu trang; không đưa secrets hoặc log production chưa lọc vào ví dụ.
- Không có cắt bớt/virtualization; giữ ví dụ inline ngắn, dùng Source Explorer cho project hoặc file lớn.
- Chưa có deep link theo ID annotation; liên kết dòng được scope theo instance React để tránh trùng ID khi hiển thị nhiều ví dụ.
- Các annotation hiển thị đầy đủ; không dùng tab để giấu lời giải thích, không autoplay hoặc animation bắt buộc.

## 8. Entry points và ví dụ

- `@vanhiep99w/docs-kit/annotated-example`: build-time prepare helper và remark plugin.
- `@vanhiep99w/docs-kit/annotated-example/data`: types, `codeLines`, validator; không có Node.js/Shiki.
- `@vanhiep99w/docs-kit/components/annotated-example`: React component cơ bản.
- `@vanhiep99w/docs-kit/components/annotated-example-source`: adapter Source Explorer tùy chọn.
- `@vanhiep99w/docs-kit/styles/annotated-example.css`: CSS được scope vào component.

Ví dụ: [Kubernetes](../examples/annotated-example/kubernetes.mdx), [SQL](../examples/annotated-example/sql.mdx), [RxJS](../examples/annotated-example/rxjs.mdx).

Extension theo bước: [Code Walkthrough](./code-walkthrough.md) dùng snapshots/steps và controlled selection, không thay schema `annotated` hoặc viewer hiện có.
