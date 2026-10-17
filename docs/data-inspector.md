# Structured Data Inspector

> MVP local, chưa publish. Chỉ khám phá một JSON document tĩnh; không fetch API, decode JWT hoặc xác minh payload theo schema.

Cây JSON có kiểu dữ liệu, mở/thu nhánh, tìm kiếm literal, chọn field để copy JSON Pointer/value và chú thích theo field. JSON source được giữ nguyên, kể cả số nguyên lớn hoặc exponent ngoài miền JavaScript Number.

## 1. Tích hợp MDX/Fumadocs

Thêm remark plugin, giữ nguyên collection và các plugin khác:

```ts
import { defineConfig } from 'fumadocs-mdx/config';
import { remarkDataInspector } from '@vanhiep99w/docs-kit/data-inspector';

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkDataInspector],
  },
});
```

Đăng ký component trong map MDX:

```tsx
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { DataInspector } from '@vanhiep99w/docs-kit/components/data-inspector';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    DataInspector,
    ...components,
  };
}
```

Import CSS sau stylesheet của website:

```css
@import '@vanhiep99w/docs-kit/styles/data-inspector.css';
```

Không cần Next.js, editor, Shiki hoặc provider. Plugin chỉ xử lý fence `data-inspector`, không sửa fence `json` thông thường. Đặt trước plugin có thể chuyển code fence thành component khác.

## 2. Viết trong MDX

````mdx
```data-inspector
title: Event envelope
expandedDepth: 1
json: |-
  {
    "eventId": "evt_demo",
    "sequence": 9007199254740993,
    "value": {
      "orderId": "order_001",
      "items": [{"sku": "book-01", "quantity": 2}]
    }
  }
annotations:
  - id: sequence
    pointer: /sequence
    title: Số nguyên lớn được giữ nguyên
    description: Copy value không chuyển số qua JavaScript Number.
  - id: sku
    pointer: /value/items/0/sku
    title: Chọn phần tử mảng theo index
    description: JSON Pointer dùng index từ 0; đây chỉ là path điều hướng, không kiểm chứng contract của event.
```
````

Descriptor là YAML nhưng **payload trong `json` phải là chuỗi JSON chuẩn**. Không viết payload thành YAML object: quá trình parse YAML hoặc JavaScript trước đó có thể đã làm tròn số.

## 3. Hợp đồng dữ liệu

| Field | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `title` | Có | Tên payload |
| `json` | Có | Chuỗi JSON nguồn không rỗng |
| `description` | Không | Nguồn dữ liệu, giả định hoặc giới hạn |
| `expandedDepth` | Không | Số cấp mở ban đầu, số nguyên 0–8, mặc định 1 |
| `annotations` | Không | 1–100 chú thích nếu cung cấp |

Root có depth 0. `expandedDepth: 1` mở container root, nhưng không tự mở các container con. Nhánh là tổ tiên của field được chú thích luôn mở ban đầu để link đọc được cả khi không có JavaScript. Người đọc vẫn có thể thu lại nhánh đó.

Mỗi annotation gồm:

- `id`: duy nhất trong document; ASCII chữ/số/`_`/`-`, bắt đầu bằng chữ hoặc số.
- `pointer`: JSON Pointer tới một value node tồn tại; chuỗi rỗng `''` trỏ root.
- `title`, `description`: text không rỗng, không interpret HTML/Markdown.

Có thể có nhiều annotation trên cùng field nếu ID khác nhau. Pointer sai hoặc field không tồn tại sẽ báo lỗi build, không tự fallback sang root.

## 4. Quy ước path: JSON Pointer RFC 6901

| Pointer | Trỏ tới |
| --- | --- |
| Chuỗi rỗng `''` | Root document |
| `/user/id` | Field id bên trong user |
| `/items/0/sku` | Field sku của phần tử đầu tiên |
| `/` | Field có key rỗng ở root |
| `/a~1b` | Key nguyên văn `a/b` |
| `/custom~0flag` | Key nguyên văn `custom~flag` |
| `/a.b` | Key nguyên văn `a.b`, không phải hai cấp a → b |

