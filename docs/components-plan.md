# Phạm vi component

Ưu tiên công cụ đọc tài liệu kỹ thuật quen thuộc và tối giản, không thêm component chỉ để đủ bộ.

| Component | Mục đích |
| --- | --- |
| [D2](./d2.md) | Cấu trúc, quan hệ và luồng hệ thống |
| Source Explorer | Duyệt project/snapshot/file và vùng source |
| [Code Walkthrough](./code-walkthrough.md) | Đọc code qua từng bước trong khung terminal |
| [Terminal Session](./terminal-session.md) | Transcript lệnh, output, cảnh báo và môi trường |
| [Code Diff](./code-diff.md) | So sánh code/config trước và sau |
| [Protocol Exchange](./protocol-exchange.md) | Request/response HTTP tĩnh |
| [Span Waterfall](./span-waterfall.md) | Timeline latency phân cấp |
| [Concurrency Lanes](./concurrency-lanes.md) | Tác vụ đồng thời trên cùng trục thời gian |

## Nguyên tắc

- Code/dữ liệu trước, mô tả trong bài thay vì nhiều lớp metadata.
- Không thực thi code, gửi request, mô phỏng scheduler hoặc xác minh quan hệ nhân quả.
- Build processing không kéo renderer/highlighter/Node vào client bundle.
- Copy giữ nguyên source; JSON hiển thị dễ đọc không làm tròn số lớn.
- Keyboard, tên trợ năng, native disclosures và nội dung không JavaScript được kiểm thử.
- D2 và Source Explorer không đổi trong đợt tinh gọn này.

Xem [thay đổi UI và chuyển đổi API](./compact-ui.md). Chưa publish hoặc kiểm tra deploy website thật.
