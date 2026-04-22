export type ExternalMarkdownFileChangeKind = "modified" | "deleted";

export type ExternalMarkdownFileChangedEvent = {
  path: string;
  kind: ExternalMarkdownFileChangeKind;
};

export type SyncWatchedMarkdownFileInput = {
  tabId: string | null;
};

export const SYNC_WATCHED_MARKDOWN_FILE_CHANNEL = "fishmark:sync-watched-markdown-file";
export const EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT = "fishmark:external-markdown-file-changed";
