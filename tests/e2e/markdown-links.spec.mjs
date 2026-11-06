import { cp, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test, expect } from "./product-fixture.mjs";

async function launchLinks(product, lineEnding) {
  const directory = join(product.directory, "markdown-links");
  await cp(resolve("fixtures/markdown-links"), directory, { recursive: true });
  product.documentPath = join(directory, "docs", "reports", "index.md");
  // Git 在 Windows CI 可能检出 CRLF；产品打开文件后统一为 LF，测试分别核对磁盘和内存。
  const content = (await readFile(product.documentPath, "utf8")).replace(/\r\n|\r/g, "\n").trimEnd();
  const diskContent = content.replaceAll("\n", lineEnding);
  await product.seed(diskContent, 60_000);
  const page = await product.launch(content);
  expect(await product.disk()).toBe(diskContent);
  return { page, content, directory };
}

const modifier = process.platform === "darwin" ? "Meta" : "Control";
const reportHref = "../../_trace_analysis/NiagaraDiagnosis_20261026/findings.md";
const link = (page, href) => page.locator(`[data-fishmark-link-href="${href}"]`);

for (const [endingName, lineEnding] of [["LF", "\n"], ["CRLF", "\r\n"]]) {
  test(`relative Markdown links open real files and retain the source draft (${endingName})`, async ({ product }) => {
    const { page, content, directory } = await launchLinks(product, lineEnding);
    const sourceTab = (await product.snapshot()).activeTabId;
    // 没有真实输入的 bridge 调用不能获得文件授权，合成 DOM 事件也不行。
    const denied = await page.evaluate(async ({ tabId, href }) => {
      try { await window.fishmark.prepareMarkdownLink({ tabId, href }); return false; }
      catch { return true; }
    }, { tabId: sourceTab, href: reportHref });
    expect(denied).toBe(true);
    await product.append("\n尚未保存的源文档编辑");
    const draft = `${content}\n尚未保存的源文档编辑`;
    await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(draft);
    await link(page, reportHref).click({ modifiers: [modifier] });
    const target = join(directory, "_trace_analysis", "NiagaraDiagnosis_20261026", "findings.md");
    const targetContent = await readFile(target, "utf8");
    await expect.poll(async () => (await product.snapshot()).activeDocument?.path).toBe(target);
    expect((await product.snapshot()).activeDocument.content).toBe(targetContent.replace(/\r\n|\r/g, "\n"));
    expect((await product.snapshot()).tabs).toHaveLength(2);
    await product.checkpoint("relative-link-opened");
    await page.locator('[data-fishmark-region="workspace-tab"]').filter({ hasText: "index.md" }).getByText("index.md", { exact: true }).click();
    await expect.poll(async () => (await product.snapshot()).activeDocument?.content).toBe(draft);
    expect((await product.snapshot()).activeDocument.isDirty).toBe(true);
    await link(page, reportHref).click({ modifiers: [modifier] });
    await expect.poll(async () => (await product.snapshot()).activeDocument?.path).toBe(target);
    expect((await product.snapshot()).tabs).toHaveLength(2);
    await page.locator('[data-fishmark-region="workspace-tab"]').filter({ hasText: "index.md" }).getByText("index.md", { exact: true }).click();
    await expect.poll(async () => (await product.snapshot()).activeTabId).toBe(sourceTab);
    await product.manualSave();
    await expect.poll(() => readFile(product.documentPath, "utf8")).toBe(draft);
    const encoded = "../../_trace_analysis/%E4%B8%AD%E6%96%87%20%E6%8A%A5%E5%91%8A.markdown";
    await link(page, encoded).click({ modifiers: [modifier] });
    await expect.poll(async () => (await product.snapshot()).activeDocument?.path).toBe(join(directory, "_trace_analysis", "中文 报告.markdown"));
    expect((await product.snapshot()).activeDocument.content).toContain("中文空格路径测试");
    expect(await readFile(target, "utf8")).toBe(targetContent);
    await product.checkpoint("encoded-relative-link-opened");
    await product.normalClose();
  });

  test(`external link clicks still reach the shell opener with unchanged URLs (${endingName})`, async ({ product }) => {
    const { page } = await launchLinks(product, lineEnding);
    // 在操作系统边界记录调用，避免测试打开用户浏览器或邮件客户端；其余产品链路不替换。
    await product.current.app.evaluate(({ shell }) => {
      globalThis.__markdownLinkExternalCalls = [];
      globalThis.__markdownLinkOriginalOpenExternal = shell.openExternal;
      shell.openExternal = async href => { globalThis.__markdownLinkExternalCalls.push(href); };
    });
    try {
      const urls = ["https://example.com/fishmark-link-test", "http://example.com/fishmark-link-test", "mailto:author@example.com"];
      for (const href of urls) await link(page, href).click({ modifiers: [modifier] });
      await expect.poll(() => product.current.app.evaluate(() => globalThis.__markdownLinkExternalCalls)).toEqual(urls);
      expect((await product.snapshot()).tabs).toHaveLength(1);
      await product.checkpoint("external-link-dispatch");
    } finally {
      await product.current.app.evaluate(({ shell }) => { shell.openExternal = globalThis.__markdownLinkOriginalOpenExternal; });
    }
    await product.normalClose();
  });
}
