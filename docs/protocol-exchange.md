# Protocol Exchange

> MVP local, chưa publish. Component mô tả các cặp request/response kiểu HTTP tĩnh; không phải API client hoặc bộ phát HTTP wire format.

Mỗi tình huống có method, URL, status, headers có thứ tự, body và chú thích. JSON body dùng lại [Data Inspector](./data-inspector.md), giữ nguyên số lớn và JSON source. Không có Send/Try it, credential storage, auto-redirect, cURL execution hoặc network request.

## 1. Tích hợp MDX/Fumadocs

Thêm remark plugin vào cấu hình hiện có, giữ nguyên collection và các plugin khác:

```ts
import { defineConfig } from 'fumadocs-mdx/config';
import { remarkProtocolExchange } from '@vanhiep99w/docs-kit/protocol-exchange';

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkProtocolExchange],
  },
});
```

Đăng ký component trong map MDX:

```tsx
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { ProtocolExchange } from '@vanhiep99w/docs-kit/components/protocol-exchange';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ProtocolExchange,
    ...components,
  };
}
```

Import CSS sau stylesheet của website:

```css
@import '@vanhiep99w/docs-kit/styles/protocol-exchange.css';
```

Stylesheet này import CSS Data Inspector qua đường dẫn tương đối đã được đóng gói; không bắt buộc import lại Inspector CSS. Không cần Next.js, provider hoặc highlighter. Plugin chỉ xử lý fence `protocol-exchange`, không sửa fence `http`; đặt trước plugin có thể thay thế code fence.

## 2. Viết trong MDX

````mdx
```protocol-exchange
title: Đọc profile
description: Payload và credential giả lập, không gửi request.
variants:
  - id: allowed
    title: Token được chấp nhận
    request:
      method: GET
      url: https://api.example.invalid/me
      headers:
        - id: bearer
          name: Authorization
          value: Bearer DEMO_NOT_A_REAL_TOKEN
    response:
      status: 200
      statusText: OK
      headers:
        - id: content
          name: Content-Type
          value: application/json
      body:
        kind: json
        json: '{"id":"u_demo","sequence":9007199254740993}'
        annotations:
          - id: sequence
            pointer: /sequence
            title: Số nguyên lớn
            description: Giữ nguyên lexeme khi copy.
    annotations:
      - id: auth
        side: request
        target: header
        header: bearer
        title: Credential chỉ để minh họa
        description: Server chịu trách nhiệm xác thực; viewer không kiểm chứng token.
  - id: missing
    title: Không gửi token
    request:
      method: GET
      url: https://api.example.invalid/me
    response:
      status: 401
      statusText: Unauthorized
      headers:
        - id: challenge
          name: WWW-Authenticate
          value: Bearer realm="demo"
      body:
        kind: json
        json: '{"error":"authentication_required"}'
```
````

Các tình huống là ví dụ do tác giả khai báo, không tự chạy theo chuỗi hoặc chứng minh hành vi server. Nếu cần mô tả nhiều bước OAuth hoặc request flow, dùng thêm D2; component này chỉ trình bày từng cặp trao đổi.

## 3. Hợp đồng dữ liệu

### Exchange và variant

- `title`: tên bộ ví dụ, bắt buộc.
- `description?`: bối cảnh/giả định dạng text.
- `variants`: 1–12 tình huống.
- Mỗi variant có `id`, `title`, `request`, `response`; có thể thêm `description` và `annotations`.
- Variant ID duy nhất, bắt đầu bằng chữ/số ASCII, chỉ gồm chữ/số/`_`/`-`.

Tình huống đầu mở sẵn, các tình huống còn lại nằm trong native details; có thể mở nhiều tình huống cùng lúc để đối chiếu. Không có tab đòi hỏi JavaScript để đọc được biến thể khác.

### Request

| Field | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `method` | Có | HTTP method token viết hoa, ví dụ GET/POST/HEAD/DELETE |
| `url` | Có | Origin-relative target bắt đầu bằng một dấu /, hoặc URL HTTP(S) tuyệt đối |
| `headers` | Không | Mảng field có thứ tự |
| `body` | Không | Text hoặc JSON theo schema bên dưới |

URL chỉ là text, không auto-link hoặc fetch. Từ chối userinfo/credential nhúng trong URL tuyệt đối, whitespace, fragment, backslash, protocol-relative URL và scheme khác HTTP(S). URL không được tự normalize trong phần hiển thị/copy; % escapes giữ nguyên. Host chỉ được khai báo nếu tác giả thêm header; không tự dựng Host, HTTP version hoặc base URL.

### Response

- `status`: số nguyên 100–599, bắt buộc.
- `statusText?`: nhãn do tác giả cung cấp, một dòng; không tự suy ra từ status và không giả định mọi HTTP version truyền reason phrase.
- `headers?`, `body?`: như request.

