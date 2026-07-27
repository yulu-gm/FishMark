import { describe, expect, it } from "vitest";

import type { DiskVersion } from "./disk-version";
import { fileIdentity } from "./file-identity";
import {
  commitSavedDocument,
  createDocumentSession,
  moveDocumentSession,
  projectDocumentSession,
  replaceDocumentFromDisk,
  replaceDocumentText,
  type WorkspaceDocumentData
} from "./document-session";

const untitledDocument: WorkspaceDocumentData = {
  fileIdentity: null,
  path: null,
  name: "Untitled",
  content: "alpha",
  encoding: "utf-8"
};

const diskVersion: DiskVersion = {
  normalizedPath: "C:/notes/alpha.md",
  mtimeMs: 1_700_000_000_000,
  size: 5,
  contentHash: "sha256:alpha"
};

function createSession() {
  return createDocumentSession({
    tabId: "tab-1",
    windowId: "window-1",
    document: untitledDocument
  });
}

type DiskVersionEntryPoint = readonly [
  name: string,
  apply: (input: DiskVersion) => ReturnType<typeof createSession>
];

const diskVersionEntryPoints: readonly DiskVersionEntryPoint[] = [
  [
    "commitSavedDocument",
    (input) =>
      commitSavedDocument(createSession(), {
        capturedRevision: 0,
        document: untitledDocument,
        diskVersion: input
      })
  ],
  [
    "replaceDocumentFromDisk",
    (input) =>
      replaceDocumentFromDisk(
        createSession(),
        {
          fileIdentity: fileIdentity("file:c:/notes/alpha.md"),
          path: "C:/notes/alpha.md",
          name: "alpha.md",
          content: "alpha",
          encoding: "utf-8"
        },
        input
      )
  ]
];

