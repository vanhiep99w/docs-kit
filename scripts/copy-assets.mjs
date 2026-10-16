import { cp, mkdir } from 'node:fs/promises';

for (const file of ['d2/render.mjs', 'styles/d2.css']) {
  const target = new URL(`../dist/${file}`, import.meta.url);
  await mkdir(new URL('.', target), { recursive: true });
  await cp(new URL(`../src/${file}`, import.meta.url), target);
}
