import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  configureMainProcessRuntime,
  shouldRequestSingleInstanceLock
} from "./runtime-environment";

describe("shouldRequestSingleInstanceLock", () => {
  it("keeps the single-instance guard in packaged/runtime mode", () => {
    expect(shouldRequestSingleInstanceLock({})).toBe(true);
  });

  it("keeps the single-instance guard in dev mode because the dev runtime already uses an isolated identity", () => {
    expect(
      shouldRequestSingleInstanceLock({
        VITE_DEV_SERVER_URL: "http://localhost:5173"
      })
    ).toBe(true);
  });
});

describe("configureMainProcessRuntime", () => {
  it("leaves packaged/runtime identity unchanged outside dev mode", () => {
    const app = {
      setName: vi.fn(),
      getPath: vi.fn(),
      setPath: vi.fn()
    };

    configureMainProcessRuntime(app, {});

    expect(app.setName).not.toHaveBeenCalled();
    expect(app.getPath).not.toHaveBeenCalled();
    expect(app.setPath).not.toHaveBeenCalled();
  });

  it("uses an isolated app identity and userData path in dev mode", () => {
    const app = {
      setName: vi.fn(),
      getPath: vi.fn((name: string) => (name === "appData" ? "C:/Users/demo/AppData/Roaming" : "")),
      setPath: vi.fn()
    };

    configureMainProcessRuntime(app, {
      VITE_DEV_SERVER_URL: "http://localhost:5173"
    });

    expect(app.setName).toHaveBeenCalledWith("Yulora Dev");
    expect(app.getPath).toHaveBeenCalledWith("appData");
    expect(app.setPath).toHaveBeenCalledWith(
      "userData",
      path.join("C:/Users/demo/AppData/Roaming", "Yulora-dev")
    );
  });
});
