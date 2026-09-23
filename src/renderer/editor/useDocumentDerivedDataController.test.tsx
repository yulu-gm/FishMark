// @vitest-environment jsdom

import { act, createElement, createRef, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEditorDerivedSnapshotFromCache, type EditorDerivedSnapshot } from "@fishmark/editor-model";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import type { EditorLoadIdentity } from "./editor-load-identity";
import {
  DOCUMENT_DERIVED_DATA_UPDATE_DELAY_MS,
  useDocumentDerivedDataController
} from "./useDocumentDerivedDataController";

type ControllerValue = ReturnType<typeof useDocumentDerivedDataController>;
type ControllerInput = Parameters<typeof useDocumentDerivedDataController>[0];
const documentA: EditorLoadIdentity = { tabId: "a", epoch: 1, loadRevision: 0 };
const documentB: EditorLoadIdentity = { tabId: "b", epoch: 1, loadRevision: 0 };
const roots: Root[] = [];

const snapshot = (source: string) =>
  createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

function SnapshotPublisher(props: {
  snapshot: EditorDerivedSnapshot | undefined;
  publish: ControllerValue["scheduleDocumentDerivedDataUpdate"];
}): null {
  const { snapshot: publishedSnapshot, publish } = props;
  useEffect(() => {
    if (publishedSnapshot !== undefined) publish(publishedSnapshot);
  }, [publish, publishedSnapshot]);
  return null;
}

function renderController(options: ControllerInput) {
  const latestRef = createRef<ControllerValue>();
  const root = createRoot(document.createElement("div"));
  roots.push(root);

  function Probe(props: { options: ControllerInput; publishedSnapshot?: EditorDerivedSnapshot }) {
    const controller = useDocumentDerivedDataController(props.options);
    useEffect(() => {
      latestRef.current = controller;
    }, [controller]);
    return createElement(SnapshotPublisher, {
      snapshot: props.publishedSnapshot,
      publish: controller.scheduleDocumentDerivedDataUpdate
    });
  }

  function rerender(nextOptions: ControllerInput, publishedSnapshot?: EditorDerivedSnapshot): void {
    act(() => {
      root.render(createElement(Probe, { options: nextOptions, publishedSnapshot }));
    });
  }
  rerender(options);
  return { latestRef, root, rerender };
}

