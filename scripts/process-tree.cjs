const { spawn } = require("node:child_process");
const {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const PROCESS_TREE_REGISTRY_ENV = "FISHMARK_PROCESS_TREE_REGISTRY_PATH";
const DEFAULT_CLEANUP_TIMEOUT_MS = 6_000;
const DEFAULT_TERMINATOR_TIMEOUT_MS = 2_000;
const DEFAULT_POLL_MS = 20;

function spawnTrackedProcess(command, args, options = {}, runtimeOverrides = {}) {
  const runtime = createRuntime(runtimeOverrides);
  const inheritedRegistryPath =
    options.env?.[PROCESS_TREE_REGISTRY_ENV] ?? process.env[PROCESS_TREE_REGISTRY_ENV];
  const ownsRegistry = !inheritedRegistryPath;
  const registryDirectory = ownsRegistry
    ? mkdtempSync(join(tmpdir(), "fishmark-process-tree-"))
    : null;
  const registryPath = inheritedRegistryPath ?? join(registryDirectory, "pids");
  if (ownsRegistry) writeFileSync(registryPath, "", { flag: "wx" });

  let child;
  try {
    child = runtime.spawnRoot(command, args, {
      ...options,
      detached: runtime.platform !== "win32" && ownsRegistry,
      env: {
        ...process.env,
        ...options.env,
        [PROCESS_TREE_REGISTRY_ENV]: registryPath
      }
    });
    if (child.pid !== undefined) registerProcessId(registryPath, child.pid);
  } catch (error) {
    if (ownsRegistry) removeRegistry(registryPath, registryDirectory);
    throw error;
  }

  const trackedInput = {
    child,
    registryPath,
    ownsRegistry,
    registryDirectory,
    processGroupId:
      runtime.platform !== "win32" && ownsRegistry ? child.pid : undefined
  };
  let termination;
  return {
    child,
    terminate: () => {
      termination ??= terminateTrackedProcess(trackedInput, runtime);
      return termination;
    },
    verifyStopped: async () => {
      const alive = readTrackedProcessIds(trackedInput, runtime).filter(runtime.isProcessAlive);
      const groupAlive = isOwnedPosixGroupAlive(trackedInput, runtime);
      if (alive.length > 0 || groupAlive) {
        const details = [
          alive.length > 0 ? `tracked processes ${alive.join(", ")}` : null,
          groupAlive ? `POSIX process group ${trackedInput.processGroupId}` : null
        ].filter(Boolean);
        throw new Error(`Process-tree members are still alive: ${details.join("; ")}.`);
      }
      if (ownsRegistry) removeRegistry(registryPath, registryDirectory);
    }
  };
}

function createRuntime(overrides) {
  return {
    platform: overrides.platform ?? process.platform,
    cleanupTimeoutMs: positiveBudget(
      overrides.cleanupTimeoutMs,
      DEFAULT_CLEANUP_TIMEOUT_MS,
      "cleanupTimeoutMs"
    ),
    terminatorTimeoutMs: positiveBudget(
      overrides.terminatorTimeoutMs,
      DEFAULT_TERMINATOR_TIMEOUT_MS,
      "terminatorTimeoutMs"
    ),
    pollMs: positiveBudget(overrides.pollMs, DEFAULT_POLL_MS, "pollMs"),
    now: overrides.now ?? Date.now,
    delay: overrides.delay ?? ((durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs))),
    isProcessAlive: overrides.isProcessAlive ?? isProcessAlive,
    isProcessGroupAlive: overrides.isProcessGroupAlive ?? isProcessGroupAlive,
    signalProcess: overrides.signalProcess ?? signalPosixProcess,
    signalProcessGroup: overrides.signalProcessGroup ?? signalPosixProcessGroup,
    setTimer: overrides.setTimer ?? setTimeout,
    clearTimer: overrides.clearTimer ?? clearTimeout,
    spawnRoot: overrides.spawnRoot ?? spawn,
    spawnTerminator: overrides.spawnTerminator ?? spawn
  };
}

function positiveBudget(value, fallback, name) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function registerProcessId(registryPath, pid = process.pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error(`Cannot register invalid process id ${String(pid)}.`);
  }
  appendFileSync(registryPath, `${pid}\n`, "utf8");
}

