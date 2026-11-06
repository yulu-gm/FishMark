import { describe, expect, it, vi } from "vitest";

import { createApplicationMenuTemplate } from "./application-menu";

describe("createApplicationMenuTemplate", () => {
  it("defines File commands for new, open, new window, save, save as, and HTML export", () => {
    const dispatchCommand = vi.fn();
    const template = createApplicationMenuTemplate({ dispatchCommand });
    const fileMenu = template.find((item) => item.label === "File");

    expect(fileMenu?.submenu).toBeDefined();

    const commandItems = fileMenu?.submenu?.filter((item) => typeof item.click === "function") ?? [];

    expect(commandItems.map((item) => item.label)).toEqual([
      "New",
      "Open...",
      "New Window",
      "Save",
      "Save As...",
      "Export HTML..."
    ]);
    expect(commandItems.map((item) => item.accelerator)).toEqual([
      "CmdOrCtrl+N",
      "CmdOrCtrl+O",
      "Shift+CmdOrCtrl+N",
      "CmdOrCtrl+S",
      "Shift+CmdOrCtrl+S",
      undefined
    ]);

    commandItems.forEach((item) => item.click?.());

    expect(dispatchCommand.mock.calls).toEqual([
      ["new-markdown-document"],
      ["open-markdown-file"],
      ["new-editor-window"],
      ["save-markdown-file"],
      ["save-markdown-file-as"],
      ["export-html-file"]
    ]);
  });

  it("routes undo and redo through the editor command bridge", () => {
    const dispatchCommand = vi.fn();
    const edit = createApplicationMenuTemplate({ dispatchCommand }).find(item => item.label === "Edit")!;
    const history = edit.submenu!.slice(0, 2);
    expect(history.map(item => item.accelerator)).toEqual(["CmdOrCtrl+Z", "Shift+CmdOrCtrl+Z"]);
    history.forEach(item => item.click?.());
    expect(dispatchCommand.mock.calls).toEqual([["undo"], ["redo"]]);
    expect(edit.submenu!.slice(3, 6).map(item => item.role)).toEqual(["cut", "copy", "paste"]);
    edit.submenu!.at(-1)!.click?.();
    expect(dispatchCommand).toHaveBeenLastCalledWith("select-all");
  });

  it("adds Check for Updates command in the Help menu", () => {
    const dispatchCommand = vi.fn();
    const template = createApplicationMenuTemplate({ dispatchCommand });
    const helpMenu = template.find((item) => item.label === "Help");

    expect(helpMenu?.submenu).toBeDefined();

    const helpItem = helpMenu?.submenu?.find((item) => item.label === "Check for Updates");
    expect(helpItem).toBeDefined();
    expect(typeof helpItem?.click).toBe("function");

    helpItem?.click?.();

    expect(dispatchCommand).toHaveBeenCalledWith("check-for-updates");
  });
});
