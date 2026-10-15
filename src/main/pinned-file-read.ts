import { open } from "node:fs/promises";

export type PinnedFileHandle = {
  stat(options: { bigint: true }): Promise<{ dev: bigint; ino: bigint }>;
  readFile(): Promise<Buffer>;
  close(): Promise<void>;
};
export async function readPinnedFile(input: {
  path: string; physicalIdentity: string; check: () => void;
  beforeBody: () => Promise<void>; head?: boolean;
  open?: (target: string) => Promise<PinnedFileHandle>;
}): Promise<Buffer | null> {
  input.check();
  const handle = await (input.open ?? ((target) => open(target, "r")))(input.path);
  try {
    input.check();
    const stat = await handle.stat({ bigint: true }); input.check();
    if (stat.ino === 0n || input.physicalIdentity !== `inode:${stat.dev}:${stat.ino}`) throw new Error("Resource object changed.");
    await input.beforeBody(); input.check();
    const bytes = input.head ? null : await handle.readFile(); input.check();
    return bytes;
  } finally { await handle.close(); }
}
