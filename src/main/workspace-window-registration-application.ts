type WorkspaceWindowRegistrationDependencies<TSender, TWindow> = {
  isSenderDestroyed: (sender: TSender) => boolean;
  resolveOwnerWindow: (sender: TSender) => TWindow | null;
  isOwnerWindowDestroyed: (window: TWindow) => boolean;
  isOwnerWindowForSender: (window: TWindow, sender: TSender) => boolean;
  getWindowId: (window: TWindow) => string;
  markWindowReady: (windowId: string) => Promise<void>;
  registerWindow: (windowId: string) => void;
  bindWindow: (window: TWindow, windowId: string) => void;
  focusWindow: (windowId: string) => void;
};

export function createWorkspaceWindowRegistrationApplication<TSender, TWindow>(
  dependencies: WorkspaceWindowRegistrationDependencies<TSender, TWindow>
) {
  function requireInitialOwner(sender: TSender): TWindow {
    if (dependencies.isSenderDestroyed(sender)) {
      throw new Error("Workspace renderer is no longer available.");
    }

    const ownerWindow = dependencies.resolveOwnerWindow(sender);
    if (
      ownerWindow === null ||
      dependencies.isOwnerWindowDestroyed(ownerWindow) ||
      !dependencies.isOwnerWindowForSender(ownerWindow, sender)
    ) {
      throw new Error("Workspace renderer does not belong to a live window.");
    }

    return ownerWindow;
  }

  async function ensureWindow(sender: TSender): Promise<string> {
    const initialOwnerWindow = requireInitialOwner(sender);
    const windowId = dependencies.getWindowId(initialOwnerWindow);

    await dependencies.markWindowReady(windowId);

    if (dependencies.isSenderDestroyed(sender)) {
      throw new Error("Workspace renderer is no longer available.");
    }

    const ownerWindow = dependencies.resolveOwnerWindow(sender);
    if (
      ownerWindow === null ||
      ownerWindow !== initialOwnerWindow ||
      dependencies.getWindowId(ownerWindow) !== windowId
    ) {
      throw new Error("Workspace renderer owner changed while becoming ready.");
    }
    if (
      dependencies.isOwnerWindowDestroyed(ownerWindow) ||
      !dependencies.isOwnerWindowForSender(ownerWindow, sender)
    ) {
      throw new Error("Workspace renderer does not belong to a live window.");
    }

    dependencies.registerWindow(windowId);
    dependencies.bindWindow(ownerWindow, windowId);
    dependencies.focusWindow(windowId);
    return windowId;
  }

  return { ensureWindow };
}
