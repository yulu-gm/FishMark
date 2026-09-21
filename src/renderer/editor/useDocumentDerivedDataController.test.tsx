// @vitest-environment jsdom

import { act, createElement, createRef, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEditorDerivedSnapshotFromCache } from "@fishmark/editor-model";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import {
  DOCUMENT_DERIVED_DATA_UPDATE_DELAY_MS,
  useDocumentDerivedDataController
} from "./useDocumentDerivedDataController";

type ControllerValue = ReturnType<typeof useDocumentDerivedDataController>;

const snapshot = (source: string) =>
  createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

function renderController(
  options: Parameters<typeof useDocumentDerivedDataController>[0]
): {
  latestRef: { current: ControllerValue | null };
  root: Root;
} {
  const latestRef = createRef<ControllerValue>();
  const root = createRoot(document.createElement("div"));

  function Probe(): null {
    const controller = useDocumentDerivedDataController(options);

    useEffect(() => {
      latestRef.current = controller;
    }, [controller]);

    return null;
  }

  act(() => {
    root.render(createElement(Probe));
  });

  return { latestRef, root };
}

describe("useDocumentDerivedDataController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies an opened editor snapshot immediately without reparsing source", () => {
    const deriveOutlineItems = vi.fn((value: ReturnType<typeof snapshot>) =>
      value.outlineHeadings.map((heading) => ({ ...heading }))
    );
    const getDocumentMetrics = vi.fn((value: ReturnType<typeof snapshot>) => value.documentMetrics);
    const { latestRef, root } = renderController({
      deriveOutlineItems,
      getDocumentMetrics
    });
    const current = snapshot("# Title");

    act(() => {
      latestRef.current?.applyDocumentDerivedDataNow(current);
    });

    expect(deriveOutlineItems).toHaveBeenCalledWith(current);
    expect(getDocumentMetrics).toHaveBeenCalledWith(current);
    expect(latestRef.current?.outlineItems[0]?.label).toBe("Title");
    expect(latestRef.current?.currentDocumentMetrics?.meaningfulCharacterCount).toBe(5);

    act(() => {
      root.unmount();
    });
  });

  it("defers presentation refresh and only consumes the latest revision snapshot", () => {
    const deriveOutlineItems = vi.fn((value: ReturnType<typeof snapshot>) =>
      value.outlineHeadings.map((heading) => ({ ...heading }))
    );
    const getDocumentMetrics = vi.fn((value: ReturnType<typeof snapshot>) => value.documentMetrics);
    const { latestRef, root } = renderController({
      deriveOutlineItems,
      getDocumentMetrics
    });
    const first = snapshot("# First");
    const second = snapshot("# Second");

    act(() => {
      latestRef.current?.scheduleDocumentDerivedDataUpdate(first);
      latestRef.current?.scheduleDocumentDerivedDataUpdate(second);
    });

    expect(deriveOutlineItems).not.toHaveBeenCalled();
    expect(getDocumentMetrics).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(DOCUMENT_DERIVED_DATA_UPDATE_DELAY_MS - 1);
    });

    expect(deriveOutlineItems).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(deriveOutlineItems).toHaveBeenCalledTimes(1);
    expect(deriveOutlineItems).toHaveBeenCalledWith(second);
    expect(getDocumentMetrics).toHaveBeenCalledTimes(1);
    expect(getDocumentMetrics).toHaveBeenCalledWith(second);
    expect(latestRef.current?.outlineItems[0]?.label).toBe("Second");
    expect(latestRef.current?.currentDocumentMetrics?.meaningfulCharacterCount).toBe(6);

    act(() => {
      root.unmount();
    });
  });
});
