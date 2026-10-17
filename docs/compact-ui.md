# Giao diện gọn, nội dung trước

Dành cho developer đọc tài liệu: công cụ quen thuộc, ít chữ, không card lồng card. D2 và Source Explorer không thay đổi.

| Component | Giao diện |
| --- | --- |
| Code Walkthrough | Khung terminal tối, tên file, copy; select bước và trước/sau; chỉ một lời giải thích hiện tại. Không sidebar hay footer giới thiệu. |
| Code Diff | Code inline/split, word highlights, copy và source links. Bỏ caption, danh sách mô tả annotation và footer “Chi tiết”. |
| Protocol Exchange | Request/response rõ ràng, headers và body. Bỏ descriptions, annotations và footer; không thêm search/tree JSON lồng vào. |
| Span Waterfall | Giữ timeline và native span details; attributes thành JSON được định dạng dễ đọc. |
| Terminal Session | Giữ transcript, warnings và context; ghi chú dùng native details. |

## Chuyển đổi

Các component không còn trong package: AnnotatedExample, DataInspector, MarbleDiagram (kèm zoom), StateTransitionExplorer và ConcurrencyLanes. Xoá import, CSS, remark plugin và MDX map tương ứng trong website.

CodeWalkthrough là component độc lập. Helper chuyển sang `@vanhiep99w/docs-kit/code-walkthrough`; validator/types sang `@vanhiep99w/docs-kit/code-walkthrough/data`. Component/CSS imports và schema snapshots/steps giữ nguyên. Helper chuyển đổi `walkthroughExample` không còn dùng.

CodeDiff và ProtocolExchange vẫn nhận metadata cũ để descriptor không lỗi, nhưng không render các phần mô tả đã bỏ. Đưa giả định, giải thích hoặc cảnh báo quan trọng vào bài MDX quanh component.

## Copy và fallback

- Copy code/transcript giữ đúng source, CRLF, Unicode và số lớn; JSON formatting chỉ phục vụ hiển thị.
- Nút có tên trợ năng, trạng thái clipboard và focus rõ; controls chỉ hiện khi JavaScript sẵn sàng.
- Không JavaScript vẫn đọc được code, headers/body, diagram và nội dung native disclosure. Walkthrough có mọi snapshot và danh sách bước/lời giải thích.
- Mobile cuộn nội dung rộng trong component, không giảm cỡ chữ để ép vừa.
- Terminal Session giữ warning trước thao tác copy, kể cả khi notes đóng.

Kiểm thử: `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run test:pack`.
