import type { DocumentTextChange } from "../../shared/document-edit";
import type { EditorLoadIdentity } from "./editor-load-identity";

export type CodeEditorDocumentChangeFrame = Readonly<{
  identity: EditorLoadIdentity | null;
  baseText: string;
  resultingText: string;
  changes: readonly DocumentTextChange[];
}>;

export type CodeEditorDiscardedDocumentText = Readonly<{
  identity: EditorLoadIdentity | null;
  text: string;
}>;

export type CodeEditorRemotePatchResult =
  | Readonly<{ kind: "applied" }>
  | Readonly<{ kind: "stale-identity" }>
  | Readonly<{ kind: "text-mismatch" }>
  | Readonly<{ kind: "invalid-range" }>
  | Readonly<{ kind: "disposed" }>;

export type CodeEditorCanonicalRestoreResult =
  | Readonly<{ kind: "restored" }>
  | Readonly<{ kind: "stale-identity" }>
  | Readonly<{ kind: "text-mismatch" }>
  | Readonly<{ kind: "disposed" }>;
