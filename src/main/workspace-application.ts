import type {
  WorkspaceState,
  WorkspaceWindowProjection
} from "@fishmark/workspace-domain";

import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";

type WorkspaceApplicationDependencies = {
  workspace: Pick<
    WorkspaceState,
    "getTabSession" | "updateTabDraft" | "saveTabDocument"
  >;
  saveMarkdownFileToPath: (input: {
    tabId: string;
    path: string;
    content: string;
  }) => Promise<SaveMarkdownFileResult>;
};

export function createWorkspaceApplication(dependencies: WorkspaceApplicationDependencies) {
  return {
    updateDraft(input: {
      tabId: string;
      content: string;
    }): WorkspaceWindowProjection {
      return dependencies.workspace.updateTabDraft(input.tabId, input.content);
    },
    async saveTab(input: { tabId: string; path: string }): Promise<SaveMarkdownFileResult> {
      const tab = dependencies.workspace.getTabSession(input.tabId);
      const result = await dependencies.saveMarkdownFileToPath({
        tabId: input.tabId,
        path: input.path,
        content: tab.content
      });

      if (result.status === "success") {
        dependencies.workspace.saveTabDocument({
          tabId: input.tabId,
          capturedRevision: tab.revision,
          document: result.document,
          diskVersion: null
        });
      }

      return result;
    }
  };
}
