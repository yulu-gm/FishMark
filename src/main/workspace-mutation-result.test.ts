import type {
  WorkspaceMutationResult,
  WorkspaceWindowProjection
} from "@fishmark/workspace-domain";
import { describe, expect, it } from "vitest";

import { requireAppliedWorkspaceMutation } from "./workspace-mutation-result";

const emptyProjection: WorkspaceWindowProjection = Object.freeze({
  windowId: "window-1",
  activeTabId: null,
  tabs: Object.freeze([]),
  activeDocument: null
});

describe("requireAppliedWorkspaceMutation", () => {
  it("returns only an applied projection", () => {
    const result: WorkspaceMutationResult = {
      kind: "applied",
      projection: emptyProjection
    };

    expect(requireAppliedWorkspaceMutation(result, "draft update")).toBe(
      emptyProjection
    );
  });

  it.each([
    ["tab-missing", "tab no longer exists"],
    ["window-missing", "owner window no longer exists"],
    ["window-changed", "tab owner changed"],
    ["revision-changed", "document revision changed"]
  ] as const)("rejects %s instead of exposing a stale projection", (reason, message) => {
    const result: WorkspaceMutationResult = {
      kind: "stale",
      reason,
      projection: reason === "window-missing" ? null : emptyProjection
    };

    expect(() => requireAppliedWorkspaceMutation(result, "draft update")).toThrow(
      `Workspace draft update rejected: ${message}.`
    );
  });
});
