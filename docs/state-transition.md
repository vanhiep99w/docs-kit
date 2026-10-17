# State Transition Explorer

**Giao diện 0.7.1 đã được tinh gọn:** xem [nội dung chính và thông tin mở rộng](./compact-ui.md). API/data cũ vẫn dùng được.

Khám phá mô hình trạng thái do tác giả khai báo: người đọc chọn một event/nhánh để xem **trước → sau**, điều kiện và giải thích, sau đó quay lại hoặc reset.

Đây là công cụ đọc mô hình, **không** phải XState interpreter, statechart runtime, form/API thật hoặc formal verifier. D2 vẫn phụ trách sơ đồ cấu trúc/graph; component này không sinh graph layout mới.

## Tích hợp MDX / Fumadocs

Thêm plugin vào pipeline và giữ các plugin hiện có:

```ts
import { remarkStateTransition } from '@vanhiep99w/docs-kit/state-transition';

const mdxOptions = { remarkPlugins: [remarkStateTransition] };
```

Đăng ký component MDX:

```tsx
import { StateTransitionExplorer } from '@vanhiep99w/docs-kit/components/state-transition';

const components = { StateTransitionExplorer }; // merge với components hiện có
```

Import CSS sau stylesheet website:

```css
@import '@vanhiep99w/docs-kit/styles/state-transition.css';
```

Không cần Next.js/provider. Font kế thừa website, màu dùng biến Fumadocs với fallback; dark mode theo `.dark` hoặc `[data-theme='dark']` trên ancestor. Không import renderer/parser hoặc component khác xuống client.

## Descriptor

````mdx
```state-transition
title: Gửi form đơn giản
assumptions: Một submission; điều kiện và kết quả do tác giả giả định, không chạy API.
initial: idle
states:
  - id: idle
    label: Idle
    description: Chưa gửi.
  - id: waiting
    label: Waiting
    description: Chờ event được người đọc chọn, không có request thật.
  - id: done
    label: Done
    terminal: true
    description: Kết thúc mô hình này.
transitions:
  - id: submit
    from: idle
    to: waiting
    event: SUBMIT
    guard: Giả định input hợp lệ.
    description: Người đọc chọn nhánh và giả định guard thỏa, không chạy validation.
    effects:
      - Gửi payload trong implementation thật; ở đây chỉ là mô tả.
  - id: resolve
    from: waiting
    to: done
    event: RESOLVE
    description: Giả định request thành công.
```
````

## Hợp đồng dữ liệu

| Field | Ý nghĩa |
| --- | --- |
| `title`, `description?` | Tiêu đề/lời dẫn text |
| `assumptions` | Bắt buộc, mô tả phạm vi và giả định của mô hình |
| `initial` | ID trạng thái đầu, phải tồn tại |
| `states` | 1–32 `{ id, label, description?, terminal? }` |
| `transitions` | 0–128 `{ id, from, to, event, label?, description, guard?, effects? }` |

- ID ASCII tối đa 128 ký tự: `[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}`. State IDs duy nhất trong nhóm states, transition IDs duy nhất trong nhóm transitions; hai nhóm có namespace riêng.
- `from` và `to` phải tham chiếu state tồn tại. Không dùng wildcard, nested/parallel state, entry/exit actions, history state hoặc context variables.
- `event` là chuỗi tên sự kiện hiển thị, không phải mã hoặc callback. Có thể có nhiều transition cùng `from` và `event`.
- `label` là tên nhánh tùy chọn để phân biệt các outcome cùng event.
- `guard` là **text giải thích**, không phải boolean/expression/function được đánh giá. Chọn một nhánh đồng nghĩa người đọc giả định guard của nhánh đó thỏa, kể cả chuỗi guard viết `false`. Component không kiểm tra tính hợp lý của giả định này.
- `effects` là 1–16 chuỗi mô tả khi được cung cấp; không execute action, emit event, mutate context, gửi request hoặc chạy code.
- `terminal: true` không được có cạnh đi ra; đây là khai báo của tác giả. Một state không có cạnh đi ra nhưng không khai báo terminal **không** tự được coi là kết thúc.
- Self-loop và cycle hợp lệ. Unreachable states vẫn được giữ trong reference; validator không tự thêm đường đi hoặc chứng minh reachability/liveness.
- Mô hình có một state và không có transition hợp lệ, kể cả initial terminal. Không yêu cầu mọi state có event.

### Giới hạn

Mỗi text field không rỗng, tối đa 16384 UTF-16 code units; tổng title/description/assumptions/state/transition/guard/effects text tối đa 1048576. Descriptor YAML tối đa 2097152 code units, alias expansion giới hạn 100. Unknown fields, ID lặp, reference sai hoặc duplicate YAML keys đều báo lỗi; remark giữ file/vị trí fence.

Đây là validator cho nội dung docs do tác giả tin cậy quản lý, không phải sandbox/quota service để nhận input công khai tùy ý.

## Tương tác

