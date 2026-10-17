# Kế hoạch mở rộng component cho docs-kit

> Trạng thái: đã triển khai MVP Annotated Example, Terminal Session, Marble, Code Diff, Data Inspector, Protocol Exchange, Span Waterfall, Concurrency Lanes, State Transition Explorer và extension Code Walkthrough trong working tree; chưa publish. Các giai đoạn còn lại vẫn là kế hoạch.
>
> Phạm vi: component phục vụ tài liệu kỹ thuật MDX; không thay đổi D2 Diagram và Source Explorer hiện có nếu không cần thiết.

## Tiến độ hiện tại

- Annotated Example: component, validator, Shiki build-time helper, remark plugin, adapter Source Explorer và CSS riêng.
- Đã có 3 fixture MDX: Kubernetes, SQL và RxJS.
- Hướng dẫn tích hợp và giới hạn: [Annotated Example](./annotated-example.md).
- Kiểm tra local cho bản 0.7.0 đã đạt: `npm run typecheck`; `npm test` (151 tests); `npx playwright test` (80 tests); `node scripts/smoke-pack.mjs` (consumer độc lập). Chưa kiểm tra deploy trên website thật.
- Số đo module minified local, React external, chưa gzip: Marble 9,432 bytes; Marble zoom opt-in 11,153 bytes (đã gồm renderer static); Terminal Session 7,515 bytes; Annotated Example 7,078 bytes; Code Walkthrough 13,413 bytes (đã gồm viewer Annotated Example); Code Diff 13,914 bytes (inline/split projection; không có word/line diff engine runtime); Data Inspector 10,437 bytes; Protocol Exchange 20,273 bytes; Span Waterfall 19,594 bytes (Protocol Exchange và Span Waterfall đã gồm Inspector được dùng lại); Concurrency Lanes 12,794 bytes; State Transition Explorer 11,363 bytes; hai component này không kéo Inspector hoặc renderer khác vào client. Marble có thể dùng server-first, không bắt buộc gửi module component xuống browser.
- Terminal Session: component, validator, YAML parser/remark plugin, CSS riêng và 3 fixture Kubernetes, Docker, Redis CLI. Dùng chung types/range validation với Annotated Example, không kéo component/highlighter của Annotated Example vào terminal.
- Hướng dẫn tích hợp và giới hạn: [Terminal Session](./terminal-session.md).
- Marble: zoom opt-in đã bổ sung trong 0.7.0, chỉ đổi spacing 36–96px, không đổi frame/marker/font; đã khảo sát implementation trong `../rxjs-learn`, giữ API JSX và quy tắc cột; có snapshot test 301 chuỗi legacy. Bổ sung parser/validation, remark plugin, SVG server-first, nhóm cùng frame xếp dọc, legend, annotation và bảng sự kiện không JavaScript.
- Hướng dẫn/migration: [Marble Diagram](./marble.md). Chưa thay component trong repository RxJS, chưa build website đó với package mới.
- Code Diff: inline/split diff và word detail opt-in, Shiki/segmentation/LCS build-time, validator reconstruction/số dòng/ranges, annotation theo side, native disclosure, copy nguyên bản và adapter Source Explorer cho hai snapshot/file. Có fixture Dockerfile, IAM policy, SQL query.
- Hướng dẫn/API: [Code / Config Diff](./code-diff.md). Đã thêm split view + word diff opt-in trong 0.7.0; chưa tích hợp website thật.
- Đã dùng chung token validation, Shiki helper và token styles với Annotated Example; dùng chung source-reference validation với API Source Explorer.
- Data Inspector: cây JSON, mở/thu nhánh, tìm literal, copy JSON Pointer/value và annotation theo pointer; giữ nguyên raw JSON và số lớn. Có fixture GraphQL response, Kafka event, JWT claims. Tài liệu: [Structured Data Inspector](./data-inspector.md).
- Protocol Exchange: request/response HTTP-oriented, variants native, ordered/repeated headers, text/JSON body, copy transcript/body và annotation theo side/target. JSON dùng lại Inspector, không có network client. Có fixtures REST/Auth, GraphQL partial response, OAuth redirect/cache metadata. Hướng dẫn: [Protocol Exchange](./protocol-exchange.md).
- Span Waterfall: MVP timeline phân cấp, chọn span/attributes qua Data Inspector, shared scale, provenance bắt buộc, annotations và bảng thời gian native. Hai fixture API/cache/database và microservices fan-out đều là minh họa. Hướng dẫn: [Span Waterfall](./span-waterfall.md). Chưa tích hợp website thật.
- Code Walkthrough: extension Annotated Example với snapshots/steps, controlled annotation selection, native disclosure, prev/next và Source Explorer adapter theo snapshot. Không tạo code renderer thứ hai. Có fixture nullable guard và Dockerfile; [hướng dẫn](./code-walkthrough.md). Chưa tích hợp website thật.
- Concurrency Lanes: MVP events/intervals theo actor, common scale, collision stacking dọc, quan hệ khai báo với endpoint event, selection/anchors và bảng native. Hai fixture PostgreSQL row lock và Java volatile publication đều có giả định/nguồn ngữ nghĩa; không SQL/JVM runtime hoặc happens-before solver. Hướng dẫn: [Concurrency Lanes](./concurrency-lanes.md). Chưa tích hợp website thật.

