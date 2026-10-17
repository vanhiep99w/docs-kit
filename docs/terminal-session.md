# Terminal Session

**Giao diện 0.7.1 đã được tinh gọn:** xem [nội dung chính và thông tin mở rộng](./compact-ui.md). API/data cũ vẫn dùng được.

> MVP trong working tree, chưa publish. Đây là transcript được tác giả biên soạn, không phải terminal thật.

Hiển thị lệnh theo bước, ngữ cảnh thực thi, stdout/stderr, chú thích và kết quả kỳ vọng. Chỉ nút copy cần JavaScript; nội dung và thao tác mở/thu output dùng được không JavaScript.

- Không thực thi shell, Redis command hay bất cứ code nào.
- Không SSH, gọi API, tạo WebSocket hoặc kết nối dịch vụ ngoài.
- Copy riêng từng command gốc, không kèm prompt, output hoặc giải thích.
- Không syntax highlighting hoặc ANSI renderer trong MVP; không có parser/highlighter trong client bundle.
- Light/dark theo `.dark` hoặc `[data-theme='dark']` của host. CSS kế thừa font/màu Fumadocs và có fallback cho host khác.

## 1. Tích hợp MDX/Fumadocs

Thêm plugin, giữ nguyên collection và plugin khác:

```ts
import { defineConfig } from 'fumadocs-mdx/config';
import { remarkTerminalSession } from '@vanhiep99w/docs-kit/terminal-session';

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkTerminalSession],
  },
});
```

Đăng ký component trong map MDX components hiện có:

```tsx
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { TerminalSession } from '@vanhiep99w/docs-kit/components/terminal-session';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    TerminalSession,
    ...components,
  };
}
```

Import CSS sau stylesheet của website:

```css
@import '@vanhiep99w/docs-kit/styles/terminal-session.css';
```

Không cần provider, Next.js hoặc Source Explorer. Remark plugin dùng được ngoài Fumadocs và chỉ xử lý fence `terminal-session`; đặt trước plugin khác có thể chuyển code fence thành component.

## 2. Viết transcript trong MDX

````mdx
```terminal-session
title: Kiểm tra pod chưa Ready
description: Transcript minh họa, không phải kết quả truy vấn cluster trực tiếp.
context:
  kind: local
  label: kubectl context dev
  cwd: ~/work/api
steps:
  - id: status
    title: Xem trạng thái
    command: kubectl get pods -n demo
    outputs:
      - stream: stdout
        text: |-
          NAME       READY   STATUS
          api-demo   0/1     Running
        annotations:
          - id: readiness
            title: Running nhưng chưa Ready
            description: Container đang chạy nhưng chưa đáp ứng điều kiện nhận traffic.
            ranges: [[2, 2]]
    expected: Xác định pod cần kiểm tra thêm.
    exitCode: 0
  - id: describe
    title: Đọc Events
    command: kubectl describe pod api-demo -n demo
    outputs:
      - stream: stdout
        collapsed: true
        text: |-
          Events:
            Warning Unhealthy Readiness probe failed: HTTP 503
```
````

Fence chứa YAML descriptor. Plugin validate và serialize dữ liệu thành props; không biến chuỗi command thành JavaScript hoặc thực thi command lúc build.

## 3. Hợp đồng dữ liệu

### Session

| Field | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `title` | Có | Tên phiên lệnh |
| `context` | Có | Môi trường mặc định, hiển thị rõ ở đầu phiên |
| `description` | Không | Giả định, điều kiện chuẩn bị hoặc nguồn transcript |
| `steps` | Có | Mảng bước không rỗng; mỗi bước chứa đúng một chuỗi command và các output liên quan |

### Context

- `kind`: `local`, `container`, `pod` hoặc `remote`.
- `label?`: tên host, container, pod, CLI hoặc môi trường; chỉ là nhãn hiển thị.
- `cwd?`: thư mục làm việc; không tự `cd` khi copy.

