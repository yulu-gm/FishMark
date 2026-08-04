import { describe, expect, expectTypeOf, it } from "vitest";

import {
  DOCUMENT_PROJECTION_EVENT,
  type DocumentProjectionEvent
} from "./document-projection";

describe("document projection shared contract", () => {
  it("contains revision metadata and no canonical document content", () => {
    const event: DocumentProjectionEvent = {
      windowId: "window-1",
      projection: {
        tabId: "tab-1",
        revision: 2,
        savedRevision: 1,
        isDirty: true
      }
    };
    expect(DOCUMENT_PROJECTION_EVENT).toBe("fishmark:document-projection");
    expect(structuredClone(event)).toEqual(event);
    expect(event.projection).not.toHaveProperty("content");
    expectTypeOf(event.projection).not.toHaveProperty("content");
  });
});
