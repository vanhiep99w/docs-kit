# Code Walkthrough

Khung code kiểu terminal dành cho developer đọc tài liệu: tên file/snapshot, copy, bộ chọn bước và trước/sau. Không có sidebar chú thích, các panel snapshot lồng nhau hay footer giới thiệu. Chỉ lời giải thích của bước đang đọc được hiển thị.

## Tích hợp

```ts
import { remarkCodeWalkthrough } from '@vanhiep99w/docs-kit/code-walkthrough';
const mdxOptions = { remarkPlugins: [remarkCodeWalkthrough] };
```

```tsx
import { CodeWalkthrough } from '@vanhiep99w/docs-kit/components/code-walkthrough';
const components = { CodeWalkthrough };
```

```css
@import '@vanhiep99w/docs-kit/styles/code-walkthrough.css';
```

CSS độc lập, không cần stylesheet component khác hoặc provider. Bề mặt terminal dùng màu tối và syntax tokens dark ngay cả khi website dùng theme sáng; bố cục không đổi khi host chuyển theme.

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


## Dữ liệu và giới hạn

- `title`, `description?`, `language?`: tiêu đề, metadata và language mặc định (`text`). Description chung không render; viết bối cảnh trong bài MDX.
- `snapshots`: 1–12 `{ id, title, code, language?, source?, tokens? }`.
- `steps`: 1–64 `{ id, title, description, snapshot, ranges }`, theo thứ tự tác giả, có thể quay lại snapshot cũ.
- `ranges`: 1–16 cặp `[start, end]`, one-based inclusive trên snapshot của bước đó. Cho phép nhiều vùng và vùng chồng nhau. Vùng đầu tiên là mục tiêu cuộn viewport.
- Mỗi snapshot phải có ít nhất một bước tham chiếu. ID ASCII duy nhất trong từng nhóm, tối đa 128 ký tự. Unknown fields và duplicate YAML keys báo lỗi.
- Mỗi snapshot tối đa 262144 UTF-16 code units, 4096 dòng hiển thị; toàn bộ tối đa 8192 dòng, 131072 tokens, 1048576 text/code units. Text không rỗng và tối đa 16384 units; riêng code được phép rỗng. YAML descriptor tối đa 2097152 units.
- Shiki chỉ chạy lúc build. `language` của snapshot ghi đè language chung. `tokens` là prepared data, không được viết trong YAML.
- Copy giữ nguyên toàn bộ snapshot: CRLF/CR/LF, whitespace, Unicode và newline cuối. Số dòng không được copy.

## Tương tác

Ban đầu chọn bước đầu tiên, không nhất thiết là snapshot đầu mảng. Chọn bước bằng select hoặc nút trước/sau. Nút ở biên bị disabled; không wrap/autoplay. Highlight mọi range của bước hiện tại và chỉ cuộn viewport code, không thay URL/history hoặc cuộn trang. Mỗi snapshot render code một lần.

Host thay object `data` sẽ reset về bước đầu. Clipboard bị chặn có thông báo trợ năng và code vẫn chọn/copy thủ công được.

Không JavaScript: mọi code snapshot và danh sách bước/lời giải thích vẫn có trong HTML; controls cần JavaScript ẩn đi. Không thực thi code, tải source từ mạng hay suy ra diff. Mọi snapshot đều được publish, kể cả snapshot chưa chọn: không đưa secrets vào dữ liệu.

## Source Explorer tùy chọn

Khi snapshot có `source`, plugin sinh `CodeWalkthroughWithSource`; đăng ký adapter:

```tsx
import { CodeWalkthroughWithSource } from '@vanhiep99w/docs-kit/components/code-walkthrough-source';
const components = { CodeWalkthrough, CodeWalkthroughWithSource };
```

`source` dùng hợp đồng Source Explorer: `{ project, snapshot?, file?, region?, lines? }`, không dùng đồng thời region và lines. Adapter mở đúng source của snapshot đang chọn. Ngoài provider, link là URL reference. Host có thể thay link qua `renderSourceLink(snapshot)`; trả `false` để ẩn.

## API build/server

```tsx
import { prepareCodeWalkthrough } from '@vanhiep99w/docs-kit/code-walkthrough';
import { validateCodeWalkthrough } from '@vanhiep99w/docs-kit/code-walkthrough/data';

const data = await prepareCodeWalkthrough({
  title: 'Giới hạn retry', language: 'typescript',
  snapshots: [{ id: 'a', title: 'retry.ts', code: 'const retries = 3;' }],
  steps: [{ id: 'retry', snapshot: 'a', title: 'Số lần thử', description: 'Thử lại tối đa 3 lần.', ranges: [[1, 1]] }],
});
```

`prepareCodeWalkthrough(input, { themes?: { light?, dark? } })` và `parseCodeWalkthroughDescriptor(yaml, options?)` chỉ dùng ở build/server. Validator/types ở `code-walkthrough/data` không import React, Node, Shiki hoặc YAML. Có thể truyền dữ liệu chưa có tokens trực tiếp để render text escaped.

Props component: `{ data, className?, renderSourceLink?: (snapshot) => ReactNode }`.

**Migration:** helper và validator đã chuyển khỏi namespace component cũ. `walkthroughExample` đã xoá; schema snapshots/steps không đổi.

Ví dụ: [nullable guard](../examples/code-walkthrough/walkthrough-guard.mdx), [Dockerfile](../examples/code-walkthrough/walkthrough-dockerfile.mdx).
