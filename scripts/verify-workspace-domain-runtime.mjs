import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const domain = require("@fishmark/workspace-domain");
const buffer = domain.createStringTextBuffer("FishMark");

if (buffer.toString() !== "FishMark") {
  throw new Error("workspace-domain runtime entry returned an invalid buffer");
}

const workspace = domain.createWorkspaceState();
workspace.registerWindow("window-1");
const created = workspace.createUntitledTab("window-1");
const tabId = created.activeTabId;

if (tabId === null) {
  throw new Error("workspace-domain runtime entry did not create an active tab");
}

const update = workspace.updateTabDraft({
  tabId,
  expectedWindowId: "window-1",
  content: "# FishMark\n"
});
if (update.kind !== "applied") {
  throw new Error("workspace-domain runtime entry rejected its current owner");
}
const session = workspace.getTabSession(tabId);
const projection = workspace.getWindowProjection("window-1");

if (session.revision !== 1) {
  throw new Error("workspace-domain runtime entry returned an invalid document revision");
}

if (projection.activeTabId !== tabId || projection.activeDocument?.isDirty !== true) {
  throw new Error("workspace-domain runtime entry returned an invalid active document");
}
