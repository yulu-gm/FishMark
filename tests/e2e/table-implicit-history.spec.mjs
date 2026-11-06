import { test, expect } from './product-fixture.mjs';

const cases = [
  ['header with closing pipe', '| a | b |\n| --- | --- | --- |\n| x | y | z |\n', '0:2'],
  ['body with closing pipe', '| a | b | c |\n| --- | --- | --- |\n| x | y |\n', '1:2'],
  ['body without closing pipe', 'a | b | c\n--- | --- | ---\nx | y\n', '1:2'],
  ['padded and escaped body cells', 'Intro\n\n| a | b | c |\n| :---: | ---: | --- |\n|  x\\|q  |  y  |\n', '1:2'],
  ['multiple missing body cells', '| a | b | c | d |\n| --- | --- | --- | --- |\n| x | y |\n', '1:3'],
  ['multiple missing header cells', '| a | b |\n| --- | --- | --- | --- |\n| w | x | y | z |\n', '0:3']
];

for (const [label, source, selector] of cases) test(`implicit ${label}: undo, redo and later edits preserve source`, async ({ product }) => {
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  const cell = page.locator(`[data-table-cell="${selector}"]`);
  await cell.click();
  await page.keyboard.type('XYZ');
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toContain("XYZ");
  const edited = (await product.snapshot()).activeDocument.content;
  const undo = process.platform === 'darwin' ? 'Meta+z' : 'Control+z';
  const redo = process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z';
  await page.keyboard.press(undo);
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(source);
  await expect(cell).toBeFocused();
  await page.keyboard.press(redo);
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(edited);
  await page.keyboard.type('Y');
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toContain("XYZY");
  await page.keyboard.press(undo);
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(edited);
  await page.keyboard.press(undo);
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(source);
  await product.normalClose();
});

const undoKey = process.platform === 'darwin' ? 'Meta+z' : 'Control+z';
const redoKey = process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z';
const content = async product => (await product.snapshot()).activeDocument.content;

test('implicit cell: clear, retype, cross-cell edits and history branch remain distinct', async ({ product }) => {
  const source = '| a | b | c | d |\n| --- | --- | --- | --- |\n| x | y |\n';
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  const cell = page.locator('[data-table-cell="1:3"]');
  const neighbour = page.locator('[data-table-cell="1:1"]');
  await cell.click();
  await page.keyboard.type('first');
  await expect(cell).toHaveText('first');
  await expect.poll(() => content(product)).toContain('first');
  const first = await content(product);
  for (let index = 0; index < 'first'.length; index++) await page.keyboard.press('Backspace');
  await expect(cell).toHaveText('');
  await expect.poll(() => content(product)).toBe(first.replace('first', ''));
  const cleared = await content(product);
  expect(cleared).not.toBe(source);
  await page.keyboard.type('second');
  await expect(cell).toHaveText('second');
  await expect.poll(() => content(product)).toContain('second');
  const second = await content(product);
  await neighbour.click();
  await page.keyboard.press('End');
  await page.keyboard.type('other');
  await expect.poll(() => content(product)).toContain('other');
  const other = await content(product);
  expect(other).not.toBe(second);
  for (const expected of [second, cleared, first, source]) {
    await page.keyboard.press(undoKey);
    await expect.poll(() => content(product)).toBe(expected);
  }
  for (const expected of [first, cleared, second, other]) {
    await page.keyboard.press(redoKey);
    await expect.poll(() => content(product)).toBe(expected);
  }
  await page.keyboard.press(undoKey);
  await expect.poll(() => content(product)).toBe(second);
  await cell.click();
  await page.keyboard.press('End');
  await page.keyboard.type('new');
  await expect.poll(() => content(product)).toContain('new');
  const branch = await content(product);
  expect(branch).not.toBe(second);
  await page.keyboard.press(redoKey);
  await expect.poll(() => content(product)).toBe(branch);
  await page.keyboard.press(undoKey);
  await expect.poll(() => content(product)).toBe(second);
  await product.manualSave();
  await product.expectSaved(second);
  await product.normalClose();
});

test('menu undo and redo share document history with cell and source edits', async ({ product }) => {
  const source = '| a | b | c |\n| --- | --- | --- |\n| x | y |\n';
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  const cell = page.locator('[data-table-cell="1:2"]');
  await cell.click();
  await page.keyboard.type('menu');
  await expect.poll(() => content(product)).toContain('menu');
  const edited = await content(product);
  const menuHistory = async direction => product.current.app.evaluate(({ Menu }, direction) =>
    Menu.getApplicationMenu().items.find(item => item.label === 'Edit').submenu.items
      .find(item => item.label === direction).click(), direction);
  await menuHistory('Undo');
  await expect.poll(() => content(product)).toBe(source);
  await menuHistory('Redo');
  await expect.poll(() => content(product)).toBe(edited);
  await page.getByRole('button', { name: 'Switch to source mode', exact: true }).click();
  await product.focus(page);
  await page.keyboard.press(undoKey);
  await expect.poll(() => content(product)).toBe(source);
  await page.keyboard.press(redoKey);
  await expect.poll(() => content(product)).toBe(edited);
  await page.getByRole('button', { name: 'Switch to WYSIWYM mode', exact: true }).click();
  await cell.click();
  await page.keyboard.press(undoKey);
  await expect.poll(() => content(product)).toBe(source);
  await product.manualSave();
  await product.expectSaved(source);
  await product.normalClose();
});

test('committed Chromium composition in a missing cell undoes atomically', async ({ product }) => {
  const source = 'a | b | c\n--- | --- | ---\nx | y\n';
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  const cell = page.locator('[data-table-cell="1:2"]');
  await cell.click();
  const cdp = await product.current.app.context().newCDPSession(page);
  try {
    await cdp.send('Input.imeSetComposition', { text: '中', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.insertText', { text: '中文' });
    await expect.poll(() => content(product)).toBe(source.replace('x | y', 'x | y | 中文'));
    const edited = await content(product);
    await page.keyboard.press(undoKey);
    await expect.poll(() => content(product)).toBe(source);
    await expect(cell).toBeFocused();
    await page.keyboard.press(redoKey);
    await expect.poll(() => content(product)).toBe(edited);
    await page.keyboard.press(undoKey);
    await expect.poll(() => content(product)).toBe(source);
    await product.manualSave();
    await product.expectSaved(source);
  } finally { await cdp.detach(); }
  await product.normalClose();
});

test('Select All menu and shortcut deletion in a missing cell preserves the undo chain', async ({ product }) => {
  const source = '| a | b | c |\n| --- | --- | --- |\n| x | y |\n';
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  const cell = page.locator('[data-table-cell="1:2"]');
  await cell.click();
  await page.keyboard.type('selected');
  await expect.poll(() => content(product)).toContain('selected');
  const edited = await content(product);
  await product.current.app.evaluate(({ Menu }) => Menu.getApplicationMenu().items
    .find(item => item.label === 'Edit').submenu.items.find(item => item.label === 'Select All').click());
  await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toBe('selected');
  await page.keyboard.press('Backspace');
  await expect.poll(() => content(product)).toBe(edited.replace('selected', ''));
  await page.keyboard.press(undoKey);
  await expect.poll(() => content(product)).toBe(edited);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toBe('selected');
  await page.keyboard.press(undoKey);
  await expect.poll(() => content(product)).toBe(source);
  await product.normalClose();
});