`context` ở step là **thay thế hoàn toàn**, không merge với context mặc định. Tránh vô tình hiển thị thư mục local cho một lệnh chạy trong pod/remote host.

Khi step đổi context rồi step sau trở lại mặc định, transcript hiện lại nhãn context session để tránh hiểu nhầm. Context và prompt không làm thay đổi command. Ví dụ `cwd: /srv/api` không thêm `cd /srv/api`, `kind: remote` không thêm `ssh`, và `kind: container` không thêm `docker exec`. Tác giả phải giải thích cách vào môi trường đó trong bài viết.

### Step

| Field | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `id` | Có | Duy nhất trong session; chữ ASCII/số/`_`/`-`, bắt đầu bằng chữ hoặc số |
| `command` | Có | Chuỗi không rỗng, không bao gồm prompt |
| `title` | Không | Tên bước nếu tác giả cung cấp; không tạo heading mặc định. Nhãn trợ năng dùng `Bước N` khi thiếu title |
| `prompt` | Không | Prompt trang trí một dòng; mặc định `$`, chuỗi rỗng để ẩn |
| `context` | Không | Thay thế context của session cho bước này |
| `description` | Không | Giải thích trong “Ghi chú” của lệnh |
| `warning` | Không | Cảnh báo hiển thị trước lệnh, gắn với nút copy bằng `aria-describedby` |
| `outputs` | Không | Mảng output theo đúng thứ tự tác giả cung cấp |
| `expected` | Không | Kết quả kỳ vọng trong “Ghi chú”, không giả làm stdout |
| `exitCode` | Không | Số nguyên an toàn không âm, do tác giả cung cấp; không được component tính toán |

Không tự phát hiện lệnh nguy hiểm. `warning` không chặn nút copy hoặc bảo đảm command an toàn. Chỉ đưa command đã kiểm tra và ghi rõ môi trường vào bài viết.

Các CLI tương tác như Redis CLI không nhất thiết có shell exit code sau mỗi command; không dùng `exitCode` để diễn đạt số bản ghi hoặc số key được tác động.

### Output

- `stream`: `stdout` hoặc `stderr`; được hiển thị bằng nhãn, không chỉ bằng màu.
- `text`: chuỗi plain text; được phép rỗng.
- `collapsed?`: boolean; khai báo `true` để đóng, `false` để mở native `<details>/<summary>`. Bỏ field: output plain không annotations tối đa 8 dòng hiện trực tiếp; output dài/có annotation vẫn mở bằng native disclosure, không JavaScript vẫn đọc được.
- `annotations?`: mảng chú thích không rỗng nếu cung cấp. Dùng chung `ExampleAnnotation` và inclusive ranges với [Annotated Example](./annotated-example.md).

Mỗi output có scope annotation ID riêng. Ranges bắt đầu từ **1**, tính trên output đó, không phải command hoặc toàn session. Hỗ trợ nhiều vùng và vùng chồng nhau; tất cả dòng được chú thích được đánh dấu sẵn. Link chú thích trỏ tới dòng đầu của range đầu tiên. MVP chưa có selection tương tác theo từng annotation trong Terminal Session.

`stderr` không mặc định đồng nghĩa thất bại. Một số công cụ ghi progress/diagnostic vào stderr dù exit code bằng 0. Các chunk là transcript tác giả cung cấp, không bảo đảm phản ánh chính xác thứ tự thời gian giữa hai stream nếu dữ liệu ban đầu đã bị tách riêng.

## 4. Lệnh nhiều dòng và copy

```yaml
command: |-
  docker build \
    --progress=plain \
    --tag docs-kit-demo:local \
    .
```

