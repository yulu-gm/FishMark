import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { spawnTrackedProcess } = require("./process-tree.cjs");

export async function runEditorBehaviorProcess(input) {
  const processTree = spawnTrackedProcess(input.command, input.args, input.options);
  const { child } = processTree;

  return await new Promise((resolveExit, rejectExit) => {
    let settled = false;
    let timeout;
    const finish = async (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        await processTree.terminate();
        resolveExit(code);
      } catch (error) {
        rejectExit(error);
      }
    };

    timeout = setTimeout(() => {
      input.onTimeout();
      void finish(input.timeoutExitCode);
    }, input.timeoutMs);
    child.once("exit", (code) => void finish(code ?? 1));
    child.once("error", () => void finish(1));
  });
}
