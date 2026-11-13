import { test, expect } from "./product-fixture.mjs";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test("表格搜索精确区分同格换行前后的命中并保持输入框焦点", async ({ product }) => {
  const source = "| 标题 | 值 |\n| --- | --- |\n| 中文<br>中文 | x |\n";
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  await product.focus(page);
  await page.keyboard.press(`${mod}+f`);
  const input = page.getByRole("searchbox", { name: "Find text" });
  await input.fill("中文");
  const read = () => page.evaluate(() => {
    const ranges = [...(CSS.highlights.get("fishmark-table-search") ?? [])];
    return ranges.map(range => ({ text: range.toString(),
      top: range.getBoundingClientRect().top, height: range.getBoundingClientRect().height,
      exact: range.startContainer.parentElement.closest(".cm-table-search-exact") !== null }));
  });
  await expect.poll(read).toMatchObject([{ text: "中文", exact: true }]);
  const first = (await read())[0];
  expect(first.height).toBeGreaterThan(0);
  await input.press("Enter");
  await expect.poll(async () => (await read())[0]?.top).toBeGreaterThan(first.top + first.height / 2);
  await expect(input).toBeFocused();
  expect(await read()).toMatchObject([{ text: "中文", exact: true }]);
  await product.checkpoint("second-match");
  await input.fill("中文 | x");
  await expect(page.locator(".cm-table-search-source-match")).toHaveAttribute("title", /源码视图/u);
  await expect.poll(read).toEqual([]);
  await input.fill("");
  await expect.poll(read).toEqual([]);
  await expect(page.locator(".cm-table-search-source-match")).toHaveCount(0);
  expect((await product.snapshot()).activeDocument.content).toBe(source);
  await product.normalClose();
});