- State Transition Explorer: đề xuất bổ sung sau roadmap ban đầu, đã có MVP chọn nhánh/state trước–sau, guard/effects chỉ là text, back/reset, history có giới hạn và reference native. Fixture circuit breaker và form workflow; [hướng dẫn](./state-transition.md). Chưa tích hợp website thật.

## 1. Mục tiêu

Bổ sung công cụ giúp người đọc hiểu ví dụ, thực hiện thao tác và theo dõi diễn biến hệ thống. Ưu tiên khả năng dùng chung cho nhiều topic thay vì bổ sung component chỉ để đủ bộ.

Bối cảnh nội dung: AWS, Kubernetes, Docker, CI/CD, microservices, SQL, MongoDB, Elasticsearch, Kafka, Redis, Java/JMM, JWT/Auth, OpenTelemetry, JavaScript, React, Angular, RxJS và micro-frontend.

Hai nhóm component hiện có:

- **D2 Diagram:** cấu trúc, quan hệ và luồng giữa các thành phần.
- **Source Explorer:** duyệt implementation theo project, snapshot, file và vùng code.

Ba khoảng trống ưu tiên:

1. **Đoạn này nghĩa là gì?** → Annotated Example.
2. **Thực hiện và kiểm chứng thế nào?** → Terminal Session.
3. **Chuyện gì xảy ra theo thời gian?** → Timeline chuyên biệt.

Không triển khai Exercise/Quiz trong kế hoạch này.

## 2. Nguyên tắc chung

- HTML đọc được khi không có JavaScript; tương tác là phần bổ sung.
- Tách build-time processing khỏi client bundle; không đưa renderer, highlighter hoặc Node.js API vào browser một cách mặc định.
- Không phụ thuộc Next.js; Fumadocs chỉ có adapter tùy chọn.
- Mỗi nhóm có subpath export và stylesheet riêng, theo cấu trúc package hiện tại.
- Dùng lại types, snapshot và URL helpers của Source Explorer khi phù hợp; không tạo code explorer thứ hai.
- Chỉ trích xuất abstraction dùng chung khi đã có ít nhất hai trường hợp thực tế cần nó.
- Có light/dark mode, keyboard navigation, focus rõ ràng và reduced-motion.
- Không truyền đạt ý nghĩa chỉ bằng màu; có nhãn hoặc ký hiệu đi kèm.
- Nội dung kỹ thuật phải ghi rõ giả định, môi trường và thang thời gian khi cần.
- Không bổ sung runtime thực thi code, shell hoặc request mạng trong MVP.
- API trong tài liệu này là định hướng; chốt sau khi kiểm tra fixture và MDX pipeline.

## 3. Roadmap ưu tiên

| Giai đoạn | Hạng mục | Kết quả |
| --- | --- | --- |
| 0 | Khảo sát và fixture | Chốt nhu cầu thực tế, tránh trùng component hiện có |
| 1 | Annotated Example | Code/config/output có chú thích theo vùng |
| 2 | Terminal Session | Phiên lệnh có output, ngữ cảnh và bước kiểm chứng |
| 3 | Timeline: Marble | Đóng gói hoặc phát triển từ renderer RxJS hiện có |
| 4 | Timeline: các biến thể | Chọn theo nhu cầu: span waterfall hoặc concurrency lanes |
| 5 | Code / Config Diff | So sánh thay đổi kèm lý do |
| Sau đó | Structured Data Viewer, Protocol Exchange | Chỉ triển khai khi có fixture và nhu cầu rõ ràng |

Không đặt lịch cố định trước khi hoàn thành khảo sát. Mỗi giai đoạn có thể phát hành độc lập.

