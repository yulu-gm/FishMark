import type {
  ApplyWorkspaceDocumentEditsInput,
  ApplyWorkspaceDocumentEditsResult
} from "@fishmark/workspace-domain";

import type { KeyedOperationCoordinator, KeyedOperationLease } from "./ports";

export type ApplyDocumentEditsInput = ApplyWorkspaceDocumentEditsInput;
export type ApplyDocumentEditsResult = ApplyWorkspaceDocumentEditsResult;
export type DocumentEditAuthorization = () => void;

export function createApplyDocumentEdits(dependencies: {
  workspace: {
    applyDocumentEdits(
      input: ApplyWorkspaceDocumentEditsInput,
      authorize?: DocumentEditAuthorization
    ): ApplyWorkspaceDocumentEditsResult | Promise<ApplyWorkspaceDocumentEditsResult>;
  };
  documentOperations: Pick<KeyedOperationCoordinator<string>, "runExclusive"> &
    Partial<Pick<KeyedOperationCoordinator<string>, "isLeaseHeld">>;
}) {
  async function applyWithHeldTabLease(
    input: ApplyDocumentEditsInput,
    authorize: DocumentEditAuthorization,
    tabLease: KeyedOperationLease<string>
  ): Promise<ApplyDocumentEditsResult> {
    if (dependencies.documentOperations.isLeaseHeld?.(tabLease, input.tabId) !== true) {
      throw new Error(
        `Document edit for tab '${input.tabId}' requires an active operation lease.`
      );
    }
    authorize();
    return dependencies.workspace.applyDocumentEdits(input, authorize);
  }

  return {
    apply(
      input: ApplyDocumentEditsInput,
      authorize: DocumentEditAuthorization
    ): Promise<ApplyDocumentEditsResult> {
      return dependencies.documentOperations.runExclusive(input.tabId, async () => {
        authorize();
        return dependencies.workspace.applyDocumentEdits(input, authorize);
      });
    },
    applyWithHeldTabLease
  };
}
