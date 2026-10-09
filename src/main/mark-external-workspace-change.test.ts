import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { describe, expect, it } from "vitest";
import { openTestDocument } from "./workspace.test-helper";
import { markExternalWorkspaceChange } from "./mark-external-workspace-change";

function setup(paths: string[]) {
  const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
  workspace.registerWindow("window-1");
  const tabs = paths.map((path, index) => openTestDocument(workspace, "window-1", {
    path, name: `document-${index}.md`, content: `memory-${index}`, encoding: "utf-8",
    fileIdentity: fileIdentity(`path:${index}`)
  }).activeTabId!);
  return { workspace, tabs };
}

describe("external watch notification routing", () => {
  it.each([
    ["C:\\中文 空格\\Note.md", "C:/中文 空格/Note.md"],
    ["C:/中文 空格/Note.md", "C:\\中文 空格\\Note.md"]
  ])("routes a separator alias to its document without replacing text (%s)", (stored, notified) => {
    const { workspace, tabs } = setup([stored, "C:/other.md"]);
    markExternalWorkspaceChange(workspace, notified, "modified", "win32");
    expect(workspace.getTabSession(tabs[0]!).externalChange).toEqual({kind: "modified"});
    expect(workspace.getWindowProjection("window-1").activeDocument?.content).toBe("memory-1");
    expect(workspace.getTabSession(tabs[1]!).externalChange).toBeNull();
  });
});

it.each([
  ["win32", "C:\\Notes\\中文 空格.MD", "c:/notes/中文 空格.md", true],
  ["linux", "/Notes/中文 空格.MD", "/notes/中文 空格.md", false],
  ["darwin", "/Notes/中文 空格.MD", "/notes/中文 空格.md", false],
  ["linux", "/notes/a\\b.md", "/notes/a/b.md", false],
  ["win32", "\\\\server\\share\\中文 空格.md", "//server/share/中文 空格.md", true],
  ["win32", "\\\\server\\share\\a.md", "\\server\\share\\a.md", false],
  ["win32", "C:\\notes\\a.md", "C:/other/a.md", false]
] as const)("preserves %s path identity (%s, %s)", (platform, stored, notified, matches) => {
  const { workspace, tabs } = setup([stored]);
  markExternalWorkspaceChange(workspace, notified, "deleted", platform);
  expect(workspace.getTabSession(tabs[0]!).externalChange).toEqual(matches ? { kind: "deleted" } : null);
});

it("marks an inactive dirty document without changing text, revision, selection or other documents", () => {
  const { workspace, tabs } = setup(["C:\\notes\\中文 空格.md", "C:/notes/other.md"]);
  workspace.updateTabDraft({ tabId: tabs[0]!, expectedWindowId: "window-1", content: "unsaved user changes" });
  workspace.createUntitledTab("window-1");
  const before = workspace.getTabSession(tabs[0]!);
  const active = workspace.getWindowProjection("window-1").activeTabId;
  markExternalWorkspaceChange(workspace, "c:/NOTES/中文 空格.md", "modified", "win32");
  expect(workspace.getTabSession(tabs[0]!)).toEqual({ ...before, externalChange: { kind: "modified" } });
  expect(workspace.getWindowProjection("window-1").activeTabId).toBe(active);
  expect(workspace.getTabSession(tabs[1]!).externalChange).toBeNull();
  expect(workspace.getTabSession(active!).externalChange).toBeNull();
});