## 4. Giai đoạn 0 — Khảo sát và chốt hợp đồng dữ liệu

### Công việc

- [ ] Kiểm tra code và test hiện tại của D2, Source Explorer, build pipeline và package exports.
- [ ] Kiểm tra các component mà website/Fumadocs đang dùng để tránh làm lại chức năng cơ bản.
- [ ] Thu thập fixture nhỏ từ bài viết thực tế, có quyền sử dụng và không chứa secrets.
- [x] Kiểm tra implementation marble trên website RxJS: source, API, parser, styles và các chuỗi dùng trong nội dung. Đã bổ sung tests hermetic trong package.
- [ ] Xác nhận phần nào có thể chuyển vào package, phần nào phải giữ ở website.
- [ ] Chốt cơ chế highlight build-time; không mặc định đưa thêm highlighter vào client.
- [ ] Chốt quy ước lỗi có file/vị trí, đường dẫn source và range dòng.

### Fixture tối thiểu

| Nhóm | Fixture đề xuất |
| --- | --- |
| Annotated Example | Kubernetes YAML, SQL query, RxJS pipeline |
| Terminal Session | `kubectl` troubleshooting, Docker build, Redis CLI |
| Marble | filter/map, switchMap cancellation, complete/error/unsubscribe |
| Timeline mở rộng | Hai transaction tranh lock; một distributed trace |
| Diff | Dockerfile tối ưu cache; IAM policy thu hẹp quyền |

### Điều kiện hoàn thành

- Có fixture đọc được mà chưa cần UI mới.
- Mỗi component có ít nhất hai trường hợp sử dụng đủ khác nhau để kiểm chứng thiết kế.
- Phân biệt rõ dữ liệu biên soạn minh họa và output/trace đo thực tế.

## 5. Giai đoạn 1 — Annotated Example

### Mục tiêu

Giải thích một đoạn code, config hoặc output ngay trong bài viết. Source Explorer vẫn phụ trách xem project đầy đủ.

### MVP

- Code/config/output có số dòng và syntax highlighting được chuẩn bị lúc build.
- Danh sách chú thích liên kết đến một hoặc nhiều range dòng.
- Chọn chú thích bằng chuột hoặc bàn phím để highlight vùng tương ứng.
- Mỗi chú thích có ID ổn định, tiêu đề và nội dung giải thích.
- Copy lấy code gốc, không lấy số dòng hoặc chú thích.
- Layout hẹp chuyển chú thích xuống dưới; không thu nhỏ code đến mức khó đọc.
- Tùy chọn mở file/region tương ứng trong Source Explorer khi host đã tích hợp provider.
- Không có JavaScript vẫn hiển thị đủ code và toàn bộ chú thích.

### Hợp đồng dữ liệu cần chốt

- Input: code trực tiếp hoặc nội dung được resolve lúc build; không tự fetch toàn bộ project cho ví dụ inline.
- Ngôn ngữ, tiêu đề, caption và nhãn copy.
- Annotation: ID, nội dung, ranges; dòng được tính trên code hiển thị.
- Source reference tùy chọn: project, snapshot, file và region/lines theo hợp đồng hiện có.
- Báo lỗi build với range không hợp lệ; xác định rõ cách xử lý annotation chồng nhau.

### Mở rộng: Code Walkthrough — MVP đã triển khai

- [x] Snapshots/steps, nhiều range, bước trước/sau và revisit theo thứ tự tác giả.
- [x] Dùng lại Annotated Example renderer/helper; thêm controlled selection tùy chọn, không đổi schema cũ.
- [x] Copy nguyên snapshot, adapter đúng Source Explorer reference, SSR/native disclosure không JavaScript.
- [x] MDX, schema/token limits, keyboard/focus, data replacement, mobile/dark và isolated packed-consumer tests.
- [ ] Tích hợp website docs thật trước khi phát hành.

**Code Walkthrough đã có MVP local:** chế độ theo bước của Annotated Example với snapshots/steps, trước/sau, highlight và lời giải thích tương ứng. Wrapper dùng lại AnnotatedExample qua controlled selection, không tạo viewer độc lập, không đồng bộ D2 hoặc tự chạy code. Hướng dẫn/API: [Code Walkthrough](./code-walkthrough.md).

### Điều kiện nghiệm thu

