import { test, expect } from '@playwright/test';
const base='/?case=example-explorer';
test('small refs and launcher open a modal without resizing content; selectors support multiple apps and versions', async ({page}) => {
  const requests=[];
  const errors=[];
  page.on('request',request=>{if(request.url().includes('/example-demo'))requests.push(request.url());});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  await expect(page.locator('.example-ref')).toHaveCount(3);
  await expect(page.getByRole('button',{name:'Mở example',exact:true})).toBeVisible();
  expect(requests).toEqual([]);
  await expect(page.locator('iframe')).toHaveCount(0);
  const before=await page.locator('main').boundingBox();
  const trigger=page.getByRole('link',{name:'Example shop',exact:true});
  await trigger.click();
  const modal=page.locator('dialog.example-dialog');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('aria-modal','true');
  await expect(page.getByRole('button',{name:'Đóng example',exact:true})).toBeFocused();
  const after=await page.locator('main').boundingBox();
  expect(after.width).toBeCloseTo(before.width,1);
  expect(after.x).toBeCloseTo(before.x,1);
  expect(await page.locator('body').getAttribute('data-source-drawer-open')).toBeNull();
  await expect(page.getByRole('combobox',{name:'Chọn example',exact:true})).toHaveValue('shop');
  await expect(page.getByRole('combobox',{name:'Phiên bản example',exact:true})).toHaveValue('snapshot');
  await expect(page.locator('.example-dialog iframe')).toHaveAttribute('sandbox','allow-scripts allow-same-origin');
  const frame=page.frameLocator('.example-dialog iframe');
  await frame.getByRole('button',{name:'0',exact:true}).click();
  await expect(frame.getByRole('button',{name:'1',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Tải lại example',exact:true}).click();
  await expect(frame.getByRole('button',{name:'0',exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Phiên bản example',exact:true}).selectOption('events');
  await expect(frame.getByRole('button',{name:'10',exact:true})).toBeVisible();
  await expect(page).toHaveURL(/exampleVersion=events/);
  await page.getByRole('combobox',{name:'Chọn example',exact:true}).selectOption('bus');
  await expect(page.getByRole('combobox',{name:'Phiên bản example',exact:true})).toHaveValue('v1');
  await expect(frame.getByRole('button',{name:'20',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Mở source của example',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Đóng example',exact:true}).click();
  await expect(modal).toHaveCount(0);
  await expect(page).not.toHaveURL(/example=/);
  await expect(trigger).toBeFocused();
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Escape, backdrop, Back/Forward and reload restore the selected example without stealing source state', async ({page}) => {
  await page.goto(base+'&q=keep#heading');
  await page.getByRole('link',{name:'Example event-only',exact:true}).click();
  await expect(page.locator('dialog')).toBeVisible();
  await expect(page).toHaveURL(/q=keep.*example=shop.*exampleVersion=events#heading/);
  await page.goBack();
  await expect(page.locator('dialog')).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole('combobox',{name:'Phiên bản example',exact:true})).toHaveValue('events');
  await page.reload();
  await expect(page.getByRole('combobox',{name:'Phiên bản example',exact:true})).toHaveValue('events');
  await page.getByRole('button',{name:'Đóng example',exact:true}).press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/q=keep#heading/);
  await page.getByRole('button',{name:'Mở example',exact:true}).click();
  await expect(page.locator('dialog')).toBeVisible();
  await page.mouse.click(1,1);
  await expect(page.locator('dialog')).toHaveCount(0);
  await page.getByRole('link',{name:'Source fixture',exact:true}).click();
  await expect(page.locator('.source-drawer')).toBeVisible();
  await page.getByRole('button',{name:'Mở example',exact:true}).click();
  await expect(page.locator('dialog.example-dialog')).toBeVisible();
  await page.getByRole('button',{name:'Đóng example',exact:true}).press('Escape');
  await expect(page.locator('dialog.example-dialog')).toHaveCount(0);
  await expect(page.locator('.source-drawer')).toBeVisible();
  await expect(page).toHaveURL(/source=demo/);
});

test('unknown deep links show recoverable errors and route changes remove old launchers and frames', async ({page}) => {
  await page.goto(base+'&example=missing&exampleVersion=v99');
  await expect(page.getByRole('alert')).toContainText('Không tìm thấy example');
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('combobox',{name:'Chọn example',exact:true}).selectOption('shop');
  await expect(page.frameLocator('.example-dialog iframe').getByRole('button',{name:'0',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Đóng example',exact:true}).click();
  await page.getByRole('button',{name:'Trang khác',exact:true}).click();
  await expect(page.getByRole('button',{name:'Mở example',exact:true})).toHaveCount(0);
  await expect(page.locator('.example-ref')).toHaveCount(0);
  await expect(page.locator('dialog')).toHaveCount(0);
});

test('no-JavaScript and modified clicks retain real app links', async ({browser,page}) => {
  const context=await browser.newContext({javaScriptEnabled:false});
  const fallback=await context.newPage();
  await fallback.goto('http://127.0.0.1:4178'+base);
  await expect(fallback.getByRole('link',{name:'Example shop',exact:true})).toHaveAttribute('href','/example-demo?version=snapshot');
  await expect(fallback.locator('dialog,iframe')).toHaveCount(0);
  await context.close();
  await page.goto(base);
  const popupPromise=page.context().waitForEvent('page');
  await page.getByRole('link',{name:'Example shop',exact:true}).click({modifiers:['ControlOrMeta']});
  const popup=await popupPromise;
  await expect(popup).toHaveURL(/example-demo\?version=snapshot/);
  await expect(page.locator('dialog')).toHaveCount(0);
  await popup.close();
});

test('mobile, dark mode and a blocked iframe keep selectors and recovery actions accessible', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto(base);
  await page.route('**/example-demo?version=snapshot',route=>route.abort());
  await page.getByRole('button',{name:'Mở example',exact:true}).click();
  const dialog=page.locator('dialog.example-dialog');
  const light=await dialog.evaluate(element=>getComputedStyle(element).backgroundColor);
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  expect(await dialog.evaluate(element=>getComputedStyle(element).backgroundColor)).not.toBe(light);
  await expect(page.getByRole('button',{name:'Tải lại example',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Mở example trong tab mới',exact:true})).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Chọn example',exact:true})).toBeVisible();
  expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  const example=await page.locator('.example-launcher').boundingBox();
  const source=await page.locator('.source-launcher').boundingBox();
  expect(example.y+example.height).toBeLessThan(source.y);
});

test('native dialog traps focus and parent-toolbar Escape closes after focus leaves a cross-origin app', async ({page}) => {
  await page.goto(base);
  await page.getByRole('link',{name:'Example event-only',exact:true}).click();
  const app=page.frameLocator('.example-dialog iframe').getByRole('button',{name:'10',exact:true});
  await app.focus();
  await app.press('Escape');
  // Keyboard events inside arbitrary cross-origin apps do not bubble to the parent document.
  await expect(page.locator('dialog.example-dialog')).toBeVisible();
  await page.getByRole('button',{name:'Đóng example',exact:true}).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.example-dialog')).toHaveCount(0);
  await page.getByRole('link',{name:'Example shop',exact:true}).click();
  for(let i=0;i<12;i++){
    await page.keyboard.press('Tab');
    expect(await page.evaluate(()=>document.activeElement === document.body || !!document.activeElement?.closest('dialog.example-dialog'))).toBe(true);
  }
});
