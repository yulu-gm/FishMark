import { Console } from "node:console";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { PassThrough, type Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const { installStderrTee } = createRequire(import.meta.url)("../../tests/e2e/product-stderr-tee.cjs") as {
  installStderrTee(stream: Pick<Writable, "write">, targetPath: string): void;
};
const directories: { directory: string; root: string }[] = [];
async function artifact() {
  const root = await realpath(tmpdir());
  const directory = await mkdtemp(join(root, "fishmark-stderr-tee-"));
  directories.push({ directory, root });
  return join(directory, "stderr-node.log");
}
afterEach(async () => {
  for (const owned of directories.splice(0)) {
    const target = await realpath(owned.directory);
    if (target !== resolve(owned.directory) || dirname(target) !== owned.root || !basename(target).startsWith("fishmark-stderr-tee-")) {
      throw new Error("Refusing stderr test cleanup outside its owned temporary directory.");
    }
    await rm(target, { recursive: true, force: true });
  }
});

describe("product stderr tee", () => {
  it("never overwrites an existing raw artifact or fabricates bytes after an original write throws", async () => {
    const target = await artifact();
    const stream: Pick<Writable, "write"> = { write: () => true };
    installStderrTee(stream, target);
    stream.write("retained raw output\n");
    const installedWrite = stream.write;
    expect(() => installStderrTee(stream, target)).toThrow();
    expect(stream.write).toBe(installedWrite);
    expect(await readFile(target, "utf8")).toBe("retained raw output\n");
    const failureTarget = await artifact();
    const failure = new Error("original stream write rejected");
    const failingStream: Pick<Writable, "write"> = { write: () => { throw failure; } };
    installStderrTee(failingStream, failureTarget);
    expect(() => failingStream.write("not successfully emitted")).toThrow(failure);
    expect(await readFile(failureTarget)).toEqual(Buffer.alloc(0));
  });

  it("forwards the receiver, exact arguments, callback and backpressure result while retaining raw encoded bytes", async () => {
    const target = await artifact();
    const callback = vi.fn();
    const calls: { receiver: unknown; args: unknown[] }[] = [];
    const originalWrite = vi.fn(function (this: unknown, ...args: unknown[]) {
      calls.push({ receiver: this, args });
      const completion = args.at(-1);
      if (typeof completion === "function") completion();
      return false;
    });
    const stream: Pick<Writable, "write"> = { write: originalWrite };
    installStderrTee(stream, target);
    expect(stream.write("é", "latin1", callback)).toBe(false);
    const buffer = Buffer.from([0x00, 0xff]);
    expect(stream.write(buffer, callback)).toBe(false);
    const array = new Uint8Array([0x80, 0x7f]);
    expect(stream.write(array)).toBe(false);
    expect(calls.every((call) => call.receiver === stream)).toBe(true);
    expect(calls[0]?.args).toEqual(["é", "latin1", callback]);
    expect(calls[1]?.args[0]).toBe(buffer);
    expect(calls[1]?.args[1]).toBe(callback);
    expect(calls[2]?.args[0]).toBe(array);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(await readFile(target)).toEqual(Buffer.from([0xe9, 0x00, 0xff, 0x80, 0x7f]));
  });

  it("retains an early formatted warning exactly once when a later child-pipe listener misses it", async () => {
    const target = await artifact();
    const stderr = new PassThrough();
    // Playwright's startup readers already drain the pipe before launch returns.
    stderr.on("data", () => {});
    installStderrTee(stderr, target);
    const output = new Console({ stdout: new PassThrough(), stderr });
    output.warn("early %s: %d", "recovery", 1);
    const latePipe: string[] = [];
    stderr.on("data", (chunk: Buffer) => latePipe.push(chunk.toString("utf8")));
    output.warn("late %s: %d", "recovery", 2);
    expect(await readFile(target, "utf8")).toBe("early recovery: 1\nlate recovery: 2\n");
    expect(latePipe.join("")).toBe("late recovery: 2\n");
    expect(stderr.write("continued\n")).toBe(true);
    expect(await readFile(target, "utf8")).toBe("early recovery: 1\nlate recovery: 2\ncontinued\n");
    stderr.destroy();
  });
});
