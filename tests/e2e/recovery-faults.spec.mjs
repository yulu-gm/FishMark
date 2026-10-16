import { appendFile, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test, expect } from "./product-fixture.mjs";

const initial = "RECOVERY original 原文";
const suffix = " acknowledged 日本語";
async function crashWithAcknowledgedEdit(product) {
  await product.seed(initial, 60_000);
  await product.launch(initial);
  await product.append(suffix);
  await expect.poll(async () => (await product.mainEvidence()).filter((e) => e.event === "edit:end" && e.detail.kind === "applied").length).toBe(1);
  expect((await product.snapshot()).activeDocument.content).toBe(initial + suffix);
  expect(await product.disk()).toBe(initial);
  const before = await product.preserveRecovery("valid-before-crash");
  await product.forceTerminate();
  return before;
}

async function preservedPair(product, injected, label) {
  const paths = await readdir(product.profile, { recursive: true });
  const candidates = paths.filter((path) => path.endsWith("recovery-snapshot.json") && dirname(path) !== ".");
  for (const candidate of candidates) {
    const directory = dirname(candidate);
    const copies = await Promise.all(injected.files.map(async (file) => {
      const bytes = await readFile(join(product.profile, directory, file.name)).catch(() => null);
      return bytes?.equals(Buffer.from(file.content, "utf8")) ? { name: file.name, bytes } : null;
    }));
    if (copies.every(Boolean)) {
      for (const copy of copies) await writeFile(product.testInfo.outputPath(`${label}-${copy.name}`), copy.bytes);
      return directory;
    }
  }
  throw new Error("Original snapshot/journal bytes were not preserved together outside the active files.");
}

async function assertRecoveryDialog(product) {
  const events = await product.mainEvidence();
  const calls = events.filter((entry) => entry.event === "dialog:error-box");
  expect(calls).toHaveLength(1);
  expect(calls[0].detail.title).toBe("Recovery incomplete");
  expect(events.filter((entry) => entry.event === "dialog:error-box-returned")).toHaveLength(1);
  const proof = JSON.parse(await readFile(product.current.dialogEvidencePath, "utf8"));
  expect(proof.status).toBe("passed");
  expect(proof.dialogs).toHaveLength(1);
  expect(proof.dialogs[0]).toMatchObject({ pid: product.current.identity.pid, completed: true });
  expect(["BM_CLICK", "BM_CLICK verified TaskDialog", "UIAutomation InvokePattern"]).toContain(proof.dialogs[0].action);
  if (proof.dialogs[0].action === "BM_CLICK") expect(proof.dialogs[0].buttonId).toBe(1);
  return { calls, proof };
}

for (const fault of ["truncated-tail", "complete-bad-line"]) test(`recovery fault ${fault} retains valid edits and original evidence through continued save`, async ({ product }) => {
  test.skip(process.platform !== "win32", "This native recovery-dialog case is Windows-specific.");
  const before = await crashWithAcknowledgedEdit(product);
  await appendFile(join(product.profile, "recovery-journal.jsonl"), fault === "truncated-tail" ? '{"kind":"edit-batch"' : '{"broken":\n', "utf8");
  const injected = await product.preserveRecovery(`injected-${fault}`);
  product.recoveryProof = { scope: "raw fault injection only after acknowledged edit and owned process termination; not power-loss durability", fault, before, injected };
  await product.launch(initial + suffix, { openDocument: false, recoveryDialog: true });
  const notification = await assertRecoveryDialog(product);
  const recovered = await product.snapshot();
  expect(recovered.activeDocument.isDirty).toBe(true);
  expect(await product.disk()).toBe(initial);
  const backup = await preservedPair(product, injected, "preserved-before-edit");
  await product.append(" continued");
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(initial + suffix + " continued");
  await product.manualSave();
  await product.expectSaved(initial + suffix + " continued");
  expect(await preservedPair(product, injected, "preserved-after-save")).toBe(backup);
  Object.assign(product.recoveryProof, { recovered, notification, backup, saved: await product.snapshot() });
  await product.checkpoint("continued-saved");
  await product.normalClose();
  expect(await preservedPair(product, injected, "preserved-after-close")).toBe(backup);
});

