import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function nativePointer(product, args) {
  product.crossWindowProof ??= {};
  const runners = product.crossWindowProof.nativeRunners ??= [];
  const evidencePath = product.testInfo.outputPath(`launch-${product.current.index}-pointer-${runners.length + 1}.jsonl`);
  const runner = { startedEpochMs: Date.now(), evidencePath }; runners.push(runner);
  const { error, stdout, stderr } = await new Promise(resolve => execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", fileURLToPath(new URL("./windows-pointer-drag.ps1", import.meta.url)), "-EvidencePath", evidencePath, "-PreparationDeadlineEpochMs", String(runner.startedEpochMs + 25_000), ...args],
    // Startup/serialization is completed before input (25s); the actual held
    // gesture has a cooperative 3s check. Leave room for release/restoration.
    { windowsHide: true, timeout: 35_000 }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));
  Object.assign(runner, { finishedEpochMs: Date.now(), stdout, stderr, code: error?.code ?? 0, signal: error?.signal ?? null, killed: error?.killed ?? false });
  let evidenceError;
  try { runner.phases = (await readFile(evidencePath, "utf8")).trim().split("\n").map(line => JSON.parse(line)); }
  catch (error) { evidenceError = error; runner.evidenceError = error.stack ?? String(error); }
  if (error) throw new Error(`${error.message}\nNative pointer runner: ${JSON.stringify(runner)}`, { cause: error });
  if (evidenceError) throw evidenceError;
  const expected = ["script-enter", "compiled", "serializer-ready", "prepared", "pressed", "released", "serialized", "restored", "finished"];
  if (JSON.stringify(runner.phases.map(p => p.phase)) !== JSON.stringify(expected)) throw new Error(`Native pointer evidence incomplete: ${JSON.stringify(runner)}`);
  return JSON.parse(stdout);
}
