import { describe, expect, it, vi } from "vitest";

import { createApplicationMenuTemplate } from "./application-menu";

describe("createApplicationMenuTemplate", () => {
  it("defines File commands for new, open, save, and save as", () => {
    const dispatchCommand = vi.fn();
    const template = createApplicationMenuTemplate({ dispatchCommand });
    const fileMenu = template.find((item) => item.label === "File");

    expect(fileMenu?.submenu).toBeDefined();

    const commandItems = fileMenu?.submenu?.filter((item) => typeof item.click === "function") ?? [];

    expect(commandItems.map((item) => item.label)).toEqual([
      "New",
      "Open...",
      "Save",
      "Save As..."
    ]);
    expect(commandItems.map((item) => item.accelerator)).toEqual([
      "CmdOrCtrl+N",
      "CmdOrCtrl+O",
      "CmdOrCtrl+S",
      "Shift+CmdOrCtrl+S"
    ]);

    commandItems.forEach((item) => item.click?.());

    expect(dispatchCommand.mock.calls).toEqual([
      ["new-markdown-document"],
      ["open-markdown-file"],
      ["save-markdown-file"],
      ["save-markdown-file-as"]
    ]);
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
