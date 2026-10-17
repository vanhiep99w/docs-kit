# Code / Config Diff

**Giao diện 0.7.1 đã được tinh gọn:** xem [nội dung chính và thông tin mở rộng](./compact-ui.md). API/data cũ vẫn dùng được.

> Bản chuẩn bị phát hành 0.7.1, chưa publish. Có inline/split view và word diff opt-in, giữ mặc định inline và line diff cũ.

Hiển thị thay đổi trước–sau kèm lý do, số dòng riêng của mỗi phiên bản và copy nguyên bản. Diff và highlighting được chuẩn bị lúc build; browser chỉ nhận code, token an toàn và danh sách dòng đã tính.

## 1. Tích hợp MDX/Fumadocs

Đăng ký plugin trong cấu hình hiện có, giữ nguyên collection và các plugin khác:

```ts
import { defineConfig } from 'fumadocs-mdx/config';
import { remarkCodeDiff } from '@vanhiep99w/docs-kit/code-diff';

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkCodeDiff],
  },
});
```

Đăng ký component trong map MDX:

```tsx
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { CodeDiff } from '@vanhiep99w/docs-kit/components/code-diff';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    CodeDiff,
    ...components,
  };
}
```

Import CSS sau stylesheet của website:

```css
@import '@vanhiep99w/docs-kit/styles/code-diff.css';
```

Không cần Next.js hoặc Source Explorer cho diff thông thường. Remark plugin chỉ xử lý fence `code-diff`; đặt trước plugin có thể chuyển code fence thành component khác. Fence `diff` thông thường không bị thay đổi.

## 2. Viết trong MDX

````mdx
```code-diff
title: Giới hạn retry
language: typescript
contextLines: 3
before:
  label: Cách viết ban đầu
  code: |-
    const retries = 10;
    run({ retries });
after:
  label: Cấu hình sau thay đổi
  code: |-
    const retries = 3;
    run({ retries });
annotations:
  - id: retry-limit
    side: after
    title: Giảm retry không phải quy tắc mặc định
    description: Giá trị chỉ để minh họa; cần chọn theo yêu cầu nghiệp vụ và deadline.
    ranges: [[1, 1]]
```
````

Không tự suy ra thay đổi này tốt hơn, kiểm chứng code, benchmark hoặc chạy migration. Tác giả chịu trách nhiệm giải thích điều kiện áp dụng.

Caption, mô tả annotation và footer “Chi tiết” không render. Viết ngữ cảnh cần thiết trong bài MDX. Annotation ranges vẫn highlight/pin dòng không đổi.

## 3. Hợp đồng descriptor

| Field | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `title` | Có | Tên ví dụ |
| `before`, `after` | Có | Hai phiên bản, mỗi bên có `code` |
| `language` | Không | Tên/alias ngôn ngữ bundled của Shiki; mặc định `text` |
| `caption` | Không | Metadata bối cảnh; không render |
| `contextLines` | Không | Số dòng không đổi quanh thay đổi; số nguyên 0–20, mặc định 3 |
| `annotations` | Không | 1–100 chú thích nếu cung cấp |
| `view` | Không | `inline` (mặc định) hoặc `split`; chế độ SSR ban đầu |
| `wordDiff` | Không | Boolean, mặc định `false`; tính chi tiết từ lúc build |

### Mỗi phiên bản

- `code`: chuỗi gốc, được phép rỗng.
- `label?`: nhãn phiên bản, tên file hoặc tên cấu hình; metadata; toolbar dùng nhãn Trước/Sau.
- `source?`: reference tới Source Explorer, xem phần adapter.
- `tokens?`: dữ liệu highlight đã được validate; thường do build helper tự sinh. Không cần tự viết trong YAML.

Cả hai bên dùng cùng `language`. Nếu khác ngôn ngữ, cân nhắc hai code block riêng thay vì mô tả như một file diff.

### Annotation

Dùng `DiffAnnotation` với các trường sau (metadata tương thích; không render lời giải thích bên dưới):

