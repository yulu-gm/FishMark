export interface DiskVersion {
  readonly normalizedPath: string;
  readonly mtimeMs: number;
  readonly size: number;
  readonly contentHash: string;
}
