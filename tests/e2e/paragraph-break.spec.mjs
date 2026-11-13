import { test, expect } from "./product-fixture.mjs";

async function rows(page) {
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  return page.locator(".cm-content .cm-line").evaluateAll(lines => lines.map(line => ({
    text: line.textContent,
    height: line.getBoundingClientRect().height,
    top: line.getBoundingClientRect().top - lines[0].getBoundingClientRect().top
  })));
}

test("Enter Enter Backspace 创建并删除完整空段落，保存重开不改变间距", async ({ product }) => {
  await product.seed("111\n222", 60000);
  const page = await product.launch("111\n222");
  await product.focus(page);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowRight" : "End");
  const step = async (key, text) => {
    await page.keyboard.press(key);
    await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(text);
  };
  await step("Enter", "111\n\n222");
  const entered = await rows(page);
  expect(entered.map(row => row.text)).toEqual(["111", "", "222"]);
  expect(entered[1].height).toBe(0);
  await step("Enter", "111\n\n\n\n222");
  const twice = await rows(page);
  expect(twice.filter(row => row.text === "" && row.height > 0)).toHaveLength(1);
  await step("Backspace", "111\n\n222");
  expect(await rows(page)).toEqual(entered);
  await step(process.platform === "darwin" ? "Meta+z" : "Control+z", "111\n\n\n\n222");
  await step(process.platform === "darwin" ? "Meta+Shift+z" : "Control+y", "111\n\n222");
  expect(await rows(page)).toEqual(entered);
  await page.screenshot({ path: product.testInfo.outputPath("paragraph-break.png") });
  await product.testInfo.attach("paragraph-geometry", {
    body: JSON.stringify({ entered, twice, final: await rows(page) }), contentType: "application/json"
  });
  await product.manualSave(page);
  await product.expectSaved("111\n\n222", page);
  await product.normalClose();
  const reopened = await product.launch("111\n\n222");
  expect(await rows(reopened)).toEqual(entered);
  await product.normalClose();
});
