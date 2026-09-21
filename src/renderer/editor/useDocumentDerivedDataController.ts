import { useCallback, useEffect, useRef, useState } from "react";

import type { EditorDerivedSnapshot } from "@fishmark/editor-model";
import {
  getDocumentMetrics as getDefaultDocumentMetrics,
  type DocumentMetrics
} from "../document-metrics";
import {
  deriveOutlineItems as deriveDefaultOutlineItems,
  type OutlineItem
} from "../outline";

export const DOCUMENT_DERIVED_DATA_UPDATE_DELAY_MS = 120;

export function useDocumentDerivedDataController(input: {
  deriveOutlineItems?: (snapshot: EditorDerivedSnapshot) => OutlineItem[];
  getDocumentMetrics?: (snapshot: EditorDerivedSnapshot) => DocumentMetrics;
} = {}) {
  const deriveOutlineItems = input.deriveOutlineItems ?? deriveDefaultOutlineItems;
  const getDocumentMetrics = input.getDocumentMetrics ?? getDefaultDocumentMetrics;
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([]);
  const [currentDocumentMetrics, setCurrentDocumentMetrics] = useState<DocumentMetrics | null>(null);
  const pendingSnapshotRef = useRef<EditorDerivedSnapshot | null>(null);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingUpdate = useCallback((): void => {
    if (updateTimerRef.current === null) {
      return;
    }

    clearTimeout(updateTimerRef.current);
    updateTimerRef.current = null;
  }, []);

  const applyDocumentDerivedDataNow = useCallback(
    (snapshot: EditorDerivedSnapshot | null): void => {
      clearPendingUpdate();
      pendingSnapshotRef.current = null;

      if (snapshot === null) {
        setOutlineItems([]);
        setCurrentDocumentMetrics(null);
        return;
      }

      setOutlineItems(deriveOutlineItems(snapshot));
      setCurrentDocumentMetrics(getDocumentMetrics(snapshot));
    },
    [clearPendingUpdate, deriveOutlineItems, getDocumentMetrics]
  );

  const flushPendingDocumentDerivedData = useCallback((): void => {
    const snapshot = pendingSnapshotRef.current;
    updateTimerRef.current = null;
    pendingSnapshotRef.current = null;

    if (snapshot === null) {
      return;
    }

    setOutlineItems(deriveOutlineItems(snapshot));
    setCurrentDocumentMetrics(getDocumentMetrics(snapshot));
  }, [deriveOutlineItems, getDocumentMetrics]);

  const scheduleDocumentDerivedDataUpdate = useCallback(
    (snapshot: EditorDerivedSnapshot): void => {
      pendingSnapshotRef.current = snapshot;
      clearPendingUpdate();
      updateTimerRef.current = setTimeout(
        flushPendingDocumentDerivedData,
        DOCUMENT_DERIVED_DATA_UPDATE_DELAY_MS
      );
    },
    [clearPendingUpdate, flushPendingDocumentDerivedData]
  );

  useEffect(() => clearPendingUpdate, [clearPendingUpdate]);

  return {
    outlineItems,
    currentDocumentMetrics,
    applyDocumentDerivedDataNow,
    scheduleDocumentDerivedDataUpdate
  };
}