describe("useDocumentDerivedDataController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(() => {
    act(() => roots.splice(0).forEach((root) => root.unmount()));
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("applies an opened editor snapshot immediately without reparsing source", () => {
    const deriveOutlineItems = vi.fn((value: EditorDerivedSnapshot) =>
      value.outlineHeadings.map((heading) => ({ ...heading }))
    );
    const getDocumentMetrics = vi.fn((value: EditorDerivedSnapshot) => value.documentMetrics);
    const { latestRef } = renderController({
      documentIdentity: documentA,
      deriveOutlineItems,
      getDocumentMetrics
    });
    const current = snapshot("# Title");
    act(() => latestRef.current!.applyDocumentDerivedDataNow(current));
    expect(deriveOutlineItems).toHaveBeenCalledWith(current);
    expect(getDocumentMetrics).toHaveBeenCalledWith(current);
    expect(latestRef.current!.outlineItems[0]?.label).toBe("Title");
    expect(latestRef.current!.currentDocumentMetrics?.meaningfulCharacterCount).toBe(5);
  });

  it("defers same-document presentation refresh and only consumes the latest snapshot", () => {
    const deriveOutlineItems = vi.fn((value: EditorDerivedSnapshot) =>
      value.outlineHeadings.map((heading) => ({ ...heading }))
    );
    const getDocumentMetrics = vi.fn((value: EditorDerivedSnapshot) => value.documentMetrics);
    const { latestRef } = renderController({
      documentIdentity: documentA,
      deriveOutlineItems,
      getDocumentMetrics
    });
    act(() => latestRef.current!.applyDocumentDerivedDataNow(snapshot("# Initial")));
    deriveOutlineItems.mockClear();
    getDocumentMetrics.mockClear();
    const first = snapshot("# First");
    const second = snapshot("# Second");
    act(() => {
      latestRef.current!.scheduleDocumentDerivedDataUpdate(first);
      latestRef.current!.scheduleDocumentDerivedDataUpdate(second);
    });
    expect(deriveOutlineItems).not.toHaveBeenCalled();
    expect(getDocumentMetrics).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(DOCUMENT_DERIVED_DATA_UPDATE_DELAY_MS - 1));
    expect(deriveOutlineItems).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(deriveOutlineItems).toHaveBeenCalledTimes(1);
    expect(deriveOutlineItems).toHaveBeenCalledWith(second);
    expect(getDocumentMetrics).toHaveBeenCalledTimes(1);
    expect(getDocumentMetrics).toHaveBeenCalledWith(second);
    expect(latestRef.current!.outlineItems[0]?.label).toBe("Second");
    expect(latestRef.current!.currentDocumentMetrics?.meaningfulCharacterCount).toBe(6);
  });

  it.each([
    ["tab switch", documentB],
    ["epoch rebind", { ...documentA, epoch: 2 }],
    ["reload", { ...documentA, loadRevision: 1 }]
  ] as const)("replaces derived data immediately on %s and rejects stale callbacks", (_name, identity) => {
    const { latestRef, rerender } = renderController({ documentIdentity: documentA });
    const alpha = snapshot("# Alpha");
    const beta = snapshot("# Beta");
    act(() => latestRef.current!.applyDocumentDerivedDataNow(alpha));
    const stale = latestRef.current!;
    act(() => stale.scheduleDocumentDerivedDataUpdate(snapshot("# Stale pending")));

    rerender({ documentIdentity: identity });
    expect(latestRef.current!.outlineItems).toEqual([]);
    expect(latestRef.current!.currentDocumentMetrics).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      stale.applyDocumentDerivedDataNow(alpha);
      stale.scheduleDocumentDerivedDataUpdate(alpha);
      stale.applyDocumentDerivedDataNow(null);
    });
    expect(latestRef.current!.outlineItems).toEqual([]);
    act(() => latestRef.current!.scheduleDocumentDerivedDataUpdate(beta));
    expect(latestRef.current!.outlineItems[0]?.label).toBe("Beta");
    expect(latestRef.current!.currentDocumentMetrics?.meaningfulCharacterCount).toBe(4);
    act(() => vi.advanceTimersByTime(DOCUMENT_DERIVED_DATA_UPDATE_DELAY_MS));
    expect(latestRef.current!.outlineItems[0]?.label).toBe("Beta");
  });

  it("preserves a new child-published snapshot across parent load effects", () => {
    const { latestRef, rerender } = renderController({ documentIdentity: documentA });
    act(() => latestRef.current!.applyDocumentDerivedDataNow(snapshot("# Alpha")));
    act(() => latestRef.current!.scheduleDocumentDerivedDataUpdate(snapshot("# Pending alpha")));
    rerender({ documentIdentity: documentB }, snapshot("# Beta"));
    expect(latestRef.current!.outlineItems[0]?.label).toBe("Beta");
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(DOCUMENT_DERIVED_DATA_UPDATE_DELAY_MS));
    expect(latestRef.current!.outlineItems[0]?.label).toBe("Beta");
  });

  it("does not cancel a pending update when an equivalent identity object is allocated", () => {
    const { latestRef, rerender } = renderController({ documentIdentity: documentA });
    act(() => latestRef.current!.applyDocumentDerivedDataNow(snapshot("# Initial")));
    act(() => latestRef.current!.scheduleDocumentDerivedDataUpdate(snapshot("# Updated")));
    rerender({ documentIdentity: { ...documentA } });
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(DOCUMENT_DERIVED_DATA_UPDATE_DELAY_MS));
    expect(latestRef.current!.outlineItems[0]?.label).toBe("Updated");
  });

  it("does not postpone an edit's debounce on selection-only snapshot publication", () => {
    const { latestRef } = renderController({ documentIdentity: documentA });
    const initial = snapshot("# Initial");
    const updated = snapshot("# Updated");
    act(() => latestRef.current!.scheduleDocumentDerivedDataUpdate(initial));
    act(() => latestRef.current!.scheduleDocumentDerivedDataUpdate(updated));
    act(() => vi.advanceTimersByTime(100));
    act(() => latestRef.current!.scheduleDocumentDerivedDataUpdate(updated));
    act(() => vi.advanceTimersByTime(20));
    expect(latestRef.current!.outlineItems[0]?.label).toBe("Updated");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("republishes the same snapshot immediately after an epoch-only rebind", () => {
    const { latestRef, rerender } = renderController({ documentIdentity: documentA });
    const current = snapshot("# Retained");
    act(() => latestRef.current!.scheduleDocumentDerivedDataUpdate(current));
    rerender({ documentIdentity: { ...documentA, epoch: 2 } });
    act(() => latestRef.current!.scheduleDocumentDerivedDataUpdate(current));
    expect(latestRef.current!.outlineItems[0]?.label).toBe("Retained");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears visible data and pending updates when the last document closes", () => {
    const { latestRef, rerender } = renderController({ documentIdentity: documentA });
    act(() => latestRef.current!.applyDocumentDerivedDataNow(snapshot("# Alpha")));
    const stale = latestRef.current!;
    act(() => stale.scheduleDocumentDerivedDataUpdate(snapshot("# Pending")));
    rerender({ documentIdentity: null });
    act(() => stale.scheduleDocumentDerivedDataUpdate(snapshot("# Too late")));
    expect(vi.getTimerCount()).toBe(0);
    expect(latestRef.current!.outlineItems).toEqual([]);
    expect(latestRef.current!.currentDocumentMetrics).toBeNull();
  });

  it("cancels timers and rejects late publication after unmount", () => {
    const deriveOutlineItems = vi.fn((value: EditorDerivedSnapshot) =>
      value.outlineHeadings.map((heading) => ({ ...heading }))
    );
    const { latestRef, root } = renderController({ documentIdentity: documentA, deriveOutlineItems });
    act(() => latestRef.current!.applyDocumentDerivedDataNow(snapshot("# Alpha")));
    const stale = latestRef.current!;
    act(() => stale.scheduleDocumentDerivedDataUpdate(snapshot("# Pending")));
    act(() => root.unmount());
    roots.splice(roots.indexOf(root), 1);
    deriveOutlineItems.mockClear();
    act(() => {
      stale.scheduleDocumentDerivedDataUpdate(snapshot("# Too late"));
      stale.applyDocumentDerivedDataNow(snapshot("# Too late"));
      vi.advanceTimersByTime(DOCUMENT_DERIVED_DATA_UPDATE_DELAY_MS);
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(deriveOutlineItems).not.toHaveBeenCalled();
  });
});
