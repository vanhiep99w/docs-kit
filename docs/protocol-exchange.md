# Protocol Exchange

Ví dụ HTTP tĩnh, tập trung vào request/response, headers và body. Không có các khối mô tả/chú thích dài, JSON tree, search hoặc footer giới thiệu. Không gửi request, follow redirect, chạy cURL hay lưu credentials.

## Tích hợp MDX/Fumadocs

```ts
import { remarkProtocolExchange } from '@vanhiep99w/docs-kit/protocol-exchange';
const mdxOptions = { remarkPlugins: [remarkProtocolExchange] };
```

```tsx
import { ProtocolExchange } from '@vanhiep99w/docs-kit/components/protocol-exchange';
const components = { ProtocolExchange };
```

```css
@import '@vanhiep99w/docs-kit/styles/protocol-exchange.css';
```

CSS độc lập, đặt sau stylesheet website. Không cần provider hoặc highlighter. Plugin chỉ xử lý fence `protocol-exchange`, không thay fence `http` thông thường.

## Descriptor

````mdx
```protocol-exchange
title: Profile API
variants:
  - id: ok
    title: Thành công
    request:
      method: GET
      url: /profiles/demo
      headers:
        - id: accept
          name: Accept
          value: application/json
    response:
      status: 200
      statusText: OK
      headers:
        - id: type
          name: Content-Type
          value: application/json
      body:
        kind: json
        json: '{"id":9007199254740993,"name":"Nguyễn An"}'
  - id: unauthorized
    title: Không được phép
    request: { method: GET, url: /profiles/demo }
    response:
      status: 401
      statusText: Unauthorized
      body: { kind: text, text: Unauthorized }
```
````

## Dữ liệu

| Trường | Ý nghĩa |
| --- | --- |
| `title` | Tiêu đề ví dụ |
| `variants` | 1–12 tình huống `{ id, title, request, response }` |
| `request.method` | HTTP method token viết hoa |
| `request.url` | URL origin-relative hoặc HTTP(S), chỉ hiển thị |
| `response.status` | Số nguyên 100–599 |
| `response.statusText?` | Text một dòng |
| `headers?` | Mảng có thứ tự `{ id, name, value }`, tối đa 64 mỗi message |
| `body?` | `{ kind: 'text', text }` hoặc `{ kind: 'json', json }` |

Header trùng tên được giữ riêng, không gộp `Set-Cookie`. ID header duy nhất trong message; ID variant duy nhất trong exchange. Header names là HTTP field-name token, không pseudo-header; value không chứa control/newline injection.

URL không chứa whitespace, fragment, backslash hoặc credentials nhúng; không nhận protocol-relative `//host` hoặc scheme khác HTTP(S). Không tự tạo link cho URL/Location.

Body rỗng và body vắng mặt là hai trường hợp khác nhau; body vắng không tạo placeholder. Response cho HEAD, 1xx, 204, 205, 304 phải bỏ body. Component không bổ sung dữ liệu suy đoán.

JSON strict: không comment, trailing comma hoặc duplicate key. JSON hiển thị nhiều dòng để dễ đọc, nhưng giữ nguyên number lexeme như `9007199254740993` hay `1e309`, không chuyển qua JavaScript Number. Copy lấy đúng source ban đầu, không lấy bản định dạng hiển thị.

**Metadata cũ:** parser vẫn nhận `description`, `variant.description`, `variant.annotations`, cùng `expandedDepth`/`annotations` trong JSON body để descriptor đang dùng không lỗi. Những trường này được validate nhưng không render. Viết ngữ cảnh hoặc chú thích cần thiết trong bài MDX quanh component.

## Copy, layout và fallback

- Một nút copy mỗi request/response, không lặp nút copy cho body.
- Copy transcript: dòng đầu, headers theo đúng thứ tự, rồi CRLF trống và source body nếu có. Không tự thêm HTTP version, Host, Content-Length hoặc encoding.
- Transcript đọc được, **không phải HTTP wire format hoặc cURL command**. Body giữ nguyên Unicode, CRLF, whitespace và số lớn.
- Copy cần clipboard permission; khi bị chặn có thông báo trợ năng, nội dung vẫn chọn/copy thủ công được.
- Variant đầu mở sẵn. Các variant khác mở/thu bằng native `<details>`, dùng được bằng bàn phím và khi không JavaScript. Copy không đóng variant.
- Request/response cạnh nhau khi container đủ rộng, xếp dọc trên mobile. Text/JSON rộng cuộn bên trong component.
- Theme theo biến Fumadocs hoặc fallback light/dark; hỗ trợ `.dark` và `[data-theme='dark']` trên ancestor.
- Không JavaScript vẫn đọc được mọi message qua native disclosures; nút copy ẩn tới khi hydrate.

## API build/server

```tsx
import { prepareProtocolExchange } from '@vanhiep99w/docs-kit/protocol-exchange';
import { ProtocolExchange } from '@vanhiep99w/docs-kit/components/protocol-exchange';

const data = prepareProtocolExchange({
  title: 'Health check',
  variants: [{
    id: 'ok', title: 'OK',
    request: { method: 'GET', url: '/health' },
    response: { status: 200, body: { kind: 'json', json: '{"ok":true}' } },
  }],
});

export function Example() { return <ProtocolExchange data={data} />; }
```

`prepareProtocolExchange(input)` đồng bộ; `parseProtocolExchangeDescriptor(yaml)` parse/validate rồi prepare. Cả hai chỉ dùng ở build/server. Prepared JSON body có `{ kind: 'json', data: PreparedJSONPayload }`; component không import JSON/YAML parser.

Props: `{ data: PreparedProtocolExchange, className? }`. Validator và helpers `formatProtocolMessage`/`protocolBodySource` ở `@vanhiep99w/docs-kit/protocol-exchange/data`.

## Giới hạn và an toàn

- Text/JSON body tối đa 262144 UTF-16 code units; tổng source body tối đa 1048576.
- JSON tối đa 1024 value nodes, path depth 32; field annotations cũ tối đa 100.
- Header value tối đa 8192 ký tự; URL tối đa 8192 ký tự.
- Unknown fields, duplicate YAML keys, reference annotation không tồn tại và prepared offsets sai đều báo lỗi. Lỗi remark giữ file/vị trí fence.
- Mọi text được React escape; không HTML thô, network request, filesystem source fetch hoặc evaluate payload.
- Mọi variant được publish trong HTML/dữ liệu trang, kể cả variant đang đóng. Chỉ dùng credentials giả và dữ liệu đã lọc, không đưa secrets vào ví dụ.

Ví dụ: [REST/Auth](../examples/protocol-exchange/rest-auth.mdx), [GraphQL](../examples/protocol-exchange/graphql.mdx), [OAuth/redirect](../examples/protocol-exchange/oauth-redirect.mdx).