function readRegisteredProcessIds(registryPath) {
  if (!existsSync(registryPath)) return [];
  try {
    return [...new Set(
      readFileSync(registryPath, "utf8")
        .split(/\r?\n/u)
        .map((value) => Number(value))
        .filter((pid) => Number.isSafeInteger(pid) && pid > 0)
    )];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function readTrackedProcessIds(input, runtime) {
  const rootPid = input.child.pid;
  const rootExited = input.child.exitCode !== null || input.child.signalCode !== null;
  const registered = readRegisteredProcessIds(input.registryPath).filter(
    (pid) =>
      pid !== process.pid &&
      !(rootExited && rootPid !== undefined && pid === rootPid)
  );
  if (rootPid === undefined || rootExited) return registered;
  return [...new Set([rootPid, ...registered])];
}

async function terminateTrackedProcess(input, runtime) {
  const startedAt = runtime.now();
  const deadline = startedAt + runtime.cleanupTimeoutMs;
  const errors = [];
  let windowsAttempts = 0;
  let sentTerm = false;
  let sentKill = false;

  try {
    while (runtime.now() < deadline) {
      const alive = readTrackedProcessIds(input, runtime).filter(runtime.isProcessAlive);
      const groupAlive = isOwnedPosixGroupAlive(input, runtime);
      if (alive.length === 0 && !groupAlive) break;

      if (runtime.platform === "win32") {
        const elapsed = runtime.now() - startedAt;
        const mayAttempt =
          windowsAttempts === 0 ||
          (windowsAttempts === 1 && elapsed >= runtime.cleanupTimeoutMs / 2);
        if (mayAttempt) {
          errors.push(
            ...await terminateWindowsTrees(alive, runtime, deadline)
          );
          windowsAttempts += 1;
        }
      } else if (!sentTerm) {
        terminatePosixProcesses(alive, input.processGroupId, groupAlive, runtime, "SIGTERM");
        sentTerm = true;
      } else if (
        !sentKill &&
        runtime.now() - startedAt >= runtime.cleanupTimeoutMs / 2
      ) {
        terminatePosixProcesses(alive, input.processGroupId, groupAlive, runtime, "SIGKILL");
        sentKill = true;
      }

      const remaining = deadline - runtime.now();
      if (remaining <= 0) break;
      await runtime.delay(Math.min(runtime.pollMs, remaining));
    }

    const alive = readTrackedProcessIds(input, runtime).filter(runtime.isProcessAlive);
    const groupAlive = isOwnedPosixGroupAlive(input, runtime);
    if (alive.length > 0) {
      errors.push(new Error(`Tracked processes still alive at cleanup deadline: ${alive.join(", ")}.`));
    }
    if (groupAlive) {
      errors.push(
        new Error(
          `POSIX process group ${input.processGroupId} still alive at cleanup deadline.`
        )
      );
    }
    if (errors.length > 0) {
      throw new Error(
        `Process-tree cleanup failed: ${errors.map(errorMessage).join(" ")}`
      );
    }
  } finally {
    if (input.ownsRegistry) {
      removeRegistry(input.registryPath, input.registryDirectory);
    }
  }
}

async function terminateWindowsTrees(processIds, runtime, deadline) {
  const outcomes = await Promise.all(
    [...processIds].reverse().map((pid) => runWindowsTerminator(pid, runtime, deadline))
  );
  return outcomes.filter((outcome) => outcome instanceof Error);
}

async function runWindowsTerminator(pid, runtime, deadline) {
  if (!runtime.isProcessAlive(pid)) return null;
  const remaining = deadline - runtime.now();
  if (remaining <= 0) {
    return new Error(`taskkill for ${pid} was skipped because the cleanup deadline elapsed.`);
  }
  const timeoutMs = Math.min(runtime.terminatorTimeoutMs, remaining);

  return await new Promise((resolveTermination) => {
    const terminator = runtime.spawnTerminator(
      "taskkill",
      ["/pid", String(pid), "/T", "/F"],
      { stdio: "ignore", windowsHide: true }
    );
    let settled = false;
    let phase = "running";
    let timeoutOutcome = null;
    let timeout;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      runtime.clearTimer(timeout);
      terminator.removeListener?.("error", onError);
      terminator.removeListener?.("exit", onExit);
      terminator.removeListener?.("close", onClose);
      resolveTermination(outcome);
    };
    const onError = (error) => {
      if (phase === "running") {
        finish(new Error(`taskkill for ${pid} failed: ${errorMessage(error)}`));
      }
    };
    const onExit = (code) => {
      if (phase === "timed-out") {
        finish(timeoutOutcome);
        return;
      }
      if (code === 0 || !runtime.isProcessAlive(pid)) {
        finish(null);
      } else {
        finish(new Error(`taskkill for ${pid} exited with code ${code ?? "unknown"}.`));
      }
    };
    const onClose = (code) => onExit(code);
    timeout = runtime.setTimer(() => {
      phase = "timed-out";
      const timeoutMessage =
        `taskkill for ${pid} timed out after ${timeoutMs}ms and was force-terminated.`;
      timeoutOutcome = new Error(timeoutMessage);
      let killError;
      try {
        if (terminator.kill?.("SIGKILL") === false) {
          killError = " Forced terminator shutdown returned false.";
        }
      } catch (error) {
        killError = ` Forced terminator shutdown failed: ${errorMessage(error)}`;
      }
      if (killError) timeoutOutcome = new Error(`${timeoutMessage}${killError}`);
      if (settled) return;
      const shutdownGraceMs = Math.max(0, deadline - runtime.now());
      if (shutdownGraceMs === 0) {
        finish(withUnconfirmedTerminatorExit(timeoutOutcome));
        return;
      }
      timeout = runtime.setTimer(
        () => finish(withUnconfirmedTerminatorExit(timeoutOutcome)),
        shutdownGraceMs
      );
    }, timeoutMs);
    terminator.once("error", onError);
    terminator.once("exit", onExit);
    terminator.once("close", onClose);
  });
}

function withUnconfirmedTerminatorExit(timeoutError) {
  return new Error(`${errorMessage(timeoutError)} Terminator exit unconfirmed before cleanup deadline.`);
}

function isOwnedPosixGroupAlive(input, runtime) {
  return runtime.platform !== "win32" &&
    input.processGroupId !== undefined &&
    runtime.isProcessGroupAlive(input.processGroupId);
}

function terminatePosixProcesses(processIds, processGroupId, groupAlive, runtime, signal) {
  if (groupAlive && processGroupId !== undefined) {
    runtime.signalProcessGroup(processGroupId, signal);
  }
  for (const pid of processIds) runtime.signalProcess(pid, signal);
}

function signalPosixTarget(pid, signal) {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function signalPosixProcess(pid, signal) {
  signalPosixTarget(pid, signal);
}

function signalPosixProcessGroup(groupId, signal) {
  signalPosixTarget(-groupId, signal);
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function isProcessGroupAlive(groupId) {
  return isProcessAlive(-groupId);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function removeRegistry(registryPath, registryDirectory) {
  rmSync(registryPath, { force: true });
  if (registryDirectory) rmSync(registryDirectory, { force: true, recursive: true });
}

module.exports = {
  spawnTrackedProcess
};
