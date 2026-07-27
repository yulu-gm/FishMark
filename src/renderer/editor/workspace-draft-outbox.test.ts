import { describe, expect, it } from "vitest";

import { WorkspaceDraftOutbox } from "./workspace-draft-outbox";

type DraftEntry = Readonly<{
  tabId: string;
  content: string;
  generation: number;
}>;

type LifecycleOutbox = WorkspaceDraftOutbox & {
  set: (tabId: string, content: string) => DraftEntry;
  entries: () => readonly DraftEntry[];
  acknowledge: (entry: DraftEntry) => boolean;
  discardThrough: (tabId: string, generation: number) => boolean;
  remove: (tabId: string) => boolean;
};

function createLifecycleOutbox(): LifecycleOutbox {
  return new WorkspaceDraftOutbox() as LifecycleOutbox;
}

describe("WorkspaceDraftOutbox", () => {
  it("keeps drafts isolated by tab", () => {
    const outbox = new WorkspaceDraftOutbox();

    outbox.set("tab-1", "first");
    outbox.set("tab-2", "second");

    expect(outbox.get("tab-1")).toBe("first");
    expect(outbox.get("tab-2")).toBe("second");
  });

  it("does not let an old acknowledgement clear a newer draft", () => {
    const outbox = createLifecycleOutbox();
    const oldEntry = outbox.set("tab-1", "same");
    const newEntry = outbox.set("tab-1", "same");

    expect(outbox.acknowledge(oldEntry)).toBe(false);
    expect(outbox.get("tab-1")).toBe("same");
    expect(outbox.acknowledge(newEntry)).toBe(true);
    expect(outbox.has("tab-1")).toBe(false);
  });

  it("enumerates and removes drafts by tab lifecycle", () => {
    const outbox = createLifecycleOutbox();
    const first = outbox.set("tab-1", "first");
    const second = outbox.set("tab-2", "second");

    expect(outbox.entries()).toEqual([first, second]);
    expect(outbox.remove("tab-1")).toBe(true);
    expect(outbox.entries()).toEqual([second]);
    expect(outbox.remove("tab-1")).toBe(false);
  });

  it("discards only drafts at or before a reload generation cutoff", () => {
    const outbox = createLifecycleOutbox();
    const beforeReload = outbox.set("tab-1", "before reload");
    const afterReload = outbox.set("tab-1", "after reload");

    expect(outbox.discardThrough("tab-1", beforeReload.generation)).toBe(false);
    expect(outbox.entries()).toEqual([afterReload]);
    expect(outbox.discardThrough("tab-1", afterReload.generation)).toBe(true);
    expect(outbox.has("tab-1")).toBe(false);
  });
});
