export type EditorLoadIdentity = Readonly<{
  tabId: string;
  epoch: number;
  loadRevision: number;
}>;

export function isSameEditorLoadIdentity(
  left: EditorLoadIdentity,
  right: EditorLoadIdentity
): boolean {
  return left.tabId === right.tabId &&
    left.epoch === right.epoch &&
    left.loadRevision === right.loadRevision;
}