test("recovery fault offline disk change blocks ordinary save and permits explicit reload then edit", async ({ product }) => {
  const before = await crashWithAcknowledgedEdit(product);
  const external = "EXTERNAL disk changed while FishMark was stopped";
  await writeFile(product.documentPath, external, "utf8");
  await writeFile(product.testInfo.outputPath("offline-external-file.md"), external, "utf8");
  await product.launch(initial + suffix, { openDocument: false });
  const recovered = await product.snapshot();
  expect(recovered.activeDocument.isDirty).toBe(true);
  expect(await product.disk()).toBe(external);
  await product.manualSave();
  const banner = product.current.page.locator('[data-fishmark-region="external-file-conflict-banner"]');
  await expect.poll(async () => (await product.mainEvidence()).filter((e) => e.event === "save:end").length).toBe(1);
  expect((await product.mainEvidence()).find((e) => e.event === "save:end").detail).toMatchObject({ status: "error", error: { code: "disk-version-conflict" } });
  expect(await product.disk()).toBe(external);
  expect((await product.snapshot()).activeDocument.content).toBe(initial + suffix);
  product.recoveryProof = { scope: "offline original-path external overwrite", before, external, recovered, blockedEvents: await product.mainEvidence(), blockedSnapshot: await product.snapshot(), blockedDisk: await product.disk() };
  await expect(banner).toBeVisible();
  await product.checkpoint("external-overwrite-blocked");
  const blocked = { snapshot: await product.snapshot(), events: await product.mainEvidence(), banner: await banner.innerText(), disk: await product.disk() };
  await product.current.page.getByRole("button", { name: "重载磁盘版本", exact: true }).click();
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(external);
  await product.append(" continued after explicit reload");
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(external + " continued after explicit reload");
  await product.manualSave();
  await product.expectSaved(external + " continued after explicit reload");
  product.recoveryProof = { scope: "offline original-path external overwrite, recovery keeps unsaved memory; ordinary save rejected; explicit UI reload deliberately adopts disk then native editing and save", before, external, recovered, blocked, saved: await product.snapshot() };
  await product.checkpoint("explicit-reload-continued-saved");
  await product.normalClose();
});

test("recovery fault one failed tab blocks its chain but recovers another document", async ({ product }) => {
  test.skip(process.platform !== "win32", "This native recovery-dialog case is Windows-specific.");
  await product.seed(initial, 60_000);
  const page = await product.launch(initial);
  const originalTabId = (await product.snapshot()).activeTabId;
  await product.current.app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find((e) => e.label === "File").submenu.items.find((e) => e.label === "New").click());
  await expect.poll(async () => (await product.snapshot()).tabs.length).toBe(2);
  const brokenTabId = (await product.snapshot()).activeTabId;
  await product.append("bad chain");
  await expect.poll(async () => (await product.mainEvidence()).filter((e) => e.event === "edit:end" && e.detail.kind === "applied").length).toBe(1);
  await page.locator(`[data-tab-id="${originalTabId}"]`).click();
  await expect.poll(async () => (await product.snapshot()).activeTabId).toBe(originalTabId);
  await product.append(suffix);
  await expect.poll(async () => (await product.mainEvidence()).filter((e) => e.event === "edit:end" && e.detail.kind === "applied").length).toBe(2);
  const before = await product.preserveRecovery("valid-two-tab-before-crash");
  await product.forceTerminate({ expectedMenuCommands: [["new-markdown-document"]] });
  const entries = before.files.find((f) => f.name === "recovery-journal.jsonl").content.trim().split("\n").map(JSON.parse);
  expect(entries.map((e) => e.tabId)).toEqual([brokenTabId, originalTabId]);
  const broken = { ...entries[0], changes: [{ from: 10000, to: 10000, insert: "invalid range" }] };
  const unsafeContinuation = { ...entries[0], clientSequence: 2, changes: [{ from: 0, to: 0, insert: "MUST NOT REPLAY AFTER FAILED CHAIN" }] };
  await writeFile(join(product.profile, "recovery-journal.jsonl"), [broken, unsafeContinuation, entries[1]].map(JSON.stringify).join("\n") + "\n");
  const injected = await product.preserveRecovery("injected-invalid-first-tab-and-continuation");
  product.recoveryProof = { scope: "real two-tab ACK journal; injected invalid range and same-tab later candidate after external owned process termination", before, injected, originalTabId, brokenTabId };
  await product.launch("", { openDocument: false, recoveryDialog: true });
  product.current.expectedRecoveryWarnings = [`[fishmark] Recovery replay stopped for tab '${brokenTabId}': error`];
  expect((await product.snapshot()).activeTabId).toBe(brokenTabId);
  expect((await product.snapshot()).activeDocument.content).toBe("");
  const notification = await assertRecoveryDialog(product);
  const backup = await preservedPair(product, injected, "preserved-two-tab-before-edit");

  await product.current.page.locator(`[data-tab-id="${originalTabId}"]`).click();
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(initial + suffix);
  expect(await product.disk()).toBe(initial);
  const recovered = await product.snapshot();
  await product.append(" continued independent");
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(initial + suffix + " continued independent");
  await product.manualSave();
  await product.expectSaved(initial + suffix + " continued independent");
  Object.assign(product.recoveryProof, { notification, backup, recovered, saved: await product.snapshot() });
  await product.checkpoint("independent-tab-continued-saved");
  await product.normalClose();
  expect(await preservedPair(product, injected, "preserved-two-tab-after-close")).toBe(backup);
});