- `id`: duy nhất trong toàn bộ diff, quy tắc chữ/số ASCII/`_`/`-`, bắt đầu bằng chữ hoặc số.
- `side`: `before` hoặc `after`.
- `ranges`: các `[start, end]` inclusive, tính từ **1 trên phiên bản gốc của bên đó**, không phải số dòng trong diff.
- `title`, `description`: text không rỗng, không interpret Markdown/HTML.

Một dòng giữ nguyên có thể là dòng 10 ở before và dòng 12 ở after. Annotation before/after vẫn trỏ đúng phiên bản, không tự cộng offset. Chú thích trên các dòng không đổi khiến các dòng đó luôn hiện, không bị giấu trong phần thu gọn.

File rỗng có **0 dòng vật lý** nên không có range hợp lệ để chú thích. Đây là khác biệt có chủ đích với viewer code inline có thể đánh số một dòng trống khi nhận chuỗi rỗng.

## 4. Ngữ nghĩa diff, newline và copy

- So sánh chính xác từng dòng, **bao gồm line ending**. Không trim whitespace, chuẩn hóa EOL hoặc bỏ qua dòng trống.
- File rỗng là 0 dòng; `a` và `a` kèm newline là hai nội dung khác nhau.
- Newline cuối kết thúc dòng, không tạo thêm một dòng diff giả. Ví dụ `a\n` là 1 dòng vật lý, `\n` là 1 dòng trống, chuỗi rỗng là 0 dòng.
- CRLF, CR và LF được nhận diện riêng. Chuyển cả file từ CRLF sang LF có thể hiện thành xóa/thêm mọi dòng.
- Dòng cuối thiếu newline chỉ có ký hiệu `∅↵` khi khác biệt giữa hai bản; nếu cả hai đều thiếu newline thì không lặp note. EOL note và gutters không thuộc code được copy.
- Copy lấy **toàn bộ chuỗi code gốc** của bên được chọn, gồm cả phần đang thu gọn; không lấy dấu +/−, số dòng hoặc chú thích.
- YAML `|-`, `|`, `|+` vẫn có quy tắc giữ/bỏ newline cuối trước khi dữ liệu đến component. Dùng `|-` khi không muốn vô tình đưa newline cuối vào ví dụ.
- Clipboard cần được browser cho phép. Nút copy chỉ xuất hiện sau hydrate; nếu thất bại có thông báo. Không gửi code tới server để copy.

Đây là line diff trình bày tài liệu, **không phải unified Git patch**. Chưa có rename/move detection, apply patch, download patch, whitespace-ignore, character-level diff hoặc semantic diff.

## 5. Layout và fallback không JavaScript

- **Inline view** mặc định: hai cột số dòng trước/sau, dấu −/+ và code. `view: split` render hai bên ngay từ SSR; nút Inline/Song song xuất hiện sau hydrate, giữ focus khi đổi.
- Split view ghép các dòng xóa/thêm theo vị trí trong từng hunk; dòng thừa có ô trống bên đối diện, không có số dòng giả. Dòng giữ nguyên xuất hiện ở cả hai bên. Hai bên dùng chung vùng cuộn và disclosure; CSS grid/subgrid yêu cầu browser hiện đại.
- Đổi view không chạy lại diff; ranges vẫn thuộc đúng side/line. Disclosure reset khi đổi chế độ. Object `data` mới reset về `data.view` (hoặc inline); host nên giữ identity ổn định khi dữ liệu không đổi.
- Dùng cả ký hiệu lẫn màu để phân biệt thêm/xóa. Có text trợ giúp cho trình đọc màn hình.
- Phần không đổi xa thay đổi được nhóm trong native `<details>`. Mở bằng click hoặc keyboard, không cần JavaScript.
- Tất cả phần thêm/xóa đều có trong HTML server render; tất cả phần không đổi cũng có trong disclosure, không fetch khi mở.
- Copy và nút đổi view cần JavaScript; chế độ SSR được cấu hình vẫn đọc được khi không JavaScript.
- Code rộng cuộn trong viewer; không thu nhỏ chữ để ép vừa mobile.
- CSS kế thừa font/màu Fumadocs, có fallback ngoài Fumadocs; dark mode theo `.dark` hoặc `[data-theme='dark']` của host. Không animation bắt buộc.
- Không có thay đổi: hiển thị thông báo hai bản giống nhau; phần code không đổi vẫn mở được từ disclosure. Hai file rỗng có thông báo riêng.

