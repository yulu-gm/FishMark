import { test, expect } from "./product-fixture.mjs";

test("repeated workspace snapshots keep one window lifecycle subscription without warnings", async ({ product }) => {
  const source = "# Watch lifecycle\n\nUnchanged 中文 document.\n";
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  const owner = await product.current.app.browserWindow(page);
  let before, after;
  try {
    before = await owner.evaluate(window => window.webContents.listenerCount("destroyed"));
    for (let index = 0; index < 100; index++) {
      const snapshot = await product.snapshot(page);
      expect(snapshot.activeDocument.content).toBe(source);
      expect(snapshot.activeDocument.isDirty).toBe(false);
    }
    after = await owner.evaluate(window => window.webContents.listenerCount("destroyed"));
    expect(after).toBe(before);
    expect(await product.disk()).toBe(source);
    await product.checkpoint("100-snapshots-listeners-stable-document-unchanged");
  } finally { await owner.dispose(); }
  await product.normalClose();
  const warnings = (await product.mainEvidence()).filter(event => event.event === "process:warning");
  expect(warnings.filter(event => event.detail.name === "MaxListenersExceededWarning")).toEqual([]);
  await product.testInfo.attach("watch-lifecycle", {
    body: JSON.stringify({ snapshots: 100, destroyedListenersBefore: before, destroyedListenersAfter: after, warnings }),
    contentType: "application/json"
  });
});
