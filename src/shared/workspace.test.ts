import { describe, expect, it } from "vitest";

import * as workspaceContract from "./workspace";

describe("workspace event contract", () => {
  it("publishes a dedicated typed event for main-driven window snapshots", () => {
    expect(
      (workspaceContract as Record<string, unknown>).WORKSPACE_WINDOW_SNAPSHOT_EVENT
    ).toBe("fishmark:workspace-window-snapshot");
  });
});
