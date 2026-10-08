import { describe, expect, it } from "vitest";

import {
  formatStartupOpenPathArgument,
  resolveMarkdownLaunchPathFromArgv,
  resolveMarkdownLaunchPathsFromArgv,
  resolveStartupOpenPathFromArgv,
  STARTUP_OPEN_PATH_ARGUMENT_PREFIX
} from "./launch-open-path";

describe("resolveMarkdownLaunchPathFromArgv", () => {
  it("preserves every markdown argument in shell order", () => {
    expect(resolveMarkdownLaunchPathsFromArgv(["electron.exe", "--ignored.md", "a.md", "b.MARKDOWN", "c.txt", "中文 file.md"]))
      .toEqual(["a.md", "b.MARKDOWN", "中文 file.md"]);
  });
  it("returns the markdown file path passed to the app on startup", () => {
    expect(
      resolveMarkdownLaunchPathFromArgv([
        "C:/Program Files/FishMark/FishMark.exe",
        "C:/notes/daily.md"
      ])
    ).toBe("C:/notes/daily.md");
  });

  it("ignores flags and non-markdown paths", () => {
    expect(
      resolveMarkdownLaunchPathFromArgv([
        "C:/Program Files/FishMark/FishMark.exe",
        "--flag",
        "C:/notes/daily.txt"
      ])
    ).toBeNull();
  });
});

describe("startup open path arguments", () => {
  it("formats a startup path as a dedicated additional argument", () => {
    expect(formatStartupOpenPathArgument("C:/notes/weekly plan.md")).toBe(
      `${STARTUP_OPEN_PATH_ARGUMENT_PREFIX}C%3A%2Fnotes%2Fweekly%20plan.md`
    );
  });

  it("reads the startup open path back from argv", () => {
    expect(
      resolveStartupOpenPathFromArgv([
        "electron.exe",
        `${STARTUP_OPEN_PATH_ARGUMENT_PREFIX}C%3A%2Fnotes%2Fweekly%20plan.md`
      ])
    ).toBe("C:/notes/weekly plan.md");
  });
});