describe("document session revisions", () => {
  it("starts a new document at a clean zero revision", () => {
    const session = createSession();

    expect(projectDocumentSession(session)).toEqual({
      tabId: "tab-1",
      windowId: "window-1",
      fileIdentity: null,
      path: null,
      name: "Untitled",
      content: "alpha",
      encoding: "utf-8",
      revision: 0,
      savedRevision: 0,
      isDirty: false,
      saveState: "idle",
      diskVersion: null
    });
    expect(session.text).toBe(session.savedText);
  });

  it("preserves session identity for an identical text update", () => {
    const session = createSession();

    expect(replaceDocumentText(session, "alpha")).toBe(session);
  });

  it("advances exactly one revision for a changed text update", () => {
    const changed = replaceDocumentText(createSession(), "beta");

    expect(projectDocumentSession(changed)).toMatchObject({
      content: "beta",
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
  });

  it("marks a manual restore to saved text clean at the new revision", () => {
    const changed = replaceDocumentText(createSession(), "beta");
    const restored = replaceDocumentText(changed, "alpha");

    expect(projectDocumentSession(restored)).toMatchObject({
      content: "alpha",
      revision: 2,
      savedRevision: 2,
      isDirty: false
    });
  });
});

describe("document session save checkpoints", () => {
  it("commits a normal save without replacing the current text or revision", () => {
    const changed = replaceDocumentText(createSession(), "beta");
    const savedDocument: WorkspaceDocumentData = {
      ...untitledDocument,
      content: "beta"
    };

    const saved = commitSavedDocument(changed, {
      capturedRevision: 1,
      document: savedDocument,
      diskVersion
    });

    expect(projectDocumentSession(saved)).toMatchObject({
      path: null,
      name: "Untitled",
      content: "beta",
      revision: 1,
      savedRevision: 1,
      isDirty: false,
      saveState: "idle",
      diskVersion
    });
    expect(saved.text).toBe(changed.text);
    expect(saved.savedText.toString()).toBe("beta");
  });

  it("commits Save As metadata", () => {
    const saved = commitSavedDocument(createSession(), {
      capturedRevision: 0,
      document: {
        fileIdentity: fileIdentity("file:c:/notes/alpha.md"),
        path: "C:/notes/alpha.md",
        name: "alpha.md",
        content: "alpha",
        encoding: "utf-8"
      },
      diskVersion
    });

    expect(projectDocumentSession(saved)).toMatchObject({
      path: "C:/notes/alpha.md",
      name: "alpha.md",
      content: "alpha",
      revision: 0,
      savedRevision: 0,
      isDirty: false,
      diskVersion
    });
  });

  it("keeps a newer draft dirty after an older captured revision is saved", () => {
    const captured = replaceDocumentText(createSession(), "captured");
    const newer = replaceDocumentText(captured, "newer draft");
    const saved = commitSavedDocument(newer, {
      capturedRevision: 1,
      document: { ...untitledDocument, content: "captured" },
      diskVersion
    });

    expect(projectDocumentSession(saved)).toMatchObject({
      content: "newer draft",
      revision: 2,
      savedRevision: 1,
      isDirty: true
    });
    expect(saved.text).toBe(newer.text);
    expect(saved.savedText.toString()).toBe("captured");
  });

  it("marks the current revision clean when newer edits equal the saved result", () => {
    const captured = replaceDocumentText(createSession(), "captured");
    const newerMatchingResult = replaceDocumentText(captured, "normalized");
    const saved = commitSavedDocument(newerMatchingResult, {
      capturedRevision: 1,
      document: { ...untitledDocument, content: "normalized" },
      diskVersion
    });

    expect(projectDocumentSession(saved)).toMatchObject({
      content: "normalized",
      revision: 2,
      savedRevision: 2,
      isDirty: false
    });
  });

  it("rejects saved content that does not match the current captured revision", () => {
    const current = replaceDocumentText(createSession(), "current text");

    expect(() =>
      commitSavedDocument(current, {
        capturedRevision: 1,
        document: { ...untitledDocument, content: "different durable text" },
        diskVersion
      })
    ).toThrow("Saved document content must match the captured document revision.");
    expect(projectDocumentSession(current)).toMatchObject({
      content: "current text",
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid captured revision %#",
    (capturedRevision) => {
      expect(() =>
        commitSavedDocument(createSession(), {
          capturedRevision,
          document: untitledDocument,
          diskVersion: null
        })
      ).toThrow("Captured revision must be a non-negative safe integer.");
    }
  );

  it("rejects a captured revision newer than the current revision", () => {
    expect(() =>
      commitSavedDocument(createSession(), {
        capturedRevision: 1,
        document: untitledDocument,
        diskVersion: null
      })
    ).toThrow("Captured revision cannot be newer than the document revision.");
  });
});

describe("document session disk replacement and movement", () => {
  it("replaces changed text from disk with one new clean revision", () => {
    const dirty = replaceDocumentText(createSession(), "draft");
    const reloaded = replaceDocumentFromDisk(
      dirty,
      {
        fileIdentity: fileIdentity("file:c:/notes/reloaded.md"),
        path: "C:/notes/reloaded.md",
        name: "reloaded.md",
        content: "disk content",
        encoding: "utf-8"
      },
      diskVersion
    );

    expect(projectDocumentSession(reloaded)).toMatchObject({
      path: "C:/notes/reloaded.md",
      name: "reloaded.md",
      content: "disk content",
      revision: 2,
      savedRevision: 2,
      isDirty: false,
      saveState: "idle",
      diskVersion
    });
  });

  it("refreshes metadata and checkpoint without advancing equal disk text", () => {
    const dirtyThenRestored = replaceDocumentText(
      replaceDocumentText(createSession(), "draft"),
      "alpha"
    );
    const reloaded = replaceDocumentFromDisk(
      dirtyThenRestored,
      {
        fileIdentity: fileIdentity("file:c:/notes/alpha.md"),
        path: "C:/notes/alpha.md",
        name: "alpha.md",
        content: "alpha",
        encoding: "utf-8"
      },
      diskVersion
    );

    expect(projectDocumentSession(reloaded)).toMatchObject({
      path: "C:/notes/alpha.md",
      name: "alpha.md",
      content: "alpha",
      revision: 2,
      savedRevision: 2,
      isDirty: false,
      diskVersion
    });
    expect(reloaded.text).toBe(dirtyThenRestored.text);
    expect(reloaded.savedText).toBe(reloaded.text);
  });

  it("marks dirty equal disk text clean without advancing the revision", () => {
    const opened = createDocumentSession({
      tabId: "tab-1",
      windowId: "window-1",
      document: {
        fileIdentity: fileIdentity("file:c:/notes/saved.md"),
        path: "C:/notes/saved.md",
        name: "saved.md",
        content: "# Saved\n",
        encoding: "utf-8"
      },
      diskVersion
    });
    const dirty = replaceDocumentText(opened, "# Current dirty\n");
    const incomingDiskVersion: DiskVersion = {
      normalizedPath: "C:/notes/current-dirty.md",
      mtimeMs: 1_700_000_000_100,
      size: "# Current dirty\n".length,
      contentHash: "sha256:current-dirty"
    };

    const reloaded = replaceDocumentFromDisk(
      dirty,
      {
        fileIdentity: fileIdentity("file:c:/notes/saved.md"),
        path: "C:/notes/current-dirty.md",
        name: "current-dirty.md",
        content: "# Current dirty\n",
        encoding: "utf-8"
      },
      incomingDiskVersion
    );

    expect(projectDocumentSession(reloaded)).toMatchObject({
      path: "C:/notes/current-dirty.md",
      name: "current-dirty.md",
      content: "# Current dirty\n",
      revision: 1,
      savedRevision: 1,
      isDirty: false,
      diskVersion: incomingDiskVersion
    });
    expect(reloaded.text).toBe(dirty.text);
    expect(reloaded.savedText).toBe(reloaded.text);
  });

  it("moves only the owning window", () => {
    const dirty = replaceDocumentText(createSession(), "draft");
    const moved = moveDocumentSession(dirty, "window-2");

    expect(projectDocumentSession(moved)).toMatchObject({
      windowId: "window-2",
      content: "draft",
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
    expect(moved.text).toBe(dirty.text);
    expect(moved.savedText).toBe(dirty.savedText);
    expect(moveDocumentSession(moved, "window-2")).toBe(moved);
  });
});

describe("document session immutability", () => {
  it("preserves disk versions while isolating input and projection mutation", () => {
    const mutableInput = { ...diskVersion };
    const session = createDocumentSession({
      tabId: "tab-1",
      windowId: "window-1",
      document: untitledDocument,
      diskVersion: mutableInput
    });

    mutableInput.contentHash = "mutated-input";
    const firstProjection = projectDocumentSession(session);
    const mutableProjection = firstProjection as unknown as {
      path: string | null;
      diskVersion: { contentHash: string } | null;
    };
    try {
      mutableProjection.path = "C:/mutated.md";
    } catch {
      // Frozen projections may reject mutation; either behavior must protect canonical state.
    }
    try {
      if (mutableProjection.diskVersion) {
        mutableProjection.diskVersion.contentHash = "mutated-projection";
      }
    } catch {
      // Disk-version snapshots may independently reject mutation.
    }

    const nextProjection = projectDocumentSession(session);
    expect(nextProjection).not.toBe(firstProjection);
    expect(nextProjection.path).toBeNull();
    expect(nextProjection.diskVersion).toEqual(diskVersion);
    expect(nextProjection.diskVersion).not.toBe(mutableInput);
    expect(nextProjection.diskVersion).not.toBe(firstProjection.diskVersion);
  });

  it.each(diskVersionEntryPoints)(
    "%s defensively copies and freezes disk versions",
    (_name, applyEntryPoint) => {
      const mutableInput = { ...diskVersion };
      const session = applyEntryPoint(mutableInput);

      expect(session.diskVersion).not.toBe(mutableInput);
      expect(Object.isFrozen(session.diskVersion)).toBe(true);
      mutableInput.contentHash = "mutated-input";

      const firstProjection = projectDocumentSession(session);
      const mutableProjection = firstProjection as unknown as {
        diskVersion: { contentHash: string } | null;
      };
      try {
        if (mutableProjection.diskVersion) {
          mutableProjection.diskVersion.contentHash = "mutated-projection";
        }
      } catch {
        // Frozen disk-version projections reject mutation.
      }

      const nextProjection = projectDocumentSession(session);
      expect(nextProjection.diskVersion).toEqual(diskVersion);
      expect(nextProjection.diskVersion).not.toBe(mutableInput);
      expect(nextProjection.diskVersion).not.toBe(firstProjection.diskVersion);
      expect(Object.isFrozen(nextProjection.diskVersion)).toBe(true);
    }
  );

  it("does not store redundant dirty or legacy content fields", () => {
    const session = createSession();

    expect(session).not.toHaveProperty("isDirty");
    expect(session).not.toHaveProperty("lastSavedContent");
    expect(session).not.toHaveProperty("draftContent");
    expect(projectDocumentSession(session).isDirty).toBe(
      session.revision !== session.savedRevision
    );
  });
});
