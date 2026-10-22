# LiveDemo

Nhúng một app chạy độc lập vào bài MDX. Component chỉ cung cấp viewport iframe; không build app, lưu source, chạy backend hoặc cung cấp editor.

## Tích hợp

```tsx
import { LiveDemo } from '@vanhiep99w/docs-kit/components/live-demo';

// Thêm LiveDemo vào MDX component map đang dùng.
```

Import CSS một lần trong global stylesheet:

```css
@import '@vanhiep99w/docs-kit/styles/live-demo.css';
```

Không cần remark plugin. Giữ nguyên các component/plugin khác của host.

```mdx
<LiveDemo
  src="https://example-learn.pages.dev/micro-frontend/communication/v1/"
  title="React Catalog và Vue Cart"
  sourceUrl="https://github.com/vanhiep99w/example-learn/tree/main/examples/micro-frontend/communication/v1"
  height={760}
/>
```

URL trên là đích cấu hình dự kiến của repo example-learn; chỉ online sau khi chủ repo deploy Pages và xác nhận tên project/domain.

| Prop | Mặc định | Ý nghĩa |
| --- | --- | --- |
| src | Bắt buộc | URL HTTP(S) hoặc root-relative path của app tin cậy |
| title | Bắt buộc | Nhãn hiển thị và accessible title của iframe |
| sourceUrl | Không có | Link source ngoài iframe |
| height | 620 | Chiều cao viewport, từ 200 tới 1600 px |
| className | Không có | Class bổ sung trên figure |

## Lifecycle và fallback

SSR không render iframe hoặc gửi request tới app. Bấm **Chạy thử** mới mount iframe; **Tải lại demo** tạo iframe mới và reset state phía app. Đổi src trở về trạng thái chưa tải. Không có JavaScript, link **Mở tab mới** và **Source code** vẫn đọc được.

Component dùng viewport cố định; app bên trong tự responsive và scroll. Không có auto-height/postMessage bridge nên không nhận dữ liệu tùy ý từ iframe. CSS của app độc lập với docs; app hiện dùng color-scheme của hệ điều hành, không tự đồng bộ theme toggle riêng của host.

Sự kiện iframe load **không chứng minh HTTP 200 hoặc app render thành công**. Trình duyệt có thể không báo onError khi bị chặn CSP/frame-ancestors. Vì vậy luôn có link mở riêng và thao tác tải lại, không tuyên bố đã phát hiện mọi lỗi mạng hoặc đã chạy app thành công.

## Trust boundary

Chỉ nhúng app do tác giả kiểm soát, ưu tiên **origin khác với docs**. Sandbox hiện chỉ cấp allow-scripts và allow-same-origin để app framework hoạt động; không cấp camera, microphone, popup, top-navigation hay forms. Kết hợp hai quyền này không phải sandbox bảo vệ chống app độc hại cùng origin; không nhúng source không tin cậy hoặc cho người đọc thực thi code tùy ý bằng component này.

Không đưa token, cookie/auth data hoặc secret qua URL. Demo browser-only không chứa secrets. URL được kiểm tra để từ chối javascript:, data:, protocol-relative URL, backslash và credentials; đây không phải domain allowlist.

Host có CSP cần cho phép origin demo qua frame-src. Server demo phải cho phép origin docs qua frame-ancestors, không đặt X-Frame-Options: DENY/SAMEORIGIN cho embed cross-origin. Dùng HTTPS ở production để tránh mixed content. Với Cloudflare Pages, cấu hình response header static trong _headers; header đó không thay thế cấu hình cho Pages Functions.
