export type WorkspaceDraftEntry = Readonly<{
  tabId: string;
  content: string;
  generation: number;
}>;

export class WorkspaceDraftOutbox {
  private readonly drafts = new Map<string, WorkspaceDraftEntry>();
  private nextGeneration = 1;

  acknowledge(entry: WorkspaceDraftEntry): boolean {
    if (this.drafts.get(entry.tabId)?.generation !== entry.generation) {
      return false;
    }

    this.drafts.delete(entry.tabId);
    return true;
  }

  get(tabId: string): string | undefined {
    return this.drafts.get(tabId)?.content;
  }

  has(tabId: string): boolean {
    return this.drafts.has(tabId);
  }

  peek(tabId: string): WorkspaceDraftEntry | undefined {
    return this.drafts.get(tabId);
  }

  entries(): readonly WorkspaceDraftEntry[] {
    return [...this.drafts.values()];
  }

  tabIds(): readonly string[] {
    return [...this.drafts.keys()];
  }

  set(tabId: string, content: string): WorkspaceDraftEntry {
    const entry: WorkspaceDraftEntry = {
      tabId,
      content,
      generation: this.nextGeneration
    };
    this.nextGeneration += 1;
    this.drafts.set(tabId, entry);
    return entry;
  }

  discardThrough(tabId: string, generation: number): boolean {
    const entry = this.drafts.get(tabId);
    if (entry === undefined || entry.generation > generation) {
      return false;
    }

    this.drafts.delete(tabId);
    return true;
  }

  remove(tabId: string): boolean {
    return this.drafts.delete(tabId);
  }
}
