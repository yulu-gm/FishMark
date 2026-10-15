import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test, expect } from "./product-fixture.mjs";

const intro = ["# 林间手记 · A quiet reading rhythm", "",
  "引言：让标题成为清楚的路标，让正文自然接续。简洁的界面留给文字本身，阅读时能够分辨章节，编辑时仍然保持原来的位置。",
  "", "第二段：This is a long-form document with Chinese and English, **强调文字**、*轻声提示*与 `inline code`。间距服务于阅读，不替代内容的结构。",
  "", "## 从观察到记录", "",
  "先读完一段，再沿着清晰的标题进入下一节。A comfortable rhythm keeps related sentences together and leaves a modest pause between ideas.",
  "", "### 随手整理", "", "- 第一项：保持信息的层级，不为每一行增加空白。", "- 第二项：让长句自然换行，中文与 English 保持同一阅读节奏。", "  - 嵌套条目保持原有缩进与连续性。",
  "", "整理之后回到正文，列表只是行文的一部分。", "", "#### 数据与细节", "",
  "| 项目 | 观察 |", "| --- | --- |", "| 清晨 | 窗边的自然光与安静的文字 |", "| 午后 | Longer notes wrap naturally inside the available document width. |",
  "", "表格后的段落继续解释观察；点击单元格时，视口应保持安静。", "", "##### 一小段代码", "",
  "```js", "const note = { title: 'Quiet notes', count: 3 };", "console.log(note.title);", "```", "",
  "代码后的正文接续说明，保持适度的区分。", "", "###### 更细的注记", "", "细节也应该有清楚的层级，不必增加装饰。"];
const source = [...intro, ...Array.from({ length: 45 }, (_, i) => ["", `## 长文第 ${i + 1} 节`, "",
  `rhythm-${i} 长文中的位置应当可以可靠地返回。${"细读每一句话，保持行文的连续与节奏。 ".repeat(6)}`, "",
  "接续段落记录另一种观察。The document continues without artificial empty lines or a fixed maximum width."]).flat()].join("\n");

