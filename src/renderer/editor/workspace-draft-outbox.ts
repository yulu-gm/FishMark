export class WorkspaceDraftOutbox {
  private readonly drafts = new Map<string, string>();

  acknowledge(tabId: string, content: string): boolean {
    if (this.drafts.get(tabId) !== content) {
      return false;
    }

    this.drafts.delete(tabId);
    return true;
  }

  get(tabId: string): string | undefined {
    return this.drafts.get(tabId);
  }

  has(tabId: string): boolean {
    return this.drafts.has(tabId);
  }

  set(tabId: string, content: string): void {
    this.drafts.set(tabId, content);
  }
}
