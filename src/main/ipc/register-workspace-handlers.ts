import type {
  ApplyDocumentEditsInput as ApplicationApplyDocumentEditsInput,
  ApplyDocumentEditsResult as ApplicationApplyDocumentEditsResult,
  DocumentEditAuthorization,
  FlushDocumentEditsInput as ApplicationFlushDocumentEditsInput,
  FlushDocumentEditsResult as ApplicationFlushDocumentEditsResult
} from "@fishmark/workspace-application";

import {
  APPLY_DOCUMENT_EDITS_CHANNEL,
  DOCUMENT_EDIT_ERROR_MESSAGES,
  FLUSH_DOCUMENT_EDITS_CHANNEL,
  decodeApplyDocumentEditsInput,
  decodeFlushDocumentEditsInput,
  type ApplyDocumentEditsResult,
  type DocumentEditErrorCode,
  type FlushDocumentEditsResult
} from "../../shared/document-edit";
import {
  DOCUMENT_PROJECTION_EVENT,
  type DocumentProjectionEvent
} from "../../shared/document-projection";

type Handler<TSender> = (
  event: { readonly sender: TSender },
  input: unknown
) => Promise<unknown>;

export interface RegisterWorkspaceHandlersInput<TSender> {
  readonly register: (channel: string, handler: Handler<TSender>) => void;
  readonly ensureWindow: (sender: TSender) => Promise<string>;
  readonly isCurrentSender: (sender: TSender, windowId: string) => boolean;
  readonly application: {
    applyDocumentEdits(
      input: ApplicationApplyDocumentEditsInput,
      authorize: DocumentEditAuthorization
    ): Promise<ApplicationApplyDocumentEditsResult>;
    flushDocumentEdits(
      input: ApplicationFlushDocumentEditsInput,
      authorize: DocumentEditAuthorization
    ): Promise<ApplicationFlushDocumentEditsResult>;
  };
  readonly publish: (
    sender: TSender,
    channel: string,
    payload: DocumentProjectionEvent
  ) => void;
}

export function registerWorkspaceHandlers<TSender>(
  dependencies: RegisterWorkspaceHandlersInput<TSender>
): void {
  dependencies.register(APPLY_DOCUMENT_EDITS_CHANNEL, async (event, rawInput) => {
    const windowId = await dependencies.ensureWindow(event.sender);
    requireCurrentSender(dependencies, event.sender, windowId);
    const decoded = decodeApplyDocumentEditsInput(rawInput);
    if (!decoded.ok) {
      return errorResult(decoded.errorCode ?? "invalid-request");
    }

    let result: ApplicationApplyDocumentEditsResult;
    try {
      result = await dependencies.application.applyDocumentEdits({
        ...decoded.value,
        expectedWindowId: windowId
      }, () => requireCurrentSender(dependencies, event.sender, windowId));
    } catch {
      requireCurrentSender(dependencies, event.sender, windowId);
      return errorResult("internal-error");
    }
    requireCurrentSender(dependencies, event.sender, windowId);

    return mapApplyResult(result, windowId, (eventPayload) => {
      requireCurrentSender(dependencies, event.sender, windowId);
      dependencies.publish(event.sender, DOCUMENT_PROJECTION_EVENT, eventPayload);
    });
  });

  dependencies.register(FLUSH_DOCUMENT_EDITS_CHANNEL, async (event, rawInput) => {
    const windowId = await dependencies.ensureWindow(event.sender);
    requireCurrentSender(dependencies, event.sender, windowId);
    const decoded = decodeFlushDocumentEditsInput(rawInput);
    if (!decoded.ok) {
      return errorResult(decoded.errorCode ?? "invalid-request");
    }

    let result: ApplicationFlushDocumentEditsResult;
    try {
      result = await dependencies.application.flushDocumentEdits({
        ...decoded.value,
        expectedWindowId: windowId
      }, () => requireCurrentSender(dependencies, event.sender, windowId));
    } catch {
      requireCurrentSender(dependencies, event.sender, windowId);
      return errorResult("internal-error");
    }
    requireCurrentSender(dependencies, event.sender, windowId);
    return mapFlushResult(result);
  });
}

function mapApplyResult(
  result: ApplicationApplyDocumentEditsResult,
  windowId: string,
  publish: (event: DocumentProjectionEvent) => void
): ApplyDocumentEditsResult {
  switch (result.kind) {
    case "applied": {
      const event = {
        windowId,
        projection: result.projection
      } satisfies DocumentProjectionEvent;
      publish(event);
      return {
        kind: "applied",
        acknowledgedSequence: result.acknowledgedSequence,
        revision: result.projection.revision,
        isDirty: result.projection.isDirty
      };
    }
    case "duplicate":
      return {
        kind: "duplicate",
        acknowledgedSequence: result.acknowledgedSequence,
        revision: result.projection.revision,
        isDirty: result.projection.isDirty
      };
    case "revision-conflict":
      return {
        kind: "revision-conflict",
        canonicalRevision: result.canonicalRevision,
        canonicalText: result.canonicalText,
        isDirty: result.isDirty
      };
    case "sequence-gap":
      return {
        kind: "sequence-gap",
        expectedSequence: result.expectedSequence,
        canonicalRevision: result.canonicalRevision
      };
    case "error":
      return errorResult(result.error.code);
  }
}

function mapFlushResult(
  result: ApplicationFlushDocumentEditsResult
): FlushDocumentEditsResult {
  switch (result.kind) {
    case "flushed":
      return {
        kind: "flushed",
        acknowledgedSequence: result.acknowledgedSequence,
        revision: result.revision,
        savedRevision: result.savedRevision,
        isDirty: result.isDirty
      };
    case "sequence-gap":
      return {
        kind: "sequence-gap",
        expectedSequence: result.expectedSequence,
        canonicalRevision: result.canonicalRevision
      };
    case "error":
      return errorResult(result.error.code);
  }
}

function errorResult(code: DocumentEditErrorCode): {
  readonly kind: "error";
  readonly error: { readonly code: DocumentEditErrorCode; readonly message: string };
} {
  return {
    kind: "error",
    error: { code, message: DOCUMENT_EDIT_ERROR_MESSAGES[code] }
  };
}

function requireCurrentSender<TSender>(
  dependencies: Pick<RegisterWorkspaceHandlersInput<TSender>, "isCurrentSender">,
  sender: TSender,
  windowId: string
): void {
  if (!dependencies.isCurrentSender(sender, windowId)) {
    throw new Error("Workspace renderer is no longer current.");
  }
}