- [x] Ba fixture được compile và SSR trong test; fixture browser đã kiểm tra light/dark và mobile.
- [x] Copy bảo toàn code, kể cả Unicode, CRLF và dòng trống.
- [x] Chú thích chọn đúng ranges; adapter mở SourceRef qua provider hiện có. Host vẫn chịu trách nhiệm validate file/region trong manifest.
- [x] SSR không cần Next.js; nội dung đủ nghĩa khi tắt JavaScript.
- [x] Điều khiển bằng keyboard, focus và trạng thái selection có tên truy cập được.
- [ ] Tích hợp và xác nhận trên một website docs thật trước khi phát hành.

## 6. Giai đoạn 2 — Terminal Session

### Mục tiêu

Trình bày quy trình vận hành có thể đọc, copy và kiểm chứng; không phải terminal thật.

### MVP

- Session gồm các entry command, stdout, stderr và phần giải thích.
- Hiển thị ngữ cảnh thực thi: local, container, pod hoặc remote host; hỗ trợ nhãn thư mục khi cần.
- Copy từng command; không lấy prompt hoặc output.
- Giữ nguyên command nhiều dòng, quote và ký tự đặc biệt.
- Output dài có thể thu gọn, nhưng vẫn đọc được qua fallback không JavaScript.
- Chú thích/highlight dòng output quan trọng, dùng lại hợp đồng ranges nếu phù hợp.
- Hỗ trợ mô tả kết quả kỳ vọng và exit code khi có.
- Cảnh báo do tác giả khai báo cho command có tác động phá hủy; không hứa tự phát hiện mọi lệnh nguy hiểm.

### Không nằm trong MVP

- Chạy command, SSH, WebSocket terminal hoặc shell emulator.
- Tự động playback như một bản ghi terminal.
- Parser ANSI đầy đủ; MVP dùng plain text được escape. Chỉ thêm ANSI qua parser an toàn khi có nhu cầu thực tế.
- Nút copy gộp toàn bộ session trước khi xác định rõ command nào được phép chạy liên tiếp.

### Điều kiện nghiệm thu

- [x] Copy đúng lệnh nhiều dòng, Unicode và CRLF, không lẫn prompt/output.
- [x] Phân biệt stderr bằng cả nhãn và hình thức hiển thị; exit code độc lập với stream.
- [x] Không tự chạy bất cứ lệnh nào và không ngầm kết nối dịch vụ bên ngoài.
- [x] Hiển thị tốt output rộng, dài và nội dung Unicode; đã xem screenshot mobile/dark.
- [x] Command, output, cảnh báo và ngữ cảnh vẫn đọc được khi không có JavaScript; native disclosure có thể mở bằng bàn phím.
- [ ] Tích hợp và xác nhận trên một website docs thật trước khi phát hành.

## 7. Giai đoạn 3–4 — Timeline chuyên biệt

### Định hướng

Không thay D2 và không ép marble, span waterfall, concurrency thành một ký pháp duy nhất. Chúng có thể dùng chung một số primitive hiển thị nhưng phải giữ ngữ nghĩa riêng.

### 7.1. Marble — triển khai đầu tiên

Ưu tiên đánh giá và chuyển renderer từ docs RxJS vào package nếu phù hợp, tránh tồn tại hai implementation.

MVP:

- Nhiều lane dùng cùng trục thời gian.
- Marker next, complete, error, subscribe và unsubscribe.
- Legend giá trị và annotation giải thích cancellation/lifecycle.
- Ghi rõ đơn vị: frame minh họa hoặc thời gian định lượng.
- Có mô tả text/fallback cho nội dung diagram.
- Tài liệu hóa chính xác tập cú pháp được hỗ trợ; không mặc định tương thích đầy đủ với TestScheduler.
- Không chạy RxJS để tự suy ra output; tác giả cung cấp dữ liệu minh họa.

### 7.2. Span Waterfall — MVP đã triển khai

Phù hợp OpenTelemetry và microservices:

- Span có start, duration, parent và service.
- Chọn span để đọc attributes đã được lọc và phần giải thích.
- Phân biệt dữ liệu tổng hợp với trace đo thực tế.
- Không tự suy ra critical path hay kết nối tracing backend trong MVP.

### 7.3. Concurrency Lanes — MVP đã triển khai

Phù hợp SQL transaction, JMM, Kafka và async execution:

- Mỗi lane đại diện thread, transaction hoặc actor.
- Event và interval có nhãn; quan hệ nhân quả được tác giả khai báo rõ.
- Có thể đánh dấu lock, wait, commit hoặc cancellation theo schema của từng ví dụ.
- Không đồng nhất vị trí trái/phải với quan hệ happens-before.
- Không mô phỏng database, JVM hoặc Kafka để xác minh kết quả.

