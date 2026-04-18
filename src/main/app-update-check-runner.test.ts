import { describe, expect, it, vi } from "vitest";

import { createAppUpdateCheckRunner } from "./app-update-check-runner";

describe("createAppUpdateCheckRunner", () => {
  it("surfaces controller bootstrap failures for manual checks", async () => {
    const notify = vi.fn();
    const logger = {
      error: vi.fn()
    };
    const runCheck = createAppUpdateCheckRunner({
      getController: vi.fn().mockRejectedValue(new Error("bootstrap failed")),
      logger,
      notify
    });

    await expect(runCheck("manual")).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      "[yulora] failed to initialize app updater: bootstrap failed"
    );
    expect(notify).toHaveBeenCalledWith({
      kind: "error",
      message: "检查更新失败：bootstrap failed"
    });
  });

  it("logs bootstrap failures for automatic checks without showing a toast", async () => {
    const notify = vi.fn();
    const logger = {
      error: vi.fn()
    };
    const runCheck = createAppUpdateCheckRunner({
      getController: vi.fn().mockRejectedValue(new Error("bootstrap failed")),
      logger,
      notify
    });

    await expect(runCheck("auto")).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      "[yulora] failed to initialize app updater: bootstrap failed"
    );
    expect(notify).not.toHaveBeenCalled();
  });
});
