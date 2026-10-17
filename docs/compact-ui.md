# Giao diện gọn, nội dung trước

Đợt tinh gọn cho bản **0.7.1**, sau 0.7.0; **chưa publish npm**. Áp dụng mặc định cho các component mới; không cần đổi descriptor, parser, MDX map hoặc source assets. D2 và Source Explorer không thay đổi.

## Nguyên tắc

- Code, dữ liệu và diagram là nội dung chính, không phải các banner/metadata xếp tầng.
- Toolbar nhỏ; copy dùng biểu tượng có accessible name, tooltip, focus và thông báo clipboard như trước.
- Không giảm kích thước code hoặc scale marker để ép nội dung. Giảm khoảng đệm, hàng lặp và khung lồng nhau.
- Hướng dẫn dùng chung và metadata phụ nằm trong `<details>` native; **không xóa dữ liệu**, không lazy-fetch hoặc dùng JavaScript để mới có nội dung.
- Cảnh báo ở `TerminalStep.warning`, context thực thi và điều kiện của nhánh State Transition vẫn hiện trước thao tác. Không đặt cảnh báo quan trọng chỉ trong description/caption.
- Giữ text trợ năng cho nút icon, stream/type, số dòng và scale. Không chỉ dùng màu để truyền ý nghĩa.

## Thay đổi từng component

| Component | Mặc định gọn | Thông tin mở rộng |
| --- | --- | --- |
| Terminal Session | Transcript liền mạch, copy ngay cạnh command; không tạo tiêu đề “Bước N”. Chỉ title do tác giả cung cấp mới hiện như comment. | Description/expected từng lệnh ở “Ghi chú”; session description ở “Về phiên lệnh”. Warning luôn hiện. |
| Code Diff | Một toolbar Inline/Song song + copy trước/sau; code và annotation xuất hiện ngay, không banner title/caption/count/EOL. | “Chi tiết” giữ title, caption, số dòng thay đổi, file labels/EOL và cách đọc. Title vẫn là tên trợ năng của figure. |
| Annotated Example | Một thanh tiêu đề nhỏ + icon copy; chú thích gọn, range cùng dòng; không số thứ tự trang trí. | Không giấu các lời giải thích của code. API controlled selection/sourceLink không đổi. |
| Code Walkthrough | Một hàng chọn bước cuộn ngang với trước/sau; bỏ title/language/count lặp trên các lớp viewer. | “Về walkthrough” giữ title mô tả/hướng dẫn; snapshot native disclosure và toàn bộ annotations vẫn đọc được. |
| Data Inspector | Search ngắn, nút Mở/Thu, path và copy gọn; nút chọn field là biểu tượng có tên/tooltip; không lặp type text cạnh mọi value. | Type vẫn có trong accessible text và selected field. `embedded` mode đưa search/copy vào disclosure, không tạo card/header con. |
| Protocol Exchange | Method/URL/status đứng cùng hàng với copy; headers trình bày như transcript, JSON body dùng embedded Inspector không có card lồng card. | “Về ví dụ” giữ description và ngữ nghĩa copy transcript. Stream/headers/body vẫn đầy đủ. |
| Span Waterfall | Timeline trước, nhãn provenance ngắn vẫn hiện; không mở sẵn Inspector của root span. | “Chi tiết span” và từng span mặc định đóng; click span mở đúng hai lớp. “Về trace” giữ provenance đầy đủ, legend và giả định scale. |
| Concurrency Lanes | Diagram và ký hiệu chính trước, không lặp hướng dẫn/cuộn/provenance dài. | “Sự kiện và quan hệ” mở khi chọn marker/edge, hoặc mở thủ công; “Về mô hình” giữ giải thích trục/nguồn. |
| Marble | Header/legend/caption/annotation gọn hơn; giảm phần trống dọc, marker/font/frame semantics không đổi. | Bảng sự kiện native vẫn đầy đủ; zoom toolbar chỉ giữ control và mức zoom, hướng dẫn dài chuyển thành text trợ năng. |
| State Transition | Current state + event/nhánh là thao tác chính; không lặp event heading rồi thêm nút “Chọn nhánh này”. Guard vẫn hiện. | Description/effects trong “Giải thích”; history trong “Lịch sử”; assumptions/cách đọc và reference native ở cuối. |

## Terminal: ngữ cảnh, output và cảnh báo

Context ở step vẫn thay thế context session **chỉ cho step đó**. Transcript hiện nhãn khi chuyển môi trường, kể cả trở lại context mặc định sau một override, tránh hiểu nhầm lệnh sau vẫn chạy ở remote/container.

Output plain ngắn (tối đa 8 dòng, không annotations và không khai báo `collapsed`) xuất hiện trực tiếp. `stdout` có nhãn trợ năng, `stderr` có nhãn nhìn thấy; stderr không tự được suy ra là lỗi. Output dài, có annotation hoặc khai báo `collapsed` vẫn dùng native details. Copy luôn giữ command gốc, kể cả CRLF/newline cuối.

Exit code khác 0 vẫn hiện ngoài notes. Expected/description chỉ là giải thích của tác giả, không được biến thành output giả. Khi thông tin là điều kiện an toàn cần đọc trước copy, dùng `warning` hoặc viết rõ ở bài, không chỉ đặt trong notes/session description.

Ví dụ kiểm tra cùng trường hợp phản hồi UI: [Rollback Deployment](../examples/terminal-session/rollback.mdx).

## Diff: bỏ nhiễu, không bỏ ngữ nghĩa

Title, caption và file labels vẫn nằm trong HTML và mục “Chi tiết”; source links/copy vẫn truy cập được ngay ở toolbar. Dấu thêm/xóa, số dòng đúng từng bên, annotation links, word detail và raw-copy không đổi.

Nếu cả hai file đều không có newline cuối, không lặp ghi chú đó trên cả hai bên. Khi việc thiếu newline là khác biệt giữa hai bản, dòng liên quan có ký hiệu `∅↵` với tooltip và accessible text; metadata cuối vẫn ghi rõ newline của từng source.

Caption/assumptions dài không còn hiện thành banner mặc định. Nếu lời giải thích là điều kiện cần thấy ngay, viết trong đoạn bài bao quanh hoặc annotation thay vì trông chờ vào caption mở rộng.

## Embedded Data Inspector

```tsx
<DataInspector data={prepared} embedded />
```

Prop React tùy chọn, mặc định `false`; không phải field descriptor. Protocol Exchange và Span Waterfall dùng mode này nội bộ. Mặc định chỉ hiện cây/annotation/JSON gốc, header lặp được giữ làm tên trợ năng. Mở “Tìm / sao chép field” để search/copy; chọn field hoặc annotation tự mở tools. Dữ liệu/số lớn và JSON Pointer không thay đổi.

## Kiểm tra

- Giữ các tests hiện có cho copy chính xác, schema, keyboard, Source Explorer, zoom, word diff, no-JS và escaping.
- Thêm fixture rollback và diff public contract theo phản hồi UI.
- `tests/browser/compact-ui.spec.mjs`: budget chiều cao theo fixture cố định, code font không nhỏ hơn 13px, screenshot từng viewer desktop + mobile dark, metadata native và warning vẫn visible.
- `tests/compact-ui.test.mjs`: metadata SSR/anchors, short output, warning và ngữ nghĩa newline.

Số đo chiều cao là regression budget của fixture local/viewport cụ thể, không phải cam kết mọi bài viết đều ngắn theo cùng tỷ lệ. Nội dung tác giả dài vẫn chiếm chỗ; dùng Source Explorer hoặc tách ví dụ khi cần.
