import { useCallback, useLayoutEffect, useRef, useState } from "react";

import type { EditorDerivedSnapshot } from "@fishmark/editor-model";
import {
  getDocumentMetrics as getDefaultDocumentMetrics,
  type DocumentMetrics
} from "../document-metrics";
import {
  deriveOutlineItems as deriveDefaultOutlineItems,
  type OutlineItem
} from "../outline";
import { isSameEditorLoadIdentity, type EditorLoadIdentity } from "./editor-load-identity";

export const DOCUMENT_DERIVED_DATA_UPDATE_DELAY_MS = 120;

export function useDocumentDerivedDataController(input: {
  documentIdentity: EditorLoadIdentity | null;
  deriveOutlineItems?: (snapshot: EditorDerivedSnapshot) => OutlineItem[];
  getDocumentMetrics?: (snapshot: EditorDerivedSnapshot) => DocumentMetrics;
}) {
  const { documentIdentity } = input;
  const deriveOutlineItems = input.deriveOutlineItems ?? deriveDefaultOutlineItems;
  const getDocumentMetrics = input.getDocumentMetrics ?? getDefaultDocumentMetrics;
  const [data, setData] = useState<{
    identity: EditorLoadIdentity | null;
    outlineItems: OutlineItem[];
    metrics: DocumentMetrics | null;
  }>({ identity: null, outlineItems: [], metrics: null });
  const currentIdentityRef = useRef(documentIdentity);
  const appliedIdentityRef = useRef<EditorLoadIdentity | null>(null);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotRef = useRef<EditorDerivedSnapshot | null>(null);

  const clearPendingUpdate = useCallback((): void => {
    if (updateTimerRef.current !== null) {
      clearTimeout(updateTimerRef.current);
      updateTimerRef.current = null;
    }
  }, []);

  const tabId = documentIdentity?.tabId ?? null;
  const epoch = documentIdentity?.epoch ?? 0;
  const loadRevision = documentIdentity?.loadRevision ?? 0;
  useLayoutEffect(() => {
    // Commit the load boundary before CodeEditorView's passive effects publish.
    // Compare identity fields, not object allocations, so ordinary rerenders
    // cannot cancel a same-document presentation update.
    currentIdentityRef.current = tabId === null ? null : { tabId, epoch, loadRevision };
    return () => {
      currentIdentityRef.current = null;
      appliedIdentityRef.current = null;
      lastSnapshotRef.current = null;
      clearPendingUpdate();
    };
  }, [tabId, epoch, loadRevision, clearPendingUpdate]);

  const applyDocumentDerivedDataNow = useCallback(
    (snapshot: EditorDerivedSnapshot | null): void => {
      const current = currentIdentityRef.current;
      if (documentIdentity === null ? current !== null :
        current === null || !isSameEditorLoadIdentity(current, documentIdentity)) {
        return;
      }
      if (snapshot !== null && documentIdentity === null) return;

      clearPendingUpdate();
      appliedIdentityRef.current = snapshot === null ? null : documentIdentity;
      lastSnapshotRef.current = snapshot;
      setData({
        identity: documentIdentity,
        outlineItems: snapshot === null ? [] : deriveOutlineItems(snapshot),
        metrics: snapshot === null ? null : getDocumentMetrics(snapshot)
      });
    },
    [clearPendingUpdate, deriveOutlineItems, documentIdentity, getDocumentMetrics]
  );

  const scheduleDocumentDerivedDataUpdate = useCallback(
    (snapshot: EditorDerivedSnapshot): void => {
      const current = currentIdentityRef.current;
      if (documentIdentity === null || current === null ||
        !isSameEditorLoadIdentity(current, documentIdentity)) return;

      if (lastSnapshotRef.current === snapshot) return;
      // A tab switch, reload or epoch rebind is a load, not a typing revision.
      const applied = appliedIdentityRef.current;
      if (applied === null || !isSameEditorLoadIdentity(applied, documentIdentity)) {
        applyDocumentDerivedDataNow(snapshot);
        return;
      }
      clearPendingUpdate();
      lastSnapshotRef.current = snapshot;
      updateTimerRef.current = setTimeout(
        () => applyDocumentDerivedDataNow(snapshot),
        DOCUMENT_DERIVED_DATA_UPDATE_DELAY_MS
      );
    },
    [applyDocumentDerivedDataNow, clearPendingUpdate, documentIdentity]
  );

  // Hide the previous document's offsets while the new editor loads. This is
  // a projection, not a parent effect that could erase a child-published snapshot.
  const isCurrentDocument = data.identity !== null && documentIdentity !== null &&
    isSameEditorLoadIdentity(data.identity, documentIdentity);
  return {
    outlineItems: isCurrentDocument ? data.outlineItems : [],
    currentDocumentMetrics: isCurrentDocument ? data.metrics : null,
    applyDocumentDerivedDataNow,
    scheduleDocumentDerivedDataUpdate
  };
}
