import type {
  ApplyWorkspaceDocumentEditsInput,
  ApplyWorkspaceDocumentEditsResult
} from "@fishmark/workspace-domain";

import type { KeyedOperationCoordinator } from "./ports";

export type ApplyDocumentEditsInput = ApplyWorkspaceDocumentEditsInput;
export type ApplyDocumentEditsResult = ApplyWorkspaceDocumentEditsResult;
export type DocumentEditAuthorization = () => void;

export function createApplyDocumentEdits(dependencies: {
  workspace: {
    applyDocumentEdits(
      input: ApplyWorkspaceDocumentEditsInput
    ): ApplyWorkspaceDocumentEditsResult | Promise<ApplyWorkspaceDocumentEditsResult>;
  };
  documentOperations: Pick<KeyedOperationCoordinator<string>, "runExclusive">;
}) {
  return {
    apply(
      input: ApplyDocumentEditsInput,
      authorize: DocumentEditAuthorization
    ): Promise<ApplyDocumentEditsResult> {
      return dependencies.documentOperations.runExclusive(input.tabId, async () => {
        authorize();
        return dependencies.workspace.applyDocumentEdits(input);
      });
    }
  };
}