async function settle(page) { await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))); }
async function geometry(page) {
  await settle(page);
  return page.evaluate(() => {
    const scroller = document.querySelector(".cm-scroller"), content = document.querySelector(".cm-content"), rect = scroller.getBoundingClientRect();
    return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scrollTop: scroller.scrollTop,
      contentWidth: content.getBoundingClientRect().width, paddingInline: getComputedStyle(content).paddingLeft,
      rows: [...content.querySelectorAll(".cm-line")].map(row => { const r = row.getBoundingClientRect(), c = getComputedStyle(row);
        return { text: row.textContent, classes: row.className, y: r.top - rect.top, height: r.height,
          fontSize: c.fontSize, lineHeight: c.lineHeight, paddingTop: c.paddingTop, paddingBottom: c.paddingBottom }; }) };
  });
}
for (const mode of ["light", "dark"]) test(`reading rhythm in ${mode} wide narrow and shell modes`, async ({ product }) => {
  test.setTimeout(120_000);
  await product.seed(source, 60_000);
  await writeFile(join(product.profile, "preferences.json"), JSON.stringify({ version: 3, autosave: { idleDelayMs: 60_000 }, theme: { mode, effectsMode: "off" } }));
  const page = await product.launch(source);
  const exit = page.getByRole("button", { name: "退出阅读模式 (F11)", exact: true });
  if (await exit.isVisible()) await exit.click();
  const owner = await product.current.app.browserWindow(page), proofs = [];
  for (const width of [1280, 900]) {
    const native = await owner.evaluate((window, width) => { window.setSize(width, 1000); return { minimum: window.getMinimumSize(), bounds: window.getBounds(), content: window.getContentSize() }; }, width);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(native.content[0]);
    await product.focus(page); await page.keyboard.press("Control+Home");
    for (const shell of ["edit", "reading"]) {
      if (shell === "reading") await page.keyboard.press("F11");
      await settle(page); const proof = await geometry(page);
      await page.screenshot({ path: product.testInfo.outputPath(`${mode}-${width}-${shell}.png`) });
      proofs.push({ mode, width, shell, native, ...proof });
      expect(proof.contentWidth).toBeLessThanOrEqual(proof.width);
      expect(proof.rows.some(row => row.text.includes("林间手记"))).toBe(true);
      if (shell === "reading") await page.keyboard.press("F11");
    }
  }
  await owner.dispose();
  await product.focus(page); await page.keyboard.press("Control+Home");
  const heading = page.locator(".cm-line").filter({ hasText: "林间手记" }).first();
  const active = await heading.boundingBox();
  await page.locator(".cm-line").filter({ hasText: "引言：" }).click();
  await settle(page);
  const inactive = await heading.boundingBox();
  expect(Math.abs(inactive.height - active.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(inactive.y - active.y)).toBeLessThanOrEqual(1);
  expect(await heading.locator(".cm-active-heading-marker").count()).toBe(0);
  await page.getByRole("button", { name: "Switch to source mode", exact: true }).click();
  expect(await heading.evaluate(row => getComputedStyle(row).paddingTop)).toBe("0px");
  await page.getByRole("button", { name: "Switch to WYSIWYM mode", exact: true }).click();
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  await page.locator(".outline-panel-item").filter({ hasText: "数据与细节" }).click();
  await expect(page.locator(".cm-table-widget-table")).toBeVisible();
  const table = page.locator(".cm-table-widget-table"), before = await geometry(page);
  await table.locator("td").first().click();
  const after = await geometry(page);
  expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThanOrEqual(1);
  expect((await product.snapshot()).activeDocument.content).toBe(source);
  expect((await product.snapshot()).activeDocument.isDirty).toBe(false);
  expect(await readFile(product.documentPath, "utf8")).toBe(source);
  await product.testInfo.attach("rhythm-geometries", { body: JSON.stringify({ proofs, tableClick: { before, after } }, null, 2), contentType: "application/json" });
  await product.checkpoint("reading-rhythm-preserved-source");
  await product.normalClose();
});

test("reading rhythm preserves multiline paragraphs nested headings and source separators", async ({ product }) => {
  const text = ["# Rhythm edges", "", "First physical line in one paragraph", "second physical line in the same paragraph", "",
    "## Consecutive heading", "### Another heading", "", "- ### Nested list heading", "",
    "> ## Nested quote heading", "", "After containers", "", "", "Last paragraph"].join("\n");
  await product.seed(text, 60_000); const page = await product.launch(text);
  const exit = page.getByRole("button", { name: "退出阅读模式 (F11)", exact: true });
  if (await exit.isVisible()) await exit.click();
  await product.focus(page); await page.keyboard.press("Control+Home");
  const proof = await geometry(page), first = proof.rows.find(r => r.text.includes("First physical")), second = proof.rows.find(r => r.text.includes("second physical"));
  expect(first.paddingBottom).toBe("0px");
  expect(second.paddingTop).toBe("0px");
  expect(Math.abs(second.y - first.y - first.height)).toBeLessThanOrEqual(1);
  for (const label of ["Nested list heading", "Nested quote heading"]) {
    const row = proof.rows.find(r => r.text.includes(label));
    expect(row.paddingTop).toBe("0px"); expect(row.paddingBottom).toBe("0px");
  }
  const separators = proof.rows.filter(r => r.classes.includes("cm-fm-line-structural-separator"));
  expect(separators.length).toBeGreaterThan(0);
  expect(separators.every(r => r.height === 0)).toBe(true);
  expect(proof.rows.some(r => r.classes.includes("cm-fm-line-extra-blank") && r.height > 0)).toBe(true);
  const standard = JSON.parse(await readFile("docs/standards/markdown-text-rendering-standard.json", "utf8"));
  const heading = proof.rows.find(r => r.text.includes("Consecutive heading"));
  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(Math.abs(parseFloat(heading.paddingTop) - standard.blockSpacing.heading.topLevelBeforeRem.h2 * rem)).toBeLessThanOrEqual(1);
  expect(Math.abs(parseFloat(first.lineHeight) / parseFloat(first.fontSize) - standard.typography.lineHeight.paragraph)).toBeLessThan(0.02);
  await product.testInfo.attach("rhythm-edge-geometry", { body: JSON.stringify(proof), contentType: "application/json" });
  expect((await product.snapshot()).activeDocument.content).toBe(text);
  expect((await product.snapshot()).activeDocument.isDirty).toBe(false);
  expect(await readFile(product.documentPath, "utf8")).toBe(text);
  await product.normalClose();
});