### Điều kiện nghiệm thu

- [x] Marble: các lane căn cùng trục, label dài nằm riêng, group không che marker.
- [x] Marble: giữ kích thước marker khi responsive; có zoom opt-in 36–96px/frame (75–200%), chung spacing giữa các lane và giữ scroll anchor.
- [x] Marble: complete/error/unsubscribe có hình, nhãn và mô tả riêng.
- [x] Marble: có caption, annotation và bảng sự kiện native đầy đủ.
- [x] Marble: không autoplay hoặc JavaScript bắt buộc.
- [x] Không tạo abstraction timeline tổng quát khi chưa có fixture triển khai cho các biến thể khác.
- [ ] Tích hợp/build website RxJS với package mới, sau đó mới thay/xóa renderer local.
- [x] Span Waterfall: đã chọn theo hai fixture API/cache/database và fan-out microservices, không tạo abstraction timeline tổng quát.
- [x] Span Waterfall: parent validation (missing/cycle/depth), shared relative scale, zero duration, sibling order, provenance, attributes lossless qua Inspector và annotation anchors.
- [x] Span Waterfall: MDX/SSR, keyboard, copy số lớn, mobile/dark, fallback không JavaScript, client bundle và packed-consumer tests.
- [ ] Span Waterfall: tích hợp/deploy trên website docs thật trước khi phát hành.
- [x] Concurrency Lanes: schema tách event/interval/relation; fixture SQL row lock và Java volatile publication, provenance và nguồn ngữ nghĩa rõ ràng.
- [x] Concurrency Lanes: overlap/same-coordinate xếp subtrack dọc, không dời thời điểm; không coi tọa độ là happens-before, không thêm cạnh tự động.
- [x] Concurrency Lanes: MDX/SSR, SVG/keyboard selection, native disclosure, mobile/dark, không JavaScript và packed-consumer tests.
- [ ] Concurrency Lanes: tích hợp/deploy trên website docs thật trước khi phát hành.

## 8. Giai đoạn 5 — Code / Config Diff

### Mục tiêu

Cho thấy thay đổi và lý do, không chỉ tô màu thêm/xóa.

### Phạm vi dự kiến

- Inline mặc định; split view và chuyển chế độ sau hydrate đã có, giữ SSR mode theo descriptor.
- Dòng thêm/xóa có ký hiệu, số dòng trước/sau chính xác.
- Thu gọn phần không đổi, copy riêng bản trước hoặc sau.
- Annotation gắn với phía before/after và range rõ ràng.
- Có thể nhận hai snapshot/file từ pipeline Source Explorer; không kéo cả explorer vào component.
- Tính diff và syntax highlighting lúc build khi khả thi.

### Điều kiện nghiệm thu

- [x] Xử lý đúng file rỗng, Unicode, LF/CRLF/CR, thay đổi cuối file và thiếu newline cuối.
- [x] Copy nguyên bản trước/sau, không có diff markers, số dòng hoặc phần tóm tắt thu gọn.
- [x] Annotation trỏ đúng side và số dòng gốc sau insert/delete; dòng được chú thích luôn hiện.
- [x] Inline view đọc được trên mobile; native disclosure và annotation links hoạt động khi không có JavaScript.
- [x] Adapter Source Explorer mở đúng snapshot/file trước hoặc sau.
- [ ] Tích hợp một website docs thật trước khi phát hành.
- [x] Split view + word diff opt-in: pairing theo vị trí trong hunk, word segmentation/LCS build-time có budget; giữ numbering, annotations, raw copy và fallback native.
- [x] Bổ sung unit/browser/packed-consumer tests cho hai chế độ, Unicode, EOL-only, word budget và Marble zoom.
- [ ] Chưa tích hợp website thật; chưa publish 0.7.0.

## 9. Backlog có điều kiện

### Structured Data Inspector — MVP đã triển khai

Payload ngắn vẫn có thể giữ code block; Inspector dành cho nội dung cần khám phá path/value.

- [x] JSON tree, mở/thu native, search literal, copy path/value và annotation.
- [x] Path dùng JSON Pointer RFC 6901; không dùng JSONPath/script.
- [x] Giới hạn 262144 UTF-16 code units, 1024 value nodes, depth 32 và 100 annotation.
- [x] Copy value giữ nguyên source/number lexeme, không làm tròn số lớn; preview dài có fallback JSON gốc đầy đủ.
- [x] Không JavaScript vẫn đọc được cây, chú thích và JSON gốc; parser không đi vào client bundle.
- [ ] Tích hợp một website thật trước khi phát hành.
- Không đưa secrets hoặc dữ liệu production chưa lọc vào assets công khai; chưa có redaction/schema validation tự động.

