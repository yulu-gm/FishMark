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
const TERMINATION_GRACE_MS = 2_000;
const TERMINATION_POLL_MS = 20;

function spawnTrackedProcess(command, args, options = {}) {
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
    child = spawn(command, args, {
      ...options,
      detached: process.platform !== "win32" && ownsRegistry,
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

  let termination;
  return {
    child,
    terminate: () => {
      termination ??= terminateTrackedProcess({
        child,
        registryPath,
        ownsRegistry,
        registryDirectory
      });
      return termination;
    },
    verifyStopped: async () => {
      const alive = readRegisteredProcessIds(registryPath).filter(isProcessAlive);
      if (alive.length > 0) {
        throw new Error(`Tracked processes are still alive: ${alive.join(", ")}.`);
      }
      if (ownsRegistry) removeRegistry(registryPath, registryDirectory);
    }
  };
}

function registerProcessId(registryPath, pid = process.pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error(`Cannot register invalid process id ${String(pid)}.`);
  }
  appendFileSync(registryPath, `${pid}\n`, "utf8");
}

function readRegisteredProcessIds(registryPath) {
  if (!existsSync(registryPath)) return [];
  return [...new Set(
    readFileSync(registryPath, "utf8")
      .split(/\r?\n/u)
      .map((value) => Number(value))
      .filter((pid) => Number.isSafeInteger(pid) && pid > 0)
  )];
}

async function terminateTrackedProcess(input) {
  const rootPid = input.child.pid;
  const processIds = () => {
    const registered = readRegisteredProcessIds(input.registryPath).filter(
      (pid) => pid !== process.pid
    );
    return rootPid === undefined ? registered : [...new Set([rootPid, ...registered])];
  };

  if (process.platform === "win32") {
    await terminateWindowsTrees(processIds());
  } else {
    terminatePosixProcesses(processIds(), rootPid, input.ownsRegistry, "SIGTERM");
  }

  if (!(await waitForProcessesToStop(processIds, TERMINATION_GRACE_MS))) {
    if (process.platform === "win32") {
      await terminateWindowsTrees(processIds());
    } else {
      terminatePosixProcesses(processIds(), rootPid, input.ownsRegistry, "SIGKILL");
    }
    if (!(await waitForProcessesToStop(processIds, TERMINATION_GRACE_MS))) {
      const alive = processIds().filter(isProcessAlive);
      throw new Error(`Process-tree termination did not stop: ${alive.join(", ")}.`);
    }
  }

  if (input.ownsRegistry) {
    removeRegistry(input.registryPath, input.registryDirectory);
  }
}

async function terminateWindowsTrees(processIds) {
  for (const pid of [...processIds].reverse()) {
    if (!isProcessAlive(pid)) continue;
    await new Promise((resolveTermination, rejectTermination) => {
      const terminator = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true
      });
      terminator.once("error", rejectTermination);
      terminator.once("exit", (code) => {
        if (code === 0 || !isProcessAlive(pid)) resolveTermination();
        else rejectTermination(new Error(`taskkill for ${pid} exited with code ${code ?? "unknown"}.`));
      });
    });
  }
}

function terminatePosixProcesses(processIds, rootPid, ownsRegistry, signal) {
  if (ownsRegistry && rootPid !== undefined) signalPosix(-rootPid, signal);
  for (const pid of processIds) signalPosix(pid, signal);
}

function signalPosix(pid, signal) {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function waitForProcessesToStop(readProcessIds, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (readProcessIds().every((pid) => !isProcessAlive(pid))) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, TERMINATION_POLL_MS));
  } while (Date.now() < deadline);
  return readProcessIds().every((pid) => !isProcessAlive(pid));
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function removeRegistry(registryPath, registryDirectory) {
  rmSync(registryPath, { force: true });
  if (registryDirectory) rmSync(registryDirectory, { force: true, recursive: true });
}

module.exports = {
  spawnTrackedProcess
};
