# Example Explorer

Mở app chạy thật trong một modal dialog, không đặt một iframe lớn giữa bài và không thu hẹp layout như Source Explorer. Một trang có thể chứa nhiều ExampleRef; từng ví dụ có nhiều phiên bản hoặc biến thể hành vi do tác giả khai báo.

## Tích hợp

Đăng ký provider client quanh nội dung, truyền registry **do host kiểm soát**:

```tsx
import { ExampleExplorerProvider } from '@vanhiep99w/docs-kit/components/example-explorer';
import type { ExampleDefinition } from '@vanhiep99w/docs-kit/example-explorer';

const examples: readonly ExampleDefinition[] = [{
  id: 'cart',
  title: 'React Catalog + Vue Cart',
  defaultVersion: 'snapshot',
  versions: [
    { id: 'snapshot', title: 'Snapshot + subscription', src: 'https://example-learn.pages.dev/micro-frontend/communication/v1/' },
    { id: 'events', title: 'Event-only (bản lỗi)', src: 'https://example-learn.pages.dev/micro-frontend/communication/v1/?mode=events-only' },
  ],
}];

<ExampleExplorerProvider examples={examples} navigationKey={pathname}>
  {children}
</ExampleExplorerProvider>
```

Trong Next App Router, lấy pathname bằng usePathname ở wrapper của host, không truyền search params làm navigationKey. Package không import Next hoặc Fumadocs.

Import CSS một lần sau style của host:

```css
@import '@vanhiep99w/docs-kit/styles/example-explorer.css';
```

Thêm ExampleRef vào MDX component map:

```tsx
import { ExampleRef } from '@vanhiep99w/docs-kit/components/example-explorer';
```

Trong bài MDX:

```mdx
<ExampleRef example="cart">Example: thử giỏ hàng</ExampleRef>

<ExampleRef example="cart" version="events" variant="inline">
  So sánh bản chỉ nghe event
</ExampleRef>
```

Không cần remark plugin. Ví dụ thứ hai trên là biến thể thực hành có chủ đích, không phải release v2. Mỗi version trong registry phải trỏ tới một app/biến thể thật, không nhân bản nhãn version để tạo cảm giác có nhiều bản.

## API

| API | Nội dung |
| --- | --- |
| ExampleExplorerProvider | examples bắt buộc; navigationKey tùy chọn; launcher mặc định true |
| ExampleRef | example bắt buộc; version mặc định theo definition; variant là button hoặc inline; children là nhãn |
| useExampleExplorer | Trả context hoặc null; context.open({ example, version }) để mở từ control riêng |
| href trên ExampleRef | Không bắt buộc trong provider vì lấy từ registry; bắt buộc khi không có provider |
| ExampleDefinition | id, title, defaultVersion và versions |
| ExampleVersion | id, title, src và sourceUrl tùy chọn |

Registry chấp nhận nhiều ví dụ. Dialog picker chỉ liệt kê ví dụ đăng ký bằng ExampleRef trên trang hiện tại, cộng ví dụ đang mở từ deep link. Launcher nổi chỉ xuất hiện sau hydration khi trang có reference hoặc deep link. Đổi route và unmount references sẽ bỏ các lựa chọn cũ.

Launcher mặc định nằm phía trên Source code để không đè nút của Source Explorer. Có thể tùy chỉnh vị trí qua CSS variable --example-launcher-bottom.

## Lifecycle và URL

SSR chỉ tạo các link nhỏ, không iframe, dialog, toolbar hoặc footer chiếm diện tích trong bài. Chỉ mở dialog mới tạo iframe; đóng dialog sẽ hủy iframe. Đổi ví dụ, version hoặc bấm tải lại tạo frame mới và reset state. Không giữ nhiều app đang chạy trong nền.

Query dùng example và exampleVersion, không đụng source, snapshot, các query khác hay hash. Mở lần đầu push history, đổi selection replace. Close entry do provider tạo dùng Back; deep link hoặc Forward mở lại thì close xóa riêng query example bằng replace. Reload với deep link mở đúng ví dụ/version từ registry.

Không có JavaScript hoặc Ctrl/Cmd/middle-click: anchor đi thẳng tới URL app. Provider không prefetch source/runtime của app từ link. Sai reference trong authored content bị từ chối lúc render/build; deep link với ID/version không tồn tại có thông báo lỗi và có thể chọn lại ví dụ.

## Dialog và bàn phím

Dùng dialog.showModal trong native top layer, không thay đổi margin/grid/TOC của trang như Source Explorer. Focus vào nút đóng khi mở; nền inert; khóa cuộn và trả focus khi đóng. Click backdrop hoặc nút đóng để thoát. Escape hoạt động khi focus ở toolbar của dialog.

**Phím trong iframe khác origin không bubble về parent.** Nếu app giữ focus, Escape không được hứa là sẽ đóng dialog. Nút đóng luôn nằm ngoài app; dùng Tab/Shift+Tab tới toolbar hoặc bấm nút đó. Không có postMessage bridge tự động, không inject keyboard listener vào app không cùng origin.

Iframe tự responsive và scroll. Mobile dùng gần toàn màn hình; desktop giới hạn viewport lớn và giữ các selector/action ở một toolbar nhỏ. Không có footer cảnh báo cố định hoặc banner placeholder giữa bài.

## Trust boundary và failure

Chỉ dùng registry/source do người bảo trì kiểm soát. URL query chỉ chứa IDs, không nhận src tùy ý. Validator từ chối javascript:, data:, protocol-relative URL, backslash, credentials và metadata trùng/sai default.

Iframe chỉ cấp allow-scripts và allow-same-origin, không cấp camera, microphone, popup, top navigation hoặc form submission. Đây không phải sandbox cho code độc hại cùng origin; ưu tiên host app ở origin khác docs. Không truyền credential hoặc dữ liệu riêng vào URL.

Host CSP cần frame-src phù hợp; server app cần frame-ancestors cho phép domain docs. onLoad không chứng minh app trả HTTP 200 hoặc hoạt động đúng; nút tải lại và mở tab mới luôn có sẵn. App theme độc lập với theme docs nếu app không tự có cơ chế phối hợp.

LiveDemo 0.10 vẫn được export để giữ tương thích. Với bài mới hoặc cần nhiều ví dụ/version, dùng Example Explorer thay cho khung LiveDemo inline.
