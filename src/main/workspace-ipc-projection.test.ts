import { createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it } from "vitest";

import {
  toWorkspaceMoveTabResult,
  toWorkspaceWindowSnapshot
} from "./workspace-ipc-projection";

const document = (name: string, content: string) => ({
  path: `C:/notes/${name}`,
  name,
  content,
  encoding: "utf-8" as const
});

describe("workspace IPC projection", () => {
  it("deep-copies a frozen domain window projection into a mutable IPC snapshot", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const source = workspace.openDocument(
      "window-1",
      document("note.md", "# Domain\n")
    );

    expect(Object.isFrozen(source)).toBe(true);
    expect(Object.isFrozen(source.tabs)).toBe(true);
    expect(Object.isFrozen(source.tabs[0])).toBe(true);
    expect(Object.isFrozen(source.activeDocument)).toBe(true);

    const mapped = toWorkspaceWindowSnapshot(source);

    expect(mapped).toEqual(source);
    expect(mapped).not.toBe(source);
    expect(mapped.tabs).not.toBe(source.tabs);
    expect(mapped.tabs[0]).not.toBe(source.tabs[0]);
    expect(mapped.activeDocument).not.toBe(source.activeDocument);

    mapped.tabs[0]!.name = "mutated.md";
    mapped.activeDocument!.content = "mutated";
    mapped.activeTabId = null;

    expect(source.tabs[0]!.name).toBe("note.md");
    expect(source.activeDocument!.content).toBe("# Domain\n");
    expect(source.activeTabId).not.toBeNull();
  });

  it("deep-copies both sides of a move projection", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    workspace.openDocument("window-1", document("kept.md", "kept"));
    const movedTabId = workspace.openDocument(
      "window-1",
      document("moved.md", "moved")
    ).activeTabId!;
    workspace.registerWindow("window-2");
    workspace.openDocument("window-2", document("target.md", "target"));
    const source = workspace.moveTabToWindow({
      tabId: movedTabId,
      targetWindowId: "window-2"
    });

    expect(Object.isFrozen(source)).toBe(true);
    expect(Object.isFrozen(source.sourceWindowSnapshot)).toBe(true);
    expect(Object.isFrozen(source.targetWindowSnapshot)).toBe(true);

    const mapped = toWorkspaceMoveTabResult(source);

    expect(mapped).toEqual(source);
    expect(mapped.sourceWindowSnapshot).not.toBe(source.sourceWindowSnapshot);
    expect(mapped.sourceWindowSnapshot.tabs).not.toBe(
      source.sourceWindowSnapshot.tabs
    );
    expect(mapped.sourceWindowSnapshot.tabs[0]).not.toBe(
      source.sourceWindowSnapshot.tabs[0]
    );
    expect(mapped.sourceWindowSnapshot.activeDocument).not.toBe(
      source.sourceWindowSnapshot.activeDocument
    );
    expect(mapped.targetWindowSnapshot).not.toBe(source.targetWindowSnapshot);
    expect(mapped.targetWindowSnapshot.tabs).not.toBe(
      source.targetWindowSnapshot.tabs
    );
    expect(mapped.targetWindowSnapshot.tabs[0]).not.toBe(
      source.targetWindowSnapshot.tabs[0]
    );
    expect(mapped.targetWindowSnapshot.activeDocument).not.toBe(
      source.targetWindowSnapshot.activeDocument
    );

    mapped.sourceWindowSnapshot.tabs[0]!.name = "changed-source.md";
    mapped.targetWindowSnapshot.tabs[0]!.name = "changed-target.md";
    mapped.targetWindowSnapshot.activeDocument!.content = "changed-content";

    expect(source.sourceWindowSnapshot.tabs[0]!.name).toBe("kept.md");
    expect(source.targetWindowSnapshot.tabs[0]!.name).toBe("target.md");
    expect(source.targetWindowSnapshot.activeDocument!.content).toBe("moved");
  });
});
