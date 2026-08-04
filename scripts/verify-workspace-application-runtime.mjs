import assert from "node:assert/strict";

const application = await import("@fishmark/workspace-application");

assert.equal(typeof application.createWorkspaceApplication, "function");
assert.equal(typeof application.createApplyDocumentEdits, "function");
assert.equal(typeof application.createFlushDocumentEdits, "function");
assert.equal(typeof application.createUpdateDocumentDraft, "function");
assert.equal(typeof application.createSaveDocument, "function");
assert.equal(typeof application.createCloseWorkspace, "function");
assert.equal(typeof application.createWorkspaceOpen, "function");
assert.equal(typeof application.createWorkspaceReload, "function");
assert.equal(typeof application.createWorkspaceTabReorder, "function");
assert.equal(typeof application.createWorkspaceTabTransfer, "function");
assert.equal(typeof application.createWorkspaceDetach, "function");
assert.equal(typeof application.createWorkspaceOwnerTabActivation, "function");
assert.equal(typeof application.createWorkspaceWindowClose, "function");