### Protocol Exchange — MVP đã triển khai

- [x] Request/response theo cặp, có các variant thành công/thất bại và native disclosure.
- [x] Method, URL, ordered/repeated headers, status, text/JSON body và annotation theo side/target.
- [x] Dùng lại Data Inspector cho JSON, không tạo parser/viewer thứ hai; copy source giữ nguyên số lớn.
- [x] Copy message là transcript, không phải cURL/HTTP wire format; không gửi request, follow redirect, lưu credential hoặc cài cookie.
- [x] Fallback không JavaScript, keyboard, mobile/dark và annotation anchors đã có browser tests.
- [ ] Tích hợp một website thật trước khi phát hành; chưa có API playground hoặc executable request support.

### State Transition Explorer — MVP bổ sung đã triển khai

- [x] Schema states/transitions/initial/assumptions, terminal validation và trace theo transition ID do người đọc chọn.
- [x] Same-event branches, cycle/self-loop, back/reset và history giới hạn 128; không tự evaluate guard hoặc execute effects.
- [x] MDX/SSR, reference không JavaScript, keyboard/focus, data replacement, mobile/dark và isolated packed-consumer tests.
- [x] Fixture circuit breaker và form workflow có giả định, không mô phỏng runtime thật.
- [ ] Tích hợp website docs thật trước khi phát hành.

### Demo Preview — tạm hoãn theo yêu cầu

- Dành cho React, Angular và micro-frontend khi cần xem kết quả thực tế.
- Bắt đầu bằng preview có sẵn + source; chưa làm playground sửa/chạy code.
- Cần thiết kế iframe sandbox, CSP, origin và quyền truy cập trước khi nhúng nội dung thực thi.

### Chưa ưu tiên

- Compare riêng: dùng bảng Markdown cho đến khi có nhu cầu tương tác cụ thể.
- Chart: chỉ thêm khi có bộ số liệu thực tế, đơn vị và phương pháp đo rõ ràng.
- Mermaid/renderer khác: chỉ thêm khi xuất hiện nhu cầu mà D2 hoặc timeline không đáp ứng.
- Glossary, tìm kiếm và related topics xuyên site: kế hoạch nội dung/điều hướng riêng.
- Exercise/Quiz: loại khỏi phạm vi.

## 10. Tích hợp package và kiểm thử

Mỗi component khi được triển khai cần:

- [ ] Subpath export riêng cho React component, types/helpers, build-time integration và CSS theo nhu cầu; không tạo root barrel kéo tất cả vào client.
- [ ] Tài liệu API, cách đăng ký MDX, import CSS, ví dụ và giới hạn.
- [ ] Ví dụ consumer không phụ thuộc Next.js/Fumadocs.
- [ ] Fumadocs adapter riêng nếu thật sự cần thay đổi layout host.
- [ ] Unit tests cho schema, ranges, copy và transform.
- [ ] Test compile MDX và SSR, bao gồm trường hợp không có source provider.
- [ ] Browser tests cho keyboard, mobile, dark mode và fallback không JavaScript.
- [ ] Kiểm tra HTML/SVG escaping; không nhận HTML tùy ý rồi xem đó là nội dung an toàn.
- [ ] Packed-consumer test xác nhận exports, CSS, assets và types được đóng gói đúng.
- [ ] Đo tác động build và client bundle bằng fixture trước/sau; không tải tính năng khác chỉ vì import một component.

## 11. Thứ tự bắt đầu

1. Thu thập fixture và kiểm tra renderer marble hiện có.
2. Chốt schema Annotated Example bằng Kubernetes YAML, SQL và RxJS.
3. Triển khai Annotated Example và tích hợp Source Explorer tùy chọn.
4. Triển khai Terminal Session, tái sử dụng annotation nếu hợp lý.
5. Đóng gói Marble, sau đó chọn span waterfall hoặc concurrency lanes theo bài viết cần trước.
6. Đánh giá nhu cầu Diff và các backlog còn lại bằng nội dung thực tế.

**Mốc đầu tiên:** Annotated Example dùng được trong một website docs thật, có fallback không JavaScript, không tăng dependency client ngoài nhu cầu và không làm hỏng D2/Source Explorer hiện tại.
