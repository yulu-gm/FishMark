import type {
  WorkspaceState,
  WorkspaceWindowProjection
} from "@fishmark/workspace-domain";

import type { OpenMarkdownFileResult } from "../shared/open-markdown-file";
import type { WorkspaceDocumentOperationCoordinator } from "./workspace-document-operation-coordinator";
import { requireAppliedWorkspaceMutation } from "./workspace-mutation-result";

type WorkspaceReloadApplicationDependencies = {
  workspace: Pick<
    WorkspaceState,
    "getTabSession" | "replaceTabDocument"
  >;
  documentOperations: Pick<
    WorkspaceDocumentOperationCoordinator,
    "runExclusive"
  >;
  openMarkdownFileFromPath: (
    targetPath: string
  ) => Promise<OpenMarkdownFileResult>;
  recordRecentFilePath: (targetPath: string) => Promise<void>;
};

export function createWorkspaceReloadApplication(
  dependencies: WorkspaceReloadApplicationDependencies
) {
  return {
    async reloadTab(input: {
      readonly tabId: string;
      readonly expectedWindowId: string;
      readonly targetPath: string;
    }): Promise<WorkspaceWindowProjection> {
      return dependencies.documentOperations.runExclusive(input.tabId, async () => {
        const checkpoint = dependencies.workspace.getTabSession(input.tabId);
        if (checkpoint.windowId !== input.expectedWindowId) {
          throw new Error(
            `Workspace tab '${input.tabId}' does not belong to window '${input.expectedWindowId}'.`
          );
        }

        const result = await dependencies.openMarkdownFileFromPath(input.targetPath);
        if (result.status !== "success") {
          if (result.status === "error") {
            throw new Error(result.error.message);
          }
          throw new Error(`Unable to reload Markdown file '${input.targetPath}'.`);
        }

        await dependencies.recordRecentFilePath(result.document.path ?? input.targetPath);
        const mutation = dependencies.workspace.replaceTabDocument({
          tabId: input.tabId,
          expectedWindowId: input.expectedWindowId,
          expectedRevision: checkpoint.revision,
          document: result.document
        });
        return requireAppliedWorkspaceMutation(mutation, "reload", {
          allowRevisionChanged: true
        });
      });
    }
  };
}
