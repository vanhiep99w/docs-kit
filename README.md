# @vanhiep99w/docs-kit

Bộ component và tích hợp build-time dùng chung cho các website tài liệu MDX/Fumadocs. D2 là module đầu tiên; các component tiếp theo sẽ có entry point riêng trong cùng package.

## Mục lục

- [Yêu cầu](#yêu-cầu)
- [Cài đặt](#cài-đặt)
- [Tích hợp Fumadocs](#tích-hợp-fumadocs)
- [Viết diagram](#viết-diagram)
- [Cấu hình D2](#cấu-hình-d2)
- [Kiến trúc package](#kiến-trúc-package)
- [Phát triển và kiểm thử](#phát-triển-và-kiểm-thử)
- [Phát hành](#phát-hành)

## Yêu cầu

- Node.js 22 trở lên để build tài liệu.
- React 18.3 hoặc 19; một MDX pipeline hỗ trợ remark plugin.
- Package là ESM. Không cần cài D2 CLI, Go hay Java.

Renderer chỉ chạy lúc build. Website static export không cần WASM hoặc server D2 khi người dùng đọc tài liệu. Nhánh component không import renderer hay Node.js APIs.

## Cài đặt

**Cài bản phát hành từ npm:**

```bash
npm install @vanhiep99w/docs-kit@0.1.0
```

Các cách dưới đây dành cho phát triển local hoặc kiểm tra bản chưa phát hành.

**Hai repository nằm cạnh nhau:**

```bash
# Trong docs-kit
npm ci
npm run build

# Trong website docs
npm install --install-links ../docs-kit
```

`--install-links` cài một bản đóng gói thông thường, không dùng symlink. Khi dùng cách này, thêm `install-links=true` vào `.npmrc` của website để `npm ci` dùng cùng cấu hình. Cần có checkout `docs-kit` ở đường dẫn đó khi cài dependency; để deploy độc lập với repo bên cạnh, dùng dependency theo version trên registry.

**Kiểm tra hoặc chia sẻ bản đóng gói:**

```bash
# Trong docs-kit
npm pack

# Trong một website khác
npm install /path/to/vanhiep99w-docs-kit-0.1.0.tgz
```

**Git dependency**, sau khi code đã được commit và push:

```bash
npm install 'git+https://github.com/vanhiep99w/docs-kit.git#<commit-or-tag>'
```

`prepare` build package khi cài từ Git. Pin commit hoặc tag để tránh các website tự nhận thay đổi ngoài dự kiến.

## Tích hợp Fumadocs

### 1. Đăng ký plugin build-time

Trong `source.config.ts`, giữ nguyên collections và các plugin đang có:

```ts
import { defineDocs, defineConfig } from 'fumadocs-mdx/config';
import { remarkD2 } from '@vanhiep99w/docs-kit/d2';

export const docs = defineDocs({ dir: 'content/docs' });

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkD2],
  },
});
```

### 2. Đăng ký component MDX

Trong `mdx-components.tsx`:

```tsx
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { D2Diagram } from '@vanhiep99w/docs-kit/components/d2';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    D2Diagram,
    ...components,
  };
}
```

Giữ nguyên các component riêng đã đăng ký trong website.

### 3. Import CSS một lần

Trong global CSS, sau stylesheet của Fumadocs:

```css
@import 'tailwindcss';
@import 'fumadocs-ui/css/style.css';
@import '@vanhiep99w/docs-kit/styles/d2.css';
```

CSS chỉ tác động `.d2-diagram`, không sửa layout/sidebar của website. Light/dark theo class `.dark` hoặc `[data-theme='dark']` của website, không phụ thuộc riêng vào theme hệ điều hành. Các biến màu Fumadocs có fallback.

## Viết diagram

````mdx
```d2 title="Guard quyết định, resolver chuẩn bị dữ liệu"
direction: right
router: Router
guard: Cho phép? { shape: diamond }
resolver: Resolver
component: Component
blocked: Chặn hoặc redirect
router -> guard
guard -> resolver: Có
resolver -> component
guard -> blocked: Không
```
````

- D2 mặc định dùng sketch, layout ELK, scale `0.75` và nền trong suốt.
- Rectangle và diamond được đo nhãn bằng font thực tế rồi bố trí lại nếu ô quá nhỏ. Không dùng ước lượng theo số ký tự.
- Caption của container, sequence message và nhãn trên mũi tên vẫn giữ vị trí theo ngữ nghĩa của D2.
- Dùng luồng ngang, nhãn ngắn và xuống dòng hợp lý. Tách quy trình dài thành các giai đoạn thay vì thu nhỏ chữ đến mức khó đọc.
- Trên màn hình nhỏ, diagram cuộn ngang để giữ chữ rõ.
- Giữ cây thư mục, log, payload và những ví dụ text theo vị trí ở dạng text khi phù hợp.

**Ranh giới tin cậy:** chỉ compile MDX/D2 do người viết tài liệu đáng tin cậy quản lý trong repository. SVG được nhúng trực tiếp vào HTML; đây không phải sanitizer hay dịch vụ render input công khai. Không nhận D2 không tin cậy từ người dùng.

## Cấu hình D2

```ts
remarkPlugins: [[remarkD2, {
  sketch: true,
  layout: 'elk',
  scale: 0.75,
  padding: 12,
  themes: { light: 0, dark: 200 },
  cacheDir: '.cache/docs-kit/d2',
  concurrency: 2,
  defaultCaption: 'Sơ đồ',
}]],
```

| Option | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `sketch` | `true` | Phong cách vẽ tay |
| `layout` | `'elk'` | Engine mặc định: `elk` hoặc `dagre` |
| `scale` | `0.75` | Scale SVG, phải lớn hơn 0 |
| `padding` | `12` | Padding canvas SVG, không âm |
| `themes.light` / `themes.dark` | `0` / `200` | ID theme D2 cho từng chế độ |
| `cacheDir` | `.cache/docs-kit/d2` | Tương đối với working directory của website, hoặc đường dẫn tuyệt đối |
| `concurrency` | `2` | Từ 1 đến 8 renderer đồng thời trong cùng cache directory |
| `defaultCaption` | `'Diagram'` | Caption khi fence không có `title` |

Thêm `.cache/` vào `.gitignore` của website. Cache bao gồm source, vị trí xuất hiện, phiên bản SDK/renderer và options. Khóa filesystem giới hạn số WASM process khi Next.js compile nhiều trang song song. Lỗi cú pháp hiển thị file và vị trí fence, không bị giấu thành hình trống.

## Kiến trúc package

```text
src/
├── d2/
│   ├── index.ts       # Remark plugin, cache, giới hạn render
│   └── render.mjs     # Node/WASM renderer, đo và fit nhãn
├── components/
│   └── d2.tsx         # Pure React component
└── styles/
    └── d2.css         # CSS chỉ dành cho diagram
```

Public entry points:

- `@vanhiep99w/docs-kit/d2`: **build-time / Node.js**, không import trong client component.
- `@vanhiep99w/docs-kit/components/d2`: React component + `D2DiagramProps`.
- `@vanhiep99w/docs-kit/styles/d2.css`: stylesheet.

Không có barrel export gom plugin và component. Khi thêm tính năng, tạo module/component/CSS và subpath export tương ứng; không cần tạo package mới ngay. Giữ default an toàn và thêm tests trước khi đưa component mới vào API công khai.

## Phát triển và kiểm thử

```bash
npm ci
npm run typecheck
npm test
npm run test:pack
```

- `npm test`: build và kiểm tra chuyển đổi MDX, config, cache, SVG ID, accessibility, label fitting và chạy từ working directory không chứa code của host.
- `npm run test:pack`: tạo `.tgz`, cài vào consumer độc lập trong thư mục tạm, compile MDX và render component. Bước này cần registry để cài dependency của consumer.
- `npm pack`: tự build qua `prepare`; đóng gói `dist`, README, license và package manifest.

Sau khi thay đổi package local, build lại và cài lại bản package trong website. Với bản `.tgz`, tạo pack mới trước khi cài. Nâng version khi chia sẻ thay đổi giữa các repository.

## Phát hành

Package dùng [MIT License](./LICENSE). CI chỉ chạy kiểm thử, không tự động publish và không lưu token trong repository.

Quy trình phát hành:

1. Chạy unit tests và isolated packed-consumer test.
2. Nâng version khi tạo bản phát hành mới.
3. Commit thay đổi và push branch lên GitHub.
4. Đăng nhập tài khoản có quyền trên npm scope `@vanhiep99w`, chạy `npm publish --access public` và xác nhận 2FA nếu npm yêu cầu.
5. Kiểm tra version trên registry, rồi tạo/push tag `v<version>` tương ứng với commit đã phát hành.

Không commit `.tgz`, `dist`, cache, token hay `node_modules`. Một version đã publish không được ghi đè; thay đổi tiếp theo cần version mới.