Body response phải **được bỏ field**, không phải khai báo body rỗng, khi method là HEAD hoặc status là 1xx, 204, 205, 304. Đây là kiểm tra ngữ nghĩa cơ bản để tránh ví dụ sai, không phải một HTTP implementation đầy đủ.

Không kiểm chứng ý nghĩa nghiệp vụ của status, Content-Length, encoding, schema hoặc quan hệ Content-Type với body.kind. Tác giả có thể mô tả lỗi bằng text hoặc JSON tùy trường hợp; viewer không tự suy ra loại body từ header.

### Headers

```yaml
headers:
  - id: session
    name: Set-Cookie
    value: demo_session=FAKE; Secure; HttpOnly; Path=/
  - id: preference
    name: Set-Cookie
    value: demo_pref=compact; Secure; Path=/
```

Mỗi header có `id`, `name`, `value`. ID duy nhất **trong một message**, name có thể trùng. Giữ nguyên thứ tự, casing và value; không gộp các field trùng tên bằng dấu phẩy. Annotation trỏ theo ID, không theo name.

Name phải là HTTP field-name token, không nhận pseudo-header như :authority. Value là một dòng, có thể rỗng; từ chối CR/LF, NUL và các ASCII control không được phép. Không nhận obs-fold hoặc raw header block nhiều dòng. Đây là dữ liệu mô tả, không phải codec cho HTTP/2/3 hoặc header compression.

### Body

Text, gồm cả string rỗng:

```yaml
body:
  kind: text
  text: |-
    Error: invalid request
    Request id: demo-001
```

JSON source:

```yaml
body:
  kind: json
  json: |-
    {"id":9007199254740993,"items":[{"sku":"demo"}]}
  expandedDepth: 1
  annotations:
    - id: item
      pointer: /items/0/sku
      title: SKU
      description: Field minh họa.
```

- JSON body tuân theo Data Inspector: strict JSON, duplicate keys bị từ chối, copy giữ số lớn/formatting.
- JSON root có thể là scalar, object hoặc array.
- Không truyền object YAML thay cho chuỗi `json`: giá trị có thể đã bị chuyển kiểu/làm tròn trước khi vào helper.
- Body bỏ field → không có body. Text body có `text: ''` → body rỗng. JSON null → `json: 'null'`, khác với cả hai trường hợp trên.
- Text body không được highlight, không render HTML hoặc tự parse XML/form/GraphQL query. Có thể dùng plain text cho những ví dụ đó.
- Chưa có multipart, binary, file upload, protobuf, streaming, SSE, WebSocket hoặc gRPC support chuyên biệt.

## 4. Chú thích trao đổi và chú thích JSON

Variant annotations giải thích quan hệ giữa hai phía:

```yaml
annotations:
  - id: challenge
    side: response
    target: header
    header: challenge-header
    title: Đọc challenge của server
    description: Header này giúp giải thích status 401 của ví dụ.
```

Các target:

- `start`: dòng method + URL hoặc status + nhãn.
- `header`: cần `header` là ID tồn tại trên side tương ứng.
- `body`: toàn bộ body, chỉ hợp lệ khi body tồn tại; không có field `header`.

Mỗi annotation có ID duy nhất trong variant, `side: request | response`, title và description không rỗng. `header` chỉ được cung cấp khi target=header. Link native trỏ đúng block/header, không cần JavaScript.

Chú thích field trong JSON nằm ở `body.annotations` và dùng JSON Pointer của Inspector. Hai lớp không lẫn scope: header annotation không trỏ vào JSON, JSON Pointer không điều hướng header. Có thể dùng cùng annotation ID ở message/variant khác vì DOM IDs được scope theo instance.

## 5. Copy: transcript, không phải HTTP wire format

Mỗi phía có nút copy message và, nếu body tồn tại, copy riêng body.

Message được định dạng như sau:

```text
METHOD target
Header-One: value
Header-Two: value

body source
```

Response bắt đầu bằng status và statusText nếu có, không thêm HTTP version. Phần metadata dùng CRLF giữa các dòng; nếu body tồn tại, có CRLF CRLF trước body. **Body giữ nguyên source**, kể cả LF/CRLF/whitespace ở JSON root và số lớn. Body bỏ field không thêm block trống giả.

Không tự thêm Host, Content-Length, Transfer-Encoding, cookie, boundary hoặc protocol version. Bản copy không phải cURL, không được dùng như một wire message hợp lệ hoặc patch để gửi thẳng tới socket. Không có auto-execute khi copy.

Credential/header/value vẫn hiện nguyên văn trong bản copy. Không có masking/redaction hoặc secret storage tự động; tác giả phải dùng dữ liệu giả trước khi publish. Clipboard failure có thông báo, không có request tới server để xử lý copy.

## 6. Layout, theme và không JavaScript

