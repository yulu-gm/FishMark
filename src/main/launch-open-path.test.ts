import { describe, expect, it } from "vitest";

import {
  formatStartupOpenPathArgument,
  resolveMarkdownLaunchPathFromArgv,
  resolveStartupOpenPathFromArgv,
  STARTUP_OPEN_PATH_ARGUMENT_PREFIX
} from "./launch-open-path";

describe("resolveMarkdownLaunchPathFromArgv", () => {
  it("returns the markdown file path passed to the app on startup", () => {
    expect(
      resolveMarkdownLaunchPathFromArgv([
        "C:/Program Files/Yulora/Yulora.exe",
        "C:/notes/daily.md"
      ])
    ).toBe("C:/notes/daily.md");
  });

  it("ignores flags and non-markdown paths", () => {
    expect(
      resolveMarkdownLaunchPathFromArgv([
        "C:/Program Files/Yulora/Yulora.exe",
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
