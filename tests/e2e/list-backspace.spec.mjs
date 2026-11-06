import { test, expect } from './product-fixture.mjs';

const cases = [
  ['unordered', '- parent', '- parent\n- ', '- parent\n  - '],
  ['ordered', '1. parent', '1. parent\n2. ', '1. parent\n  1. '],
  ['three levels', '- parent\n  - child', '- parent\n  - child\n  - ', '- parent\n  - child\n    - ']
];

for (const [name, source, entered, nested] of cases) {
test(`${name} nested list marker removal leaves no indentation`, async ({ product }) => {
  await product.seed(source, 60000);
  const page = await product.launch(source);
  await product.focus(page);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  const read = async () => (await product.snapshot()).activeDocument.content;
  const step = async (key, expected) => { await page.keyboard.press(key); await expect.poll(read).toBe(expected); };
  await step('Enter', entered);
  await step('Tab', nested);
  await page.keyboard.type('x');
  await expect.poll(read).toBe(nested + 'x');
  await step('Backspace', nested);
  await step('Backspace', source + '\n');
  const undo = process.platform === 'darwin' ? 'Meta+z' : 'Control+z';
  const redo = process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+y';
  await step(undo, nested);
  await step(redo, source + '\n');
  await step('Backspace', source);
  await product.manualSave(page);
  await product.expectSaved(source, page);
  await product.normalClose();
});
}
