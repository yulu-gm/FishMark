import { test, expect } from "./product-fixture.mjs";

const initial = "RF902 persistence 原文";

test("product open, native edit, File Save, normal close and same-profile relaunch preserve exact bytes", async ({ product }) => {
  await product.seed(initial, 60_000);
  await product.launch(initial);
  const suffix = " — native input café 日本語";
  await product.append(suffix);
  const expected = initial + suffix;
  await expect.poll(async () => (await product.snapshot()).activeDocument?.content).toBe(expected);
  expect((await product.snapshot()).activeDocument.isDirty).toBe(true);
  expect(await product.disk()).toBe(initial);
  await product.checkpoint("edited");
  await product.manualSave();
  await product.expectSaved(expected);
  const main = await product.mainEvidence();
  const menu = main.filter((entry) => entry.event === "menu:command");
  const saves = main.filter((entry) => entry.event === "save:start");
  expect(menu.map((entry) => entry.detail)).toEqual([["save-markdown-file"]]);
  expect(saves).toHaveLength(1);
  expect(saves[0].epochMs).toBeGreaterThanOrEqual(menu[0].epochMs);
  const renderer = await product.rendererEvidence();
  const input = renderer.events.filter((entry) => entry.event === "input").at(-1);
  expect(input.detail.trusted).toBe(true);
  expect(main.filter((entry) => entry.event === "window:blur" && entry.epochMs >= input.epochMs && entry.epochMs <= saves[0].epochMs)).toEqual([]);
  expect(renderer.events.filter((entry) => ["window:blur", "editor:focusout", "visibility"].includes(entry.event) && entry.epochMs >= input.epochMs && entry.epochMs <= saves[0].epochMs)).toEqual([]);
  await product.checkpoint("saved");
  await product.normalClose();
  expect(await product.disk()).toBe(expected);
  await product.launch(expected);
  await product.expectSaved(expected);
  await product.checkpoint("reopened");
  await product.normalClose();
});

test("true idle autosave preserves exact bytes and clears dirty without Save or blur", async ({ product }) => {
  const idleDelayMs = 1500;
  await product.seed(initial, idleDelayMs);
  await product.launch(initial);
  const expected = initial + " idle autosave 无手动保存";
  await product.append(" idle autosave 无手动保存");
  await expect.poll(async () => (await product.snapshot()).activeDocument?.content).toBe(expected);
  expect((await product.snapshot()).activeDocument.isDirty).toBe(true);
  expect(await product.disk()).toBe(initial);
  await product.expectSaved(expected);
  // Read evidence before screenshots or closing, which might change focus.
  const renderer = await product.rendererEvidence();
  const main = await product.mainEvidence();
  const inputs = renderer.events.filter((entry) => entry.event === "input");
  expect(inputs.length).toBeGreaterThan(0);
  expect(inputs.every((entry) => entry.detail.trusted)).toBe(true);
  const lastInput = inputs.at(-1);
  const timers = renderer.events.filter((entry) => entry.event === "idle-timer:fired" && entry.epochMs >= lastInput.epochMs);
  const saves = main.filter((entry) => entry.event === "save:start");
  expect(timers).toHaveLength(1);
  expect(saves).toHaveLength(1);
  expect(timers[0].epochMs - lastInput.epochMs).toBeGreaterThanOrEqual(idleDelayMs);
  expect(saves[0].epochMs).toBeGreaterThanOrEqual(timers[0].epochMs);
  expect(main.filter((entry) => entry.event === "menu:command")).toEqual([]);
  expect(main.filter((entry) => entry.event === "window:blur" && entry.epochMs >= lastInput.epochMs && entry.epochMs <= saves[0].epochMs)).toEqual([]);
  expect(renderer.events.filter((entry) => ["manual-save-key", "window:blur", "editor:focusout", "visibility"].includes(entry.event) && entry.epochMs >= lastInput.epochMs && entry.epochMs <= saves[0].epochMs)).toEqual([]);
  const focus = await product.current.page.evaluate(() => ({ windowFocused: document.hasFocus(), editorFocused: !!document.activeElement?.closest(".cm-editor") }));
  expect(focus).toEqual({ windowFocused: true, editorFocused: true });
  product.idleProof = { idleDelayMs, lastInput, timers, saves, focus, rendererEvents: renderer.events, mainEvents: main, manualSaveCommands: 0, attribution: "configured native timer fired before real save IPC; uninterrupted editor/window focus; no manual/menu/blur/visibility trigger" };
  await product.assertHealthy();
  await product.checkpoint("idle-saved");
  await product.normalClose();
});
