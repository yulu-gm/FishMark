import type { AppNotification } from "../../shared/app-update";

export type WorkspaceApplicationGateway = Pick<Window["fishmark"],
  | "clearRecentFile" | "refreshThemePackages" | "updatePreferences"
  | "importClipboardImage" | "openExternalLink"
  | "openThemesDirectory" | "selectTemporaryImageDirectory"
  | "syncWatchedMarkdownFile"
>;

// Capability boundary for renderer UI. Workspace mutations remain on the application command path.
export class RendererPlatformGateway {
  constructor(private readonly bridge: WorkspaceApplicationGateway, private readonly notify: (notification: AppNotification) => void, private readonly assertActive: () => void, private readonly onPreferencesUpdated: (delayMs: number) => void) {}
  clearRecentFile = async (input: Parameters<WorkspaceApplicationGateway["clearRecentFile"]>[0]): Promise<Awaited<ReturnType<WorkspaceApplicationGateway["clearRecentFile"]>> | null> => {
    try { this.assertActive(); return await this.bridge.clearRecentFile(input); }
    catch (error) { this.notify({ kind: "error", message: error instanceof Error ? error.message : String(error) }); return null; }
  };
  refreshThemePackages = async (...args: Parameters<WorkspaceApplicationGateway["refreshThemePackages"]>): ReturnType<WorkspaceApplicationGateway["refreshThemePackages"]> => {
    this.assertActive();
    try { return await this.bridge.refreshThemePackages(...args); }
    catch { throw new Error("主题列表刷新失败。"); }
  };
  updatePreferences = async (patch: Parameters<WorkspaceApplicationGateway["updatePreferences"]>[0]): ReturnType<WorkspaceApplicationGateway["updatePreferences"]> => {
    this.assertActive();
    const result = await this.bridge.updatePreferences(patch);
    this.assertActive();
    this.onPreferencesUpdated(result.preferences.autosave.idleDelayMs);
    return result;
  };
  openThemesDirectory = async (...args: Parameters<WorkspaceApplicationGateway["openThemesDirectory"]>): ReturnType<WorkspaceApplicationGateway["openThemesDirectory"]> => {
    this.assertActive();
    try { return await this.bridge.openThemesDirectory(...args); }
    catch { throw new Error("无法打开主题目录。"); }
  };
  selectTemporaryImageDirectory = async (): Promise<Awaited<ReturnType<WorkspaceApplicationGateway["updatePreferences"]>> | null> => {
    this.assertActive();
    let directory: string | null;
    try { directory = await this.bridge.selectTemporaryImageDirectory(); }
    catch { throw new Error("无法选择临时图片目录。"); }
    this.assertActive();
    return directory === null ? null : this.updatePreferences({ images: { temporaryDirectory: directory } });
  };
  syncWatchedMarkdownFile = async (): Promise<void> => {
    try { this.assertActive(); await this.bridge.syncWatchedMarkdownFile(); }
    catch (error) { this.notify({ kind: "error", message: error instanceof Error ? error.message : String(error) }); }
  };
  importClipboardImage = async (input: Parameters<WorkspaceApplicationGateway["importClipboardImage"]>[0]): Promise<string | null> => {
    this.assertActive();
    const result = await this.bridge.importClipboardImage(input);
    this.assertActive();
    if (result.status === "success") return result.markdown;
    this.notify({ kind: "error", message: result.error.message });
    return null;
  };
  openExternalLink = async (href: string): Promise<void> => {
    try { this.assertActive(); await this.bridge.openExternalLink(href); }
    catch (error) { this.notify({ kind: "error", message: error instanceof Error ? error.message : "Unable to open link." }); }
  };
}
