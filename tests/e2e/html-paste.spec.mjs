import { test, expect } from "./product-fixture.mjs";

const mod = process.platform === "darwin" ? "Meta" : "Control";

const containerCases = [
  {
    name: "省略前缀的列表续行行首粘贴列表",
    source: "- parent\nOLDcontinued\n- sibling",
    html: "<ul><li>A</li><li>B</li></ul>",
    expected: "- parent\n  \n  -   A\n  -   B\n  \n  continued\n- sibling",
    caretTail: "continued"
  },
  {
    name: "省略前缀的引用续行行首粘贴围栏",
    source: "> parent\nOLDcontinued",
    html: '<pre><code class="language-js">x\n</code></pre>',
    expected: "> parent\n> \n> ```js\n> x\n> ```\n> \n> continued",
    caretTail: "continued"
  },
  {
    name: "列表项中间粘贴多段正文",
    source: "- before OLD tail\n  - child\n- sibling",
    html: "<p><strong>one</strong></p><p>two</p>",
    expected: "- before **one**\n  \n  two tail\n  - child\n- sibling",
    caretTail: " tail"
  },
  {
    name: "引用中粘贴列表片段",
    source: "> before OLD tail\n> after",
    html: "<ul><li>one</li><li>two</li></ul>",
    expected: "> before \n> \n> -   one\n> -   two\n> \n>  tail\n> after",
    caretTail: " tail"
  },
  {
    name: "引用列表中粘贴代码片段",
    source: "> - before OLD tail\n>   - child\n> - sibling",
    html: '<pre><code class="language-python">if ok:\n    return 1\n</code></pre>',
    expected: "> - before \n>   \n>   ```python\n>   if ok:\n>       return 1\n>   ```\n>   \n>    tail\n>   - child\n> - sibling",
    caretTail: "tail"
  }
];

for (const { name, source, html, expected, caretTail } of containerCases) {
  test(`${name}，保留容器和选区并支持撤销、重做、保存重开`, async ({ product }) => {
    await product.seed(source, 60_000);
    const page = await product.launch(source);
    // 在源码视图通过真实按键定位，切回所见模式后才发粘贴事件。
    await page.getByRole("button", { name: "Switch to source mode", exact: true }).click();
    await product.focus(page);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home");
    for (let index = 0; index < source.indexOf("OLD") + 3; index++) await page.keyboard.press("ArrowRight");
    for (let index = 0; index < 3; index++) await page.keyboard.press("Shift+ArrowLeft");
    await page.getByRole("button", { name: "Switch to WYSIWYM mode", exact: true }).click();
    await product.focus(page);
    await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toBe("OLD");

    const handled = await page.locator(".document-editor .cm-content").evaluate((element, html) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/html", html);
      clipboardData.setData("text/plain", "PLAIN FALLBACK");
      return !element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
    }, html);
    expect(handled).toBe(true);
    const content = async () => (await product.snapshot()).activeDocument.content;
    await expect.poll(content).toBe(expected);
    // 只读真实 DOM 选区，确认光标位于保留下来的尾部文字之前。
    await expect.poll(() => page.evaluate(() => {
      const selection = document.getSelection();
      const node = selection?.focusNode;
      const line = (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest(".cm-line");
      if (!node || !line || !selection.isCollapsed) return null;
      const tail = document.createRange();
      tail.selectNodeContents(line);
      tail.setStart(node, selection.focusOffset);
      return tail.toString();
    })).toBe(caretTail);
    await page.keyboard.press(`${mod}+z`);
    await expect.poll(content).toBe(source);
    await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toBe("OLD");
    await page.keyboard.press(`${mod}+Shift+z`);
    await expect.poll(content).toBe(expected);
    await product.manualSave();
    await product.expectSaved(expected);
    await product.normalClose();
    await product.launch(expected);
    await product.expectSaved(expected);
    await product.normalClose();
  });
}

test("网页格式粘贴成 Markdown，独立撤销并保存重开", async ({ product }) => {
  const source = "replace\n";
  const expected = "## 标题\n\n**粗体**和[链接](https://example.com/)\n\n> 引用\n";
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  await product.focus(page);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowLeft" : "Home");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+ArrowRight" : "Shift+End");
  const handled = await page.locator(".document-editor .cm-content").evaluate(element => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/html", '<h2>标题</h2><p><strong>粗体</strong>和<a href="https://example.com/">链接</a></p><blockquote>引用</blockquote>');
    clipboardData.setData("text/plain", "标题\n粗体和链接\n引用");
    clipboardData.items.add(new File(["PNG"], "clip.png", { type: "image/png" }));
    return !element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  });
  expect(handled).toBe(true);
  const content = async () => (await product.snapshot()).activeDocument.content;
  await expect.poll(content).toBe(expected);
  expect((await product.mainEvidence()).filter(event => event.detail?.channel === "fishmark:import-clipboard-image")).toEqual([]);
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(content).toBe(source);
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect.poll(content).toBe(expected);
  await product.manualSave();
  await product.expectSaved(expected);
  await product.normalClose();
  await product.launch(expected);
  await product.expectSaved(expected);
  await product.normalClose();
});