- Không gỡ prompt tự động hoặc sửa quote, dấu `\`, whitespace, Unicode hay line endings của chuỗi command.
- `|-` bỏ newline cuối, `|` giữ một newline cuối, `|+` giữ các newline cuối theo quy tắc YAML. Quy tắc này áp dụng trước khi dữ liệu tới component.
- Direct React giữ nguyên LF/CRLF/CR trong chuỗi khi copy. Newline cuối có thể khiến terminal thực thi ngay khi paste; tác giả cần chủ động chọn block scalar phù hợp.
- Clipboard cần được browser cho phép, thường trong secure context. Thất bại sẽ có thông báo để copy thủ công; không có fallback thực thi hay gửi command tới server.
- Không có nút copy toàn bộ session để tránh vô tình ghép các lệnh thuộc nhiều môi trường hoặc các bước phá hủy dữ liệu.

## 5. API ngoài remark

Module dữ liệu không phụ thuộc Node.js hoặc browser:

```tsx
import { TerminalSession } from '@vanhiep99w/docs-kit/components/terminal-session';
import type { TerminalSessionData } from '@vanhiep99w/docs-kit/terminal-session/data';

const data: TerminalSessionData = {
  title: 'Kiểm tra phiên bản',
  context: { kind: 'local' },
  steps: [{
    id: 'version',
    command: 'node --version',
    expected: 'Phiên bản Node.js khớp yêu cầu của project.',
  }],
};

<TerminalSession data={data} />
```

`TerminalSessionProps`: `data`, `className?`. Component validate dữ liệu trước khi render, kể cả khi không dùng remark.

Có thể parse YAML tại build/server:

```ts
import { parseTerminalSession } from '@vanhiep99w/docs-kit/terminal-session';

const data = parseTerminalSession(yamlSource);
```

`parseTerminalSession` chỉ parse/validate; không đọc filesystem, chạy command hoặc gọi mạng. Không import module này vào client; client dùng subpath `/data` nếu cần `validateTerminalSession` hoặc `terminalContextLabel`.

## 6. Validation, an toàn và giới hạn

- Sai context, step ID lặp, field không hỗ trợ trong session/step/output/context, stream không hợp lệ, range ngoài output hoặc YAML lỗi sẽ báo lỗi build kèm file và vị trí fence.
- Cùng validator được dùng cho direct React; annotation title/description và ranges được kiểm tra theo hợp đồng dùng chung.
- Không có ANSI parser. ESC, C0/C1 control characters bị từ chối, trừ tab, LF và CR. Hãy xuất log plain text hoặc làm sạch ANSI trong pipeline tin cậy trước khi biên soạn; không tự ẩn escape sequences trong viewer.
- React escape command, output, nhãn và lời giải thích. Không nhận HTML, dùng `dangerouslySetInnerHTML`, interpret markdown trong field hoặc evaluate command.
- Đây không phải service nhận transcript không tin cậy: parser không có sandbox/quota; chỉ compile dữ liệu do tác giả quản lý.
- Không có redaction tự động. Secrets, hostname nội bộ, log production và credential phải được loại bỏ trước khi publish.
- Output dài có scroll và disclosure nhưng không virtualization hoặc tự cắt text. Nội dung thu gọn vẫn có trong HTML, không phải cơ chế giữ bí mật.
- Exit code và kết quả kỳ vọng là dữ liệu tác giả khai báo, không phải kiểm chứng command đã được chạy thành công.

## 7. Entry points và ví dụ

- `@vanhiep99w/docs-kit/terminal-session`: remark plugin và parser YAML build-time.
- `@vanhiep99w/docs-kit/terminal-session/data`: types, validator và context label helper.
- `@vanhiep99w/docs-kit/components/terminal-session`: React component.
- `@vanhiep99w/docs-kit/styles/terminal-session.css`: CSS riêng, không cần CSS Annotated Example.

Ví dụ: [Kubernetes](../examples/terminal-session/kubernetes.mdx), [Docker](../examples/terminal-session/docker.mdx), [Redis CLI](../examples/terminal-session/redis.mdx).