1. Khởi đầu tại `initial`, không tự phát event.
2. Chỉ hiển thị các lựa chọn có `from` bằng trạng thái hiện tại, giữ thứ tự tác giả. Nếu cùng event có nhiều nhánh, người đọc chọn **transition cụ thể**, không có cơ chế first-match hoặc tự tính guard.
3. Chọn nhánh thêm transition ID vào đường đi. Vùng “Chuyển trạng thái vừa chọn” hiện route trước/sau và event; mở “Giải thích” để xem description/effects. Guard của từng lựa chọn vẫn luôn hiện trước khi chọn.
4. Nút quay lại bỏ lựa chọn cuối rồi đọc lại prefix từ initial; reset xóa toàn bộ đường đi. Không có undo side effect thật vì không có effect nào đã chạy.
5. Self-loop vẫn thêm một bước lựa chọn dù state không đổi. Số bước không phải bộ đếm lỗi, thời gian hoặc log hệ thống.
6. History tối đa **128** lựa chọn. Khi đầy, các lựa chọn có `aria-disabled`, không thêm bước hoặc cắt lịch sử âm thầm; quay lại/reset để tiếp tục.
7. Sau khi chọn event, focus chuyển tới heading trạng thái hiện tại vì nút vừa chọn có thể biến mất. Focus dùng `preventScroll`; back/reset giữ focus ở toolbar. Trạng thái có live announcement, điều kiện được nối với button qua `aria-describedby`.
8. Link trong history mở bảng reference và đi tới transition; xem state/transition ở đó **không đổi** trạng thái hiện tại.
9. Khi host truyền object `data` mới, đường đi reset về initial, kể cả khi ID vẫn giống. Giữ identity ổn định khi mô hình không đổi; không mutate data tại chỗ.

Không autoplay, timer/cooldown, random outcome, tự nhận response hoặc evaluate code. Nếu mô hình thật cần counter/payload/timeout, tác giả phải mô tả giả định hoặc thêm các state/nhánh cụ thể; UI này không thay implementation thật.

## Fallback và responsive

Toàn bộ states, transitions, guards, effects và assumptions đã nằm trong HTML SSR. Không JavaScript: các nút chọn/back/reset ẩn, initial và mô tả lựa chọn đầu vẫn đọc được; mở `<details>` “Tra cứu toàn bộ trạng thái và chuyển tiếp” để đọc toàn bộ mô hình.

Không hứa traversal hoạt động khi không JavaScript. Reference có link thật giữa state và transition, không cần modal hoặc fetch dữ liệu. Disclosure đang đóng vẫn có nội dung trong HTML công khai.

Lựa chọn hiển thị gọn theo hàng; đường đi nằm trong “Lịch sử”. Các nội dung mở rộng xếp dọc khi cần đọc. Reference table cuộn ngang riêng, không đẩy rộng page. Không motion/autoplay cần tắt khi reduced-motion.

## API ngoài MDX

```tsx
import { StateTransitionExplorer, type StateTransitionData } from '@vanhiep99w/docs-kit/components/state-transition';

const data: StateTransitionData = {
  title: 'Một bước', assumptions: 'Mô hình biên soạn, không thực thi action.', initial: 'a',
  states: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', terminal: true }],
  transitions: [{ id: 'go', from: 'a', to: 'b', event: 'GO', description: 'Chọn để đọc trạng thái B.' }],
};

export function Example() { return <StateTransitionExplorer data={data} />; }
```

Props: `{ data: StateTransitionData; className?: string }`. Không nhận guard/action callbacks hoặc output HTML thô.

Pure data helpers:

```ts
import { validateStateTransition, traceStateTransitions } from '@vanhiep99w/docs-kit/state-transition/data';

validateStateTransition(data);
const trace = traceStateTransitions(data, ['go']);
// { current: 'b', entries: [{ step: 1, transition: data.transitions[0] }] }
```

`traceStateTransitions` validate model và path rồi đi theo các **transition ID được chọn**; không nhận event name thay ID, không tự tìm nhánh. Sai origin/reference/path quá 128 báo lỗi, không tự sửa. Để quay lại, truyền path đã bỏ phần tử cuối; reset dùng `[]`. Helper không mutate model hoặc path.

Public entry points:

- `@vanhiep99w/docs-kit/state-transition`: build-only YAML parser `parseStateTransitionDescriptor`, `remarkStateTransition` và types.
- `@vanhiep99w/docs-kit/state-transition/data`: validator, trace helper, `STATE_TRANSITION_HISTORY_LIMIT` và types, không React/Node/parser.
- `@vanhiep99w/docs-kit/components/state-transition`: client component có thể SSR trên React 18.3/19.
- `@vanhiep99w/docs-kit/styles/state-transition.css`: stylesheet riêng.

## Ví dụ và ranh giới tin cậy

- [Circuit breaker](../examples/state-transition/circuit-breaker.mdx): mô hình rút gọn, không mô phỏng một thư viện cụ thể. Guard về ngưỡng và event cooldown được chọn thủ công; không có counter/timer/probe thật.
- [Form workflow](../examples/state-transition/form-workflow.mdx): submission, failure/retry, success/cancellation terminal theo phạm vi ví dụ. Không gửi/abort request hoặc kiểm chứng race của response muộn.

Mọi chuỗi là text được React escape, không auto-link URL. Mô hình, kể cả reference đang đóng, được publish công khai; không đưa secrets hoặc dữ liệu production chưa lọc vào fields/side effect descriptions.

MVP local chưa tích hợp/deploy website docs thật và chưa publish. Demo Preview vẫn tạm hoãn.