### Word diff opt-in

```yaml
view: split
wordDiff: true
```

- Build helper dùng `Intl.Segmenter('und', { granularity: 'word' })` trên Node 22+; không gửi segmenter/diff engine vào browser. Chi tiết là từ/whitespace/punctuation, không phải semantic hoặc character diff. Kết quả segmentation có thể thay đổi theo ICU của Node.
- Trong mỗi hunk xóa/thêm liên tiếp, ghép dòng thứ N bên trước với dòng thứ N bên sau; không đo độ giống hoặc phát hiện move. Dòng không ghép vẫn có kiểu thêm/xóa toàn dòng, không có word ranges.
- Prepared rows thêm `ranges?: [start, end][]`, UTF-16 half-open trong text dòng, không tính EOL. Các ranges được render xuyên syntax tokens mà giữ màu/style và text. Newline/EOL-only thay đổi không có word highlight; metadata và dấu thêm/xóa vẫn thể hiện khác biệt.
- Token segmentation giữ Unicode clusters trong dữ liệu build; validator kiểm tra bounds, thứ tự, overlap và surrogate-pair boundaries, không tính lại word minimality. Không nhận ranges từ descriptor.
- Giới hạn 512 segment mỗi dòng, 65536 LCS cells mỗi cặp và 1000000 cells cho toàn bộ word pass. Nếu vượt budget, cặp đó highlight toàn bộ text dòng, không báo độ chính xác giả. Word detail là bổ sung; không thay đổi line diff, numbering hoặc copy.
- Vùng chi tiết có background và gạch chân, vẫn có dấu thêm/xóa và text trợ giúp; không chỉ dựa vào màu. Không chạy API/parser ngôn ngữ để suy ra ý nghĩa.

Ví dụ: [Split view + word diff](../examples/code-diff/split-words.mdx).

## 6. Source Explorer adapter tùy chọn

Khi `before.source` hoặc `after.source` được cung cấp, plugin sinh `CodeDiffWithSource`. Đăng ký adapter bên cạnh component cơ bản:

```tsx
import { CodeDiffWithSource } from '@vanhiep99w/docs-kit/components/code-diff-source';

// Thêm CodeDiffWithSource vào map MDX components hiện có.
```

Descriptor có thể trỏ tới hai snapshot/file khác nhau:

```yaml
before:
  code: 'export const demo = 0;'
  source:
    project: demo
    snapshot: v0
    file: src/main.ts
after:
  code: 'export const demo = 1;'
  source:
    project: demo
    snapshot: v1
    file: src/main.ts
```

