import { describe, expect, expectTypeOf, it } from "vitest";

import * as workspaceContract from "./workspace";

describe("workspace owner-tab activation contract", () => {
  it("exports request and confirmation channels without a direct snapshot push event", () => {
    expect(workspaceContract.REQUEST_WORKSPACE_OWNER_TAB_ACTIVATION_EVENT).toBe(
      "fishmark:request-workspace-owner-tab-activation"
    );
    expect(workspaceContract.CONFIRM_WORKSPACE_OWNER_TAB_ACTIVATION_CHANNEL).toBe(
      "fishmark:confirm-workspace-owner-tab-activation"
    );
    expect(
      (workspaceContract as Record<string, unknown>).WORKSPACE_WINDOW_SNAPSHOT_EVENT
    ).toBeUndefined();
  });
});

describe("workspace document snapshot", () => {
  it("carries canonical and saved revisions for initial hydration", () => {
    expectTypeOf<workspaceContract.WorkspaceDocumentSnapshot>().toHaveProperty("revision");
    expectTypeOf<workspaceContract.WorkspaceDocumentSnapshot>().toHaveProperty("savedRevision");
  });
});