Escape `~` thành `~0`, `/` thành `~1`. Các key object dạng số vẫn là key; array index được kiểm tra ở dạng chuẩn `0`, `1`, …, không nhận `/items/01` như alias cho `/items/1`.

Không nhận JSONPath, JavaScript dot notation, URI fragment dạng `#/...`, wildcard hoặc script. Dấu `%` và Unicode trong key là ký tự nguyên văn, không tự URL-decode. Link trong giao diện dùng ID scope theo instance; không dùng pointer làm HTML ID.

Copy path ở root trả **chuỗi rỗng thật**, không trả chữ `(root)`; giao diện hiện `(root: "")` để dễ nhận biết.

## 5. Copy value và số lớn

- Copy value trả **JSON source**, không phải giá trị đã chuyển kiểu: string có quote/escape, object/array giữ formatting, scalar giữ lexeme gốc.
- Copy root trả nguyên chuỗi `json`, bao gồm whitespace và line endings ngoài root.
- Copy field con trả đúng source span của value đó, không kèm key hoặc dấu phẩy bên cạnh.
- `9007199254740993`, `-0`, `1.2300`, `1e309` được hiển thị/copy nguyên lexeme; không chuyển qua Number, BigInt hoặc tính toán.
- Không hứa bảo toàn dữ liệu đã bị consumer làm tròn trước khi gọi helper. Ví dụ `JSON.stringify({ id: 9007199254740993 })` đã có thể sai trước khi viewer nhận chuỗi.
- String/key được decode để hiển thị hoặc tìm kiếm, nhưng copy value vẫn lấy nguyên source. Vì vậy `"\\u0061"` có thể tìm bằng chữ `a` trong khi copy vẫn giữ escape gốc.
- String/number preview dài được rút gọn sau 120 Unicode code points. Copy value và phần **JSON gốc** vẫn chứa toàn bộ nội dung.

Clipboard cần được browser cho phép. Nếu thất bại có thông báo mở JSON gốc để chọn/copy thủ công. Không có server fallback và không gửi payload ra ngoài.

## 6. Tìm kiếm và tương tác

- Tìm literal không phân biệt hoa/thường trên key, pointer và scalar value; không chạy regex/JSONPath.
- Tối đa 200 UTF-16 code units của query; bỏ whitespace đầu/cuối, không bỏ dấu tiếng Việt hoặc normalize Unicode.
- Chỉ hiện node khớp và các tổ tiên cần thiết. Container đếm tổng số field/phần tử gốc, không phải số node đang hiển thị sau filter.
- Khi tìm kiếm, các nhánh tổ tiên tự mở; điều khiển mở/thu tất cả và toggle summary bị khóa để không giấu kết quả. Xóa query trở về trạng thái mở/thu trước đó.
- Chọn field bằng nút **Chọn** để cập nhật pointer/type và copy đúng value. Selection không tự fetch hoặc thay đổi document.
- Annotation link xóa filter, chọn field và mở các tổ tiên nếu cần; vẫn là fragment link native khi không có JavaScript.
- Bấm Mở tất cả/Thu tất cả chỉ thay đổi trình bày; field hoặc nội dung JSON không bị sửa.

Đây là nested lists + native details, không khai báo ARIA tree widget. Keyboard dùng Tab/Shift+Tab để đến summary/button, Enter/Space để mở/thu hoặc chọn; chưa có roving focus bằng phím mũi tên.

## 7. Fallback, responsive và theme

- HTML server render có cây JSON, chú thích và toàn bộ JSON gốc.
- Không JavaScript: search/copy/select controls được ẩn; native details mở/thu được, các tổ tiên annotation đã mở sẵn, source đầy đủ luôn có trong disclosure.
- Chỉ preview được rút gọn, không cắt dữ liệu nguồn. JSON gốc giữ toàn bộ payload trong HTML; thu gọn không phải cơ chế giữ bí mật.
- JSON gốc rộng cuộn ngang; cây sâu/đặc có scroll riêng. Không thu nhỏ font để ép vừa mobile.
- CSS kế thừa font/màu Fumadocs, có fallback ngoài Fumadocs. Dark mode theo `.dark` hoặc `[data-theme='dark']` của host, không tự theo hệ điều hành.
- Có nhãn type cho object, array, string, number, boolean và null; không chỉ dựa vào màu.
- Không autoplay, animation bắt buộc, editor hoặc virtualization trong MVP.

