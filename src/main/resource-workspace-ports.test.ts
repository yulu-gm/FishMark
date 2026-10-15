import path from "node:path";
import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { expect, it, vi } from "vitest";
import { createResourceWorkspacePorts } from "./resource-workspace-ports";
import { filePathIdentity } from "./file-path";

it("delegates Save/SaveAs and move/detach to the real class without losing receivers", () => {
  const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
  workspace.registerWindow("1"); workspace.registerWindow("2");
  const tabId = workspace.createUntitledTab("1").activeTabId!;
  const advance = vi.fn(); const saved = vi.fn();
  const ports = createResourceWorkspacePorts(workspace, advance, saved);
  expect(ports.save.getTabSession(tabId).path).toBeNull();
  for (const name of ["one.md", "two.md"]) {
    const target = path.resolve(name); const identity = fileIdentity(`path:${filePathIdentity(target, process.platform)}`, `inode:1:${name === "one.md" ? 1 : 2}`);
    expect(ports.save.saveTabDocument({ tabId, expectedWindowId: "1", capturedRevision: 0,
      document: { path: target, fileIdentity: identity, name, content: "", encoding: "utf-8" }, diskVersion: null }).kind).toBe("applied");
    expect(ports.save.getFileOwner(identity)).toMatchObject({ kind: "owned", owner: { tabId } });
    expect(ports.save.getTabSession(tabId).path).toBe(target);
  }
  expect(saved).toHaveBeenCalledTimes(2); expect(advance).toHaveBeenCalledTimes(2);
  expect(saved).toHaveBeenLastCalledWith(tabId);
  ports.transfer.moveTabToWindow({ tabId, targetWindowId: "1" }); expect(advance).toHaveBeenCalledTimes(2);
  ports.transfer.moveTabToWindow({ tabId, targetWindowId: "2" });
  expect(ports.transfer.getTabSession(tabId).windowId).toBe("2");
  ports.transfer.detachTabToWindow({ tabId, targetWindowId: "3" });
  expect(ports.transfer.getTabSession(tabId).windowId).toBe("3"); expect(advance).toHaveBeenCalledTimes(4);
});
