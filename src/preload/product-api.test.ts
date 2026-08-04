import { describe, expect, it, vi } from "vitest";

import {
  APPLY_DOCUMENT_EDITS_CHANNEL,
  FLUSH_DOCUMENT_EDITS_CHANNEL
} from "../shared/document-edit";
import { DOCUMENT_PROJECTION_EVENT } from "../shared/document-projection";
import { createProductApi, type ProductIpcPort } from "./product-api";

function createPorts() {
  const invoke = vi.fn(async () => ({ kind: "applied" }));
  return {
    ipc: {
      invoke: invoke as ProductIpcPort["invoke"],
      on: vi.fn(),
      off: vi.fn()
    },
    invoke,
    filePath: { getPathForFile: vi.fn(() => "D:/drop.md") },
    runtime: {
      platform: "win32" as NodeJS.Platform,
      argv: ["electron", "--fishmark-runtime-mode=editor"]
    }
  };
}

describe("createProductApi", () => {
  it("builds the complete product bridge including revisioned edit methods", () => {
    const ports = createPorts();
    const api = createProductApi(ports);
    expect(api).toMatchObject({
      platform: "win32",
      runtimeMode: "editor",
      applyDocumentEdits: expect.any(Function),
      flushDocumentEdits: expect.any(Function),
      onDocumentProjection: expect.any(Function),
      updateWorkspaceTabDraft: expect.any(Function),
      saveMarkdownFile: expect.any(Function),
      getPreferences: expect.any(Function)
    });
  });

  it("invokes the exact apply and flush channels", async () => {
    const ports = createPorts();
    const api = createProductApi(ports);
    const apply = {
      tabId: "tab-1", clientId: "client-a", clientSequence: 1,
      baseRevision: 0, changes: [{ from: 0, to: 0, insert: "x" }]
    };
    const flush = { tabId: "tab-1", clientId: "client-a", throughSequence: 1 };
    await api.applyDocumentEdits(apply);
    await api.flushDocumentEdits(flush);
    expect(ports.invoke).toHaveBeenCalledWith(APPLY_DOCUMENT_EDITS_CHANNEL, apply);
    expect(ports.invoke).toHaveBeenCalledWith(FLUSH_DOCUMENT_EDITS_CHANNEL, flush);
  });

  it("detaches the exact document projection callback registered with on", () => {
    const ports = createPorts();
    const api = createProductApi(ports);
    const listener = vi.fn();
    const detach = api.onDocumentProjection(listener);
    const registered = ports.ipc.on.mock.calls[0]?.[1];

    expect(registered).toBeTypeOf("function");
    registered({}, {
      windowId: "window-1",
      projection: { tabId: "tab-1", revision: 1, savedRevision: 0, isDirty: true }
    });
    expect(listener).toHaveBeenCalledWith({
      windowId: "window-1",
      projection: { tabId: "tab-1", revision: 1, savedRevision: 0, isDirty: true }
    });

    detach();
    expect(ports.ipc.off).toHaveBeenCalledWith(DOCUMENT_PROJECTION_EVENT, registered);
  });
});