- Container rộng từ 56rem: request và response cạnh nhau; container hẹp: xếp dọc. Không ép JSON tree vào hai cột nhỏ trên mobile.
- Từng variant mở/thu bằng details/summary native. Nội dung mọi variant luôn có trong HTML, không fetch khi mở.
- Các status được phân biệt bằng **số/nhãn**, không chỉ màu.
- URL, header và lời giải thích dài xuống dòng hoặc có scroll trong vùng nội dung, không làm tràn page.
- Text body cuộn ngang để giữ vị trí text; JSON tree dùng cơ chế responsive/scroll của Inspector.
- CSS kế thừa font/màu Fumadocs, có fallback ngoài Fumadocs; dark mode theo .dark hoặc data-theme=dark.
- Không animation, autoplay, iframe hoặc network dependency.
- Không JavaScript: copy/search/select bị ẩn nhưng variants, headers, body, chú thích và JSON gốc vẫn đọc/mở được.
- Keyboard dùng Tab/Shift+Tab, Enter/Space trên summary/button; không có tablist giả hoặc shortcut gửi request.

## 7. API ngoài MDX

```tsx
import { prepareProtocolExchange } from '@vanhiep99w/docs-kit/protocol-exchange';
import { ProtocolExchange } from '@vanhiep99w/docs-kit/components/protocol-exchange';

const data = prepareProtocolExchange({
  title: 'HTTP example',
  variants: [{
    id: 'ok',
    title: 'Thành công',
    request: { method: 'GET', url: '/demo' },
    response: {
      status: 200,
      body: { kind: 'json', json: '{"id":9007199254740993}' },
    },
  }],
});

<ProtocolExchange data={data} />
```

`prepareProtocolExchange(input)` là sync, chạy ở build/server. JSON payload được prepare qua helper Data Inspector hiện có; không dựng JSON viewer/parser thứ hai. `parseProtocolExchangeDescriptor(yamlSource)` parse/validate descriptor rồi trả artifact đã chuẩn bị.

`ProtocolExchangeProps`: `data: PreparedProtocolExchange`, `className?`. Prepared JSON body dùng `{ kind: 'json', data: PreparedDataInspector }`, khác input `{ kind: 'json', json: '...' }`. Component không import YAML hoặc JSON source-indexing parser.

Module `/protocol-exchange/data` cung cấp:

- Types input/prepared cho exchange, variant, message, header/body và annotation.
- `validateProtocolExchangeInput`, `validatePreparedProtocolExchange`.
- `protocolBodySource`: lấy JSON/text source hoặc undefined khi không có body.
- `formatProtocolMessage(variant, side)`: định dạng transcript đọc được, không phải encoder network.

Không import module build-time `/protocol-exchange` vào client component. Module `/data` dùng được ở browser, không cần highlighter, YAML hoặc JSONC parser.

## 8. Validation, tài nguyên và an toàn

- 1–12 variants; tối đa 64 headers/message; value của từng header tối đa 8192 code units; URL tối đa 8192 code units.
- Text body tối đa 262144 code units; JSON body theo giới hạn Inspector: 262144 code units, 1024 value nodes, path depth 32 và 100 field annotations.
- Tổng body source của exchange tối đa 1048576 code units; mỗi variant tối đa 100 annotation trao đổi. Không virtualization; ưu tiên ví dụ ngắn.
- Reference/header/variant ID sai, body không hợp lệ, status sai, unknown fields và YAML/JSON lỗi được báo lúc build. Remark kèm file/vị trí fence.
- Component validate cấu trúc artifact; không parse lại toàn bộ JSON nguồn để chứng minh artifact hoặc contract đúng. Dùng pipeline tin cậy.
- React escape mọi text, URL, header, metadata, annotation và source; không dangerouslySetInnerHTML, script evaluation, HTML body preview hoặc auto-link Location.
- Không có fetch, XMLHttpRequest, WebSocket, redirect, cookie installation hoặc lưu credential. Authorization, Set-Cookie và Location chỉ là text.
- Chỉ compile nội dung do tác giả repository tin cậy quản lý. Resource limits không thay thế sandbox/quota cho dịch vụ public.
- Giấu variant/body trong disclosure không giữ bí mật: toàn bộ dữ liệu được publish. Tự loại credential, hostname/log nội bộ và dữ liệu nhạy cảm trước khi build.

## 9. Entry points và ví dụ

- `@vanhiep99w/docs-kit/protocol-exchange`: build helper, descriptor parser và remark plugin.
- `@vanhiep99w/docs-kit/protocol-exchange/data`: types, validator và transcript/body-source helpers.
- `@vanhiep99w/docs-kit/components/protocol-exchange`: client component SSR-readable, dùng lại Data Inspector cho JSON.
- `@vanhiep99w/docs-kit/styles/protocol-exchange.css`: CSS riêng và import CSS Inspector.

Ví dụ: [REST/Auth](../examples/protocol-exchange/rest-auth.mdx), [GraphQL partial response](../examples/protocol-exchange/graphql.mdx), [OAuth redirect và cache metadata](../examples/protocol-exchange/oauth-redirect.mdx).