## 8. API ngoài remark

Chuẩn bị dữ liệu tại build/server:

```tsx
import { prepareDataInspector } from '@vanhiep99w/docs-kit/data-inspector';
import { DataInspector } from '@vanhiep99w/docs-kit/components/data-inspector';

const data = prepareDataInspector({
  title: 'Payload tĩnh',
  json: '{"id":9007199254740993,"active":true}',
});

<DataInspector data={data} />
```

`prepareDataInspector(input)` là **sync**, validate JSON và tạo index source spans. `parseDataInspectorDescriptor(yamlSource)` parse cả descriptor rồi chuẩn bị dữ liệu. Không tự đọc filesystem, nhận URL, decode JWT hoặc gọi API.

`DataInspectorProps`: `data: PreparedDataInspector`, `className?`. Component chỉ nhận artifact đã chuẩn bị, không import parser JSONC/YAML xuống browser. Metadata node gồm pointer, key, type, offset/length và children; không serialize numeric `.value` của parser.

Module `/data-inspector/data` cung cấp types và các helper nhẹ:

- `encodeJSONPointer`, `decodeJSONPointer`, `inspectorParent`.
- `inspectorValue`, `inspectorPreview`, `searchInspector`, `inspectorInitialExpanded`.
- `validateDataInspectorInput`, `validatePreparedDataInspector`.

Dùng `/data` cho types/helpers ở client. Không import module build-time `/data-inspector` vào client. Component chỉ dùng native JSON parsing cho **scalar string lexemes**, không parse numeric payload thành Number.

## 9. Validation và ranh giới tin cậy

- Chỉ nhận JSON chuẩn: không comment, trailing comma, undefined, NaN, nhiều document hoặc unquoted key.
- Object có key lặp bị từ chối, kể cả escape khác nhau nhưng decode ra cùng key. Các key như `__proto__` là dữ liệu bình thường, dùng Map thay vì gán vào prototype.
- Giới hạn: 262144 UTF-16 code units nguồn, 1024 value nodes tính cả root, path depth tối đa 32, 100 annotation nếu có. Key/property wrappers không tính thành value node riêng.
- Build parser kiểm tra cú pháp JSON và duplicate keys. Validator phía component kiểm tra cấu trúc artifact, pointer, spans, liên kết child và annotation; **không chạy lại toàn bộ parser để chứng minh artifact mô tả đầy đủ source**. Chỉ dùng artifact từ pipeline tin cậy.
- Lỗi remark có file/vị trí fence; lỗi JSON bên trong có thêm source offset. Không tự sửa hoặc silently đổi payload sai.
- React escape key, value, source và lời giải thích. Không render HTML, auto-link string URL, evaluate script, theo `$ref`, hoặc tải schema bên ngoài.
- Chỉ dùng cho nội dung repository tin cậy. Resource limits không thay thế sandbox/quota cho dịch vụ xử lý input công khai.
- Không có redaction, schema validation hoặc bảo đảm bảo mật dữ liệu tự động. Payload, token/claims giả lập và log phải được loại secrets trước khi publish.
- Không xác minh JWT signature/issuer/audience/expiration; không interpret GraphQL errors hoặc Kafka event thành kết luận nghiệp vụ.

## 10. Entry points và ví dụ

- `@vanhiep99w/docs-kit/data-inspector`: build helper, parser descriptor và remark plugin.
- `@vanhiep99w/docs-kit/data-inspector/data`: types, validator, JSON Pointer/search/source helpers.
- `@vanhiep99w/docs-kit/components/data-inspector`: client component SSR-readable.
- `@vanhiep99w/docs-kit/styles/data-inspector.css`: CSS riêng.

Ví dụ: [GraphQL response](../examples/data-inspector/graphql.mdx), [Kafka event](../examples/data-inspector/kafka-event.mdx), [JWT claims](../examples/data-inspector/jwt-claims.mdx).
