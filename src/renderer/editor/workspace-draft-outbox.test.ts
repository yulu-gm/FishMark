import { describe, expect, it } from "vitest";

import { WorkspaceDraftOutbox } from "./workspace-draft-outbox";

describe("WorkspaceDraftOutbox", () => {
  it("keeps drafts isolated by tab", () => {
    const outbox = new WorkspaceDraftOutbox();

    outbox.set("tab-1", "first");
    outbox.set("tab-2", "second");

    expect(outbox.get("tab-1")).toBe("first");
    expect(outbox.get("tab-2")).toBe("second");
  });

  it("does not let an old acknowledgement clear a newer draft", () => {
    const outbox = new WorkspaceDraftOutbox();
    outbox.set("tab-1", "old");
    outbox.set("tab-1", "new");

    expect(outbox.acknowledge("tab-1", "old")).toBe(false);
    expect(outbox.get("tab-1")).toBe("new");
    expect(outbox.acknowledge("tab-1", "new")).toBe(true);
    expect(outbox.has("tab-1")).toBe(false);
  });
});
