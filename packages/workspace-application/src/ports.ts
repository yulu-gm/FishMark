import type {
  DiskVersion,
  FileIdentity,
  FileLocationIdentity,
  FileObjectIdentity
} from "@fishmark/workspace-domain";

declare const keyedOperationLeaseBrand: unique symbol;

export interface KeyedOperationLease<TKey extends string = string> {
  readonly [keyedOperationLeaseBrand]: TKey;
  release(): void;
}

export interface KeyedOperationCoordinator<TKey extends string> {
  runExclusive<T>(key: TKey, operation: () => Promise<T>): Promise<T>;
  runExclusiveWithLease<T>(
    key: TKey,
    operation: (lease: KeyedOperationLease<TKey>) => Promise<T>
  ): Promise<T>;
  acquireExclusive(keys: readonly TKey[]): Promise<KeyedOperationLease<TKey>>;
  isLeaseHeld(lease: KeyedOperationLease<TKey>, key: TKey): boolean;
}

interface ResolvedFileLocation {
  readonly canonicalPath: string;
  readonly pathKey: FileLocationIdentity;
}

export interface ResolvedExistingFileIdentity extends ResolvedFileLocation {
  readonly exists: true;
  readonly identity: FileIdentity;
  readonly physicalKey: FileObjectIdentity;
}

export interface ResolvedProspectiveFileIdentity extends ResolvedFileLocation {
  readonly exists: false;
  readonly identity: null;
  readonly physicalKey: null;
}

export type ResolvedFileIdentity =
  | ResolvedExistingFileIdentity
  | ResolvedProspectiveFileIdentity;

export interface FileIdentityPort {
  resolveExisting(targetPath: string): Promise<ResolvedExistingFileIdentity>;
  resolveProspective(targetPath: string): Promise<ResolvedFileIdentity>;
}

export interface PersistedMarkdownDocument {
  readonly path: string;
  readonly name: string;
  readonly content: string;
  readonly encoding: "utf-8";
}

export type DocumentReadErrorCode =
  | "dialog-failed"
  | "file-not-found"
  | "non-utf8"
  | "read-failed"
  | "not-a-file";

export type DocumentReadResult =
  | {
      readonly status: "success";
      readonly document: PersistedMarkdownDocument;
      readonly diskVersion: DiskVersion;
    }
  | { readonly status: "cancelled" }
  | {
      readonly status: "error";
      readonly error: {
        readonly code: DocumentReadErrorCode;
        readonly message: string;
      };
    };

export type SaveDocumentErrorCode =
  | "dialog-failed"
  | "write-failed"
  | "disk-version-conflict"
  | "file-identity-conflict"
  | "file-identity-changed"
  | "tab-missing"
  | "window-missing"
  | "window-changed"
  | "revision-changed"
  | "file-identity-missing"
  | "runtime-context-unavailable";

export type SaveDocumentResult =
  | { readonly status: "success"; readonly document: PersistedMarkdownDocument }
  | { readonly status: "cancelled" }
  | {
      readonly status: "error";
      readonly error: {
        readonly code: SaveDocumentErrorCode;
        readonly message: string;
      };
    };

export interface DocumentFilePort {
  read(targetPath: string): Promise<DocumentReadResult>;
}

export type WriteDocumentResult =
  | {
      readonly status: "success";
      readonly diskVersion: DiskVersion;
      readonly document: PersistedMarkdownDocument;
    }
  | {
      readonly status: "error";
      readonly error: { readonly code: "write-failed"; readonly message: string };
    };

export interface DiskRepositoryPort {
  readDiskVersion(targetPath: string): Promise<DiskVersion | null>;
  writeDocument(input: {
    readonly path: string;
    readonly content: string;
  }): Promise<WriteDocumentResult>;
}

export type PathDialogResult =
  | { readonly status: "success"; readonly path: string }
  | { readonly status: "cancelled" }
  | {
      readonly status: "error";
      readonly error: { readonly code: "dialog-failed"; readonly message: string };
    };

export interface WorkspaceDialogPort {
  chooseOpenPath(): Promise<PathDialogResult>;
  chooseSavePath(input: { readonly currentPath: string | null }): Promise<PathDialogResult>;
  chooseDirtyTab(input: {
    readonly tabId: string;
    readonly name: string;
  }): Promise<"save" | "discard" | "cancel">;
}

export interface WorkspaceWatcherPort<TRuntimeContext> {
  syncWindowPaths(
    context: TRuntimeContext,
    targetPaths: readonly (string | null)[]
  ): Promise<void>;
  beginInternalWrite(context: TRuntimeContext, targetPath: string): Promise<void>;
  completeInternalWrite(context: TRuntimeContext, targetPath: string): Promise<void>;
}

export interface RecentFilesPort {
  record(targetPath: string): Promise<void>;
}

export interface OwnerActivationPort {
  activateOwnerWindowTab(
    windowId: string,
    tabId: string,
    identity: FileIdentity
  ): Promise<"activated" | "retry" | "failed">;
}

export interface WorkspaceWindowLifecyclePort<TWindow> {
  openWindow(): TWindow;
  getWindowId(window: TWindow): string;
  destroyWindow(window: TWindow): void;
  bindClosed(window: TWindow, listener: () => void): void;
  bindLoadFailure(window: TWindow, listener: () => void): void;
  scheduleReadyTimeout(listener: () => void): () => void;
}

export interface CleanupReporterPort {
  report(error: unknown): void;
}