Host tích hợp `SourceExplorerProvider`, manifest và CSS theo [README](../README.md#source-explorer). Adapter dùng SourceRef hiện có; chỉ tải drawer khi mở source. Component cơ bản không import provider/drawer.

Không có provider, link vẫn render URL query nhưng không có drawer để mở. Không JavaScript cũng chỉ có URL reference; muốn trang source hoàn toàn không JavaScript, host phải cung cấp trang đích riêng.

`source.region` và `source.lines` không được kết hợp. Reference được validate về hình dạng, nhưng **không kiểm tra file/region tồn tại hoặc code inline khớp snapshot**. Pipeline host phải kiểm chứng điều đó trước khi publish. Ranges của annotation thuộc code inline; ranges source thuộc file đầy đủ, không tự cộng offset.

## 7. Build helper và pipeline snapshot

```tsx
import { prepareCodeDiff } from '@vanhiep99w/docs-kit/code-diff';
import { CodeDiff } from '@vanhiep99w/docs-kit/components/code-diff';

const data = await prepareCodeDiff({
  title: 'Thay đổi source',
  language: 'typescript',
  before: { code: beforeFile.code },
  after: { code: afterFile.code },
});

<CodeDiff data={data} />
```

`beforeFile`/`afterFile` có thể lấy từ snapshot được host resolve tại build-time. Không truyền `SourceFile.html`: helper highlight lại trên toàn bộ file để giữ context lexical như comment/string nhiều dòng. Không tự fetch manifest hoặc đọc filesystem.

Tùy chọn:

```ts
await prepareCodeDiff(input, {
  highlight: true,
  themes: { light: 'github-light', dark: 'github-dark' },
});
```

- `highlight` mặc định `true`; Shiki chỉ chạy lúc build.
- `highlight: false` không sinh token mới, giữ token hợp lệ đã được host cung cấp nếu có. Không kiểm tra tên ngôn ngữ/theme khi không sử dụng highlighter.
- Theme là tên bundled của Shiki. Token chỉ chứa text, màu hex và font-style bitmask; không dùng HTML highlight thô.
- `parseCodeDiffDescriptor(yamlSource, options?)` là helper **async**, trả `PreparedCodeDiff` sau parse, diff và highlight.
- `CodeDiff` chỉ nhận dữ liệu đã chuẩn bị, không chạy diff algorithm trong browser. Validator kiểm tra các rows tái dựng đủ cả hai file theo đúng số dòng, nhưng không tính lại thuật toán để chứng minh minimality.

`CodeDiffProps`: `data`, `className?`, `sourceLinks?: { before?: ReactNode; after?: ReactNode }`. Host có thể thay link mặc định hoặc truyền `false` để ẩn link từng bên. Không thêm thư viện viewer/editor vào component.

## 8. Giới hạn và an toàn

- Tối đa 2000 dòng vật lý và 262144 UTF-16 code units mỗi bên; tối đa 100 annotation khi cung cấp. Giữ ví dụ tài liệu ngắn, dùng Source Explorer cho file/project lớn.
- Diff dùng LCS có giới hạn, cắt prefix/suffix chung trước khi tạo matrix. Trường hợp xấu nhất là O(N×M), matrix khoảng 8 MB ở giới hạn dòng; xử lý lúc build, không serialize matrix hoặc diff engine cho client.
- Các dòng trùng lặp có thể có nhiều cách căn hợp lệ. Helper chọn kết quả ổn định, ưu tiên xóa khi hòa; không hứa giống Git hoặc mọi diff tool khác.
- Có validation cho schema, nguồn, token, ranges, numbering và reconstruction. Nội dung sai trong remark báo kèm file/vị trí fence.
- Code, metadata, chú thích và payload được React escape. Không `dangerouslySetInnerHTML`, không execute code hoặc apply thay đổi.
- Chỉ compile nội dung tin cậy trong repository. Giới hạn input không biến helper thành service diff public có sandbox/quota.
- Hai phiên bản đầy đủ đều được publish trong HTML/dữ liệu trang, kể cả phần thu gọn. Không đưa secrets hoặc policy/config chưa lọc vào ví dụ.
- Split view và word diff đã có từ bản phát triển 0.7.0. Source Explorer loader tự động và kiểm chứng code khớp snapshot chưa có.

## 9. Entry points và ví dụ

- `@vanhiep99w/docs-kit/code-diff`: build-time helper, parser YAML và remark plugin.
- `@vanhiep99w/docs-kit/code-diff/data`: types, line helpers, validator, `splitDiffRows` (projection chỉ số rows, không text diff) và cách nhóm phần thu gọn; không Shiki hoặc diff matrix.
- `@vanhiep99w/docs-kit/components/code-diff`: client component SSR-readable.
- `@vanhiep99w/docs-kit/components/code-diff-source`: adapter Source Explorer tùy chọn.
- `@vanhiep99w/docs-kit/styles/code-diff.css`: CSS độc lập.

Ví dụ: [Dockerfile](../examples/code-diff/dockerfile.mdx), [IAM policy](../examples/code-diff/iam-policy.mdx), [SQL query](../examples/code-diff/sql-query.mdx).
