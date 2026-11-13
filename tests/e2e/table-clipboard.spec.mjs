import { test, expect } from "./product-fixture.mjs";

const source = "| a | b |\n| --- | --- |\n| 1 | 2 |\n";
const pasted = [
  "| a | b    |        |",
  "| :--- | :--- | ------ |",
  "| 1 | x\\|y | a<br>b |",
  "|   | z    | w      |",
  ""
].join("\n");
const mod = process.platform === "darwin" ? "Meta" : "Control";

const cases = [
  ["TSV", { text: 'x|y\t"a\r\nb"\r\nz\tw\r\n' }],
  ["HTML", {
    text: "fallback\ttext",
    html: "<table><tr><td><strong>x|y</strong></td><td>a<br>b</td></tr><tr><td>z</td><td>w</td></tr></table>"
  }]
];

for (const [format, payload] of cases) {
  test(`table clipboard: ${format} expands from the selected cell and survives undo, redo and reopen`, async ({ product }) => {
    await product.seed(source, 60_000);
    const page = await product.launch(source);
    await product.focus(page);
    const start = page.locator('[data-table-cell="1:1"]');
    await start.click();
    await expect(start).toBeFocused();

    const content = async () => (await product.snapshot()).activeDocument.content;
    // 在真实渲染进程派发剪贴板事件，避免测试改写用户的系统剪贴板。
    const handled = await start.evaluate((element, payload) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", payload.text);
      if (payload.html) clipboardData.setData("text/html", payload.html);
      return !element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
    }, payload);
    expect(handled).toBe(true);
    await expect.poll(content).toBe(pasted);

    await page.keyboard.press(`${mod}+z`);
    await expect.poll(content).toBe(source);
    await page.keyboard.press(`${mod}+Shift+z`);
    await expect.poll(content).toBe(pasted);

    await product.manualSave();
    await product.expectSaved(pasted);
    await product.normalClose();
    await product.launch(pasted);
    await product.expectSaved(pasted);
    await product.normalClose();
  });
}
