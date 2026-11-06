import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test, expect } from "./product-fixture.mjs";

const tab = (page, id) => page.locator(`[data-fishmark-region="workspace-tab"][data-tab-id="${id}"]`);

async function openFiles(product, page, paths) {
  const before = (await product.snapshot()).tabs.length;
  await page.evaluate(() => {
    const input = document.createElement("input"); input.type = "file"; input.multiple = true;
    input.dataset.tabMenuFixture = "true"; document.body.append(input);
  });
  await page.locator('input[data-tab-menu-fixture]').setInputFiles(paths);
  await page.evaluate(() => {
    const input = document.querySelector('input[data-tab-menu-fixture]');
    const transfer = new DataTransfer(); for (const file of input.files) transfer.items.add(file);
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true })); input.remove();
  });
  await expect.poll(async () => (await product.snapshot()).tabs.length).toBe(before + paths.length);
}

for (const mode of ["light", "dark"]) test(`页签菜单在 ${mode} 主题下操作指定文件并保留编辑`, async ({ product }) => {
  test.setTimeout(120_000);
  const source = "# 页签菜单\n\n原始内容";
  await product.seed(source, 60_000);
  await writeFile(join(product.profile, "preferences.json"), JSON.stringify({ version: 3, autosave: { idleDelayMs: 60_000 }, theme: { mode, effectsMode: "off" } }));
  const page = await product.launch(source), first = (await product.snapshot()).activeTabId;
  const otherPath = join(dirname(product.documentPath), "b.md"); await writeFile(otherPath, "另一份文件");
  await openFiles(product, page, [otherPath]);
  const second = (await product.snapshot()).activeTabId;
  const firstBox = await tab(page, first).locator('..').boundingBox();
  const secondBox = await tab(page, second).locator('..').boundingBox();
  expect(firstBox.height).toBe(30); expect(secondBox.height).toBe(30);
  expect(secondBox.width).toBeLessThan(firstBox.width);
  expect(firstBox.width).toBeLessThanOrEqual(200);

  await tab(page, first).click({ button: "right" });
  expect((await product.snapshot()).activeTabId).toBe(second);
  await expect(page.getByRole('menu')).toBeVisible();
  await page.screenshot({ path: product.testInfo.outputPath(`tab-menu-${mode}.png`) });
  await page.getByRole('menuitem', { name: '复制文件路径', exact: true }).click();
  expect(await product.current.app.evaluate(({ clipboard }) => clipboard.readText())).toBe(product.documentPath);
  expect((await product.snapshot()).activeTabId).toBe(second);
  await tab(page, first).click({ button: "right" });
  await page.getByRole('menuitem', { name: '保存', exact: true }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect((await product.snapshot()).activeTabId).toBe(second);

  await tab(page, first).click();
  await product.append(" 新编辑");
  const edited = source + " 新编辑";
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(edited);
  await tab(page, first).click({ button: "right" });
  await page.getByRole('menuitem', { name: '重命名…', exact: true }).click();
  await page.getByLabel('文件名', { exact: true }).fill('b.md');
  await page.getByRole('button', { name: '重命名', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('同名');
  expect(await readFile(otherPath, 'utf8')).toBe('另一份文件');
  await page.getByLabel('文件名', { exact: true }).fill('重命名.md');
  await page.getByRole('button', { name: '重命名', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const renamedPath = join(dirname(product.documentPath), '重命名.md');
  await expect.poll(async () => (await product.snapshot()).activeDocument.path).toBe(renamedPath);
  expect((await product.snapshot()).activeDocument.content).toBe(edited);
  await expect(stat(product.documentPath)).rejects.toMatchObject({ code: 'ENOENT' });
  // 改名后继续编辑再保存，验证保存和监视器均使用新路径。
  await product.append(' 后续编辑');
  const saved = edited + ' 后续编辑';
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(saved);
  await tab(page, first).click({ button: "right" });
  await page.getByRole('menuitem', { name: '保存', exact: true }).click();
  await expect.poll(() => readFile(renamedPath, 'utf8')).toBe(saved);
  await expect.poll(async () => (await product.snapshot()).activeDocument.isDirty).toBe(false);
  await tab(page, second).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '关闭', exact: true }).click();
  await expect.poll(async () => (await product.snapshot()).tabs.length).toBe(1);
  expect((await product.snapshot()).activeTabId).toBe(first);
  await product.normalClose();
});

test('大量页签可滚动，键盘可打开菜单，未保存文件禁用路径命令', async ({ product }) => {
  test.setTimeout(120_000);
  const source = '首个文件'; await product.seed(source, 60_000);
  const page = await product.launch(source), first = (await product.snapshot()).activeTabId;
  const paths = Array.from({ length: 18 }, (_, index) => join(dirname(product.documentPath), `第${index}个很长的页签文件名.md`));
  await Promise.all(paths.map((path, index) => writeFile(path, `文件 ${index}`)));
  await openFiles(product, page, paths);
  const strip = page.locator('.workspace-tab-strip-scroll');
  await expect.poll(() => strip.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  const active = await tab(page, (await product.snapshot()).activeTabId).boundingBox();
  expect(active.x + active.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  await strip.hover(); await page.mouse.wheel(-10000, 0);
  await expect.poll(() => strip.evaluate(element => element.scrollLeft)).toBe(0);
  await tab(page, first).focus(); await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('menu')).toHaveCount(0);
  await product.current.app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(item => item.label === 'File').submenu.items.find(item => item.label === 'New').click());
  await expect.poll(async () => (await product.snapshot()).activeDocument.path).toBe(null);
  await tab(page, (await product.snapshot()).activeTabId).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '重命名…', exact: true })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: '复制文件路径', exact: true })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: '保存', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await product.normalClose();
});
