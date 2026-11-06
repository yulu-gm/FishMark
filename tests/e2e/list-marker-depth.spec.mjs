import { test, expect } from './product-fixture.mjs';

const source = '- parent\n  - child\n    - grandchild\n  1. ordered\n  - [ ] task';
test('unordered markers alternate by level in editing and reading', async ({ product }) => {
  await product.seed(source, 60000);
  const page = await product.launch(source);
  const measure = async () => page.evaluate(() => {
    const lines = [...document.querySelectorAll('.cm-line')];
    return ['parent', 'child', 'grandchild', 'ordered', 'task'].map(text => {
      const line = lines.find(item => item.textContent.trim().endsWith(text));
      const marker = line?.querySelector('.cm-inactive-list-marker');
      const pseudo = marker ? getComputedStyle(marker, '::before') : null;
      const lineRect = line?.getBoundingClientRect();
      const markerRect = marker?.getBoundingClientRect();
      return { text, classes: line?.className, mask: pseudo?.maskImage, marker: markerRect && { left: markerRect.left, top: markerRect.top, width: markerRect.width, height: markerRect.height }, line: lineRect && { left: lineRect.left, top: lineRect.top, height: lineRect.height } };
    });
  });
  const check = async () => {
    const rows = await measure();
    expect(rows[0].mask).toBe('none');
    expect(rows[1].mask).toContain('radial-gradient');
    expect(rows[2].mask).toBe('none');
    expect(rows[3].classes).not.toContain('cm-list-marker-hollow');
    expect(rows[4].classes).not.toContain('cm-list-marker-hollow');
    expect((await product.snapshot()).activeDocument.content).toBe(source);
    return rows;
  };
  await product.focus(page);
  const reading = await check();
  await page.locator('.cm-line').filter({ hasText: 'child' }).first().click({ position: { x: 150, y: 10 } });
  const editing = await check();
  for (let i = 0; i < 3; i++) for (const dimension of ['left', 'top', 'width', 'height']) {
    expect(Math.abs(editing[i].marker[dimension] - reading[i].marker[dimension])).toBeLessThanOrEqual(2);
  }
  await page.screenshot({ path: product.testInfo.outputPath('list-depth-light.png') });
  await page.evaluate(() => window.fishmark.updatePreferences({ theme: { selectedId: 'default', mode: 'dark', effectsMode: 'off' } }));
  await expect.poll(() => page.locator('[data-fishmark-theme]').first().getAttribute('data-fishmark-theme')).toBe('dark');
  await check();
  await page.screenshot({ path: product.testInfo.outputPath('list-depth-dark.png') });
  await product.normalClose();
});
