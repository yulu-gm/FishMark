import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { test, expect } from './product-fixture.mjs';

const source = '- parent\n  - child\n    - grandchild\n  1. ordered\n  - [ ] task';

test('standalone HTML export preserves alternating markers and list geometry', async ({ product }) => {
  await product.seed(source, 60000);
  const page = await product.launch(source);
  const cssText = await page.evaluate(() => Array.from(document.styleSheets).flatMap(sheet => {
    try { return Array.from(sheet.cssRules, rule => rule.cssText); } catch { return []; }
  }).join('\n'));
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { createFishmarkExportHtml } = await server.ssrLoadModule('/export-html.ts');
    const html = createFishmarkExportHtml({ markdown: source, title: 'list.md', cssText });
    const exportPath = product.testInfo.outputPath('list-export.html');
    await writeFile(exportPath, html, 'utf8');
    const windowPromise = product.current.app.waitForEvent('window');
    await product.current.app.evaluate(({ BrowserWindow }, path) => {
      const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
      void window.loadFile(path);
    }, exportPath);
    const exported = await windowPromise;
    await exported.waitForLoadState('load');
    const rows = await exported.evaluate(() => {
      const lines = [...document.querySelectorAll('.cm-line')];
      return ['parent', 'child', 'grandchild', 'ordered', 'task'].map(text => {
        const line = lines.find(element => element.textContent.trim().endsWith(text));
        const marker = line?.querySelector('.cm-inactive-list-marker');
        const rect = marker?.getBoundingClientRect();
        return { classes: line?.className, mask: marker && getComputedStyle(marker, '::before').maskImage,
          marker: rect && { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
      });
    });
    expect(rows[0].mask).toBe('none');
    expect(rows[1].mask).toContain('radial-gradient');
    expect(rows[2].mask).toBe('none');
    expect(rows[3].classes).not.toContain('cm-list-marker-hollow');
    expect(rows[4].classes).not.toContain('cm-list-marker-hollow');
    expect(rows.slice(0, 3).every(row => row.marker.width > 0 && row.marker.height > 0)).toBe(true);
    await exported.screenshot({ path: product.testInfo.outputPath('exported-list.png') });
    await exported.close();
  } finally {
    await server.close();
  }
  await product.normalClose();
});
