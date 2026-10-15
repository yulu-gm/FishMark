import path from "node:path";
import { sameFileIdentity, type WorkspaceState } from "@fishmark/workspace-domain";
import type { FileIdentityPort, ResolvedFileIdentity, KeyedOperationCoordinator } from "@fishmark/workspace-application";
import { filePathIdentity } from "./file-path";

export function denyPathAuthority(): never {
  throw new Error("Path authority denied.");
}

type Owner = { windowId: string; token: string; generation: number; alive: boolean; grants: Map<string, Grant> };
type Grant = { resolved: ResolvedFileIdentity; active: boolean; consumed: boolean; requestId: string; expiresAt: number };

/** Exact main-owned sources. Lookup is deliberately synchronous and performs no filesystem I/O. */
export function createPathAuthority(input: {
  fileIdentity: FileIdentityPort;
  workspace: Pick<WorkspaceState, "getWindowTabIds" | "getTabSession">;
  platform?: NodeJS.Platform;
  now?: () => number;
}) {
  const owners = new WeakMap<object, Owner>();
  let recent = new Map<string, ResolvedFileIdentity>();
  let recentRevision = 0;
  const key = (targetPath: string) => filePathIdentity(targetPath, input.platform ?? process.platform);
  const now = input.now ?? Date.now;
  function ownerFor(sender: object): Owner {
    const owner = owners.get(sender);
    if (!owner?.alive) denyPathAuthority();
    return owner;
  }
  function capture(sender: object) {
    const owner = ownerFor(sender);
    const generation = owner.generation;
    const check = () => {
      if (owners.get(sender) !== owner || !owner.alive || owner.generation !== generation) denyPathAuthority();
    };
    return { owner, check, windowId: owner.windowId };
  }
  function source(sender: object, targetPath: string) {
    const context = capture(sender);
    const lexicalKey = key(targetPath);
    const grant = context.owner.grants.get(lexicalKey);
    if (grant?.active && !grant.consumed && now() < grant.expiresAt) return { ...context, resolved: grant.resolved, grant, checkSource: () => {
      if (!grant.active || now() >= grant.expiresAt) denyPathAuthority();
    } };
    const tabIds = (() => { try { return input.workspace.getWindowTabIds(context.windowId); } catch { return []; } })();
    for (const tabId of tabIds) {
      const tab = input.workspace.getTabSession(tabId);
      if (tab.path === null || tab.fileIdentity === null || key(tab.path) !== lexicalKey) continue;
      const identity = tab.fileIdentity;
      return { ...context, resolved: {
        canonicalPath: tab.path, pathKey: identity.location, physicalKey: identity.object,
        identity, exists: true
      } as ResolvedFileIdentity, checkSource: () => {
        const current = input.workspace.getTabSession(tabId);
        if (current.windowId !== context.windowId || current.path !== tab.path ||
            !sameFileIdentity(current.fileIdentity, identity)) denyPathAuthority();
      } };
    }
    const entry = recent.get(lexicalKey);
    if (entry) return { ...context, resolved: entry, recent: true, checkSource: () => {
      if (recent.get(lexicalKey) !== entry) denyPathAuthority();
    } };
    return denyPathAuthority();
  }
  function same(left: ResolvedFileIdentity, right: ResolvedFileIdentity) {
    return key(left.canonicalPath) === key(right.canonicalPath) && left.exists === right.exists &&
      (left.identity === null ? right.identity === null : right.identity !== null && sameFileIdentity(left.identity, right.identity));
  }
  async function grant(sender: object, targetPath: string, requestId: string) {
    const context = capture(sender);
    const resolved = await input.fileIdentity.resolveProspective(targetPath);
    context.check();
    const value: Grant = { resolved, active: true, consumed: false, requestId,
      expiresAt: requestId === "native-drop" ? now() + 60_000 : Number.POSITIVE_INFINITY };
    const lexicalKey = key(targetPath);
    const previous = context.owner.grants.get(lexicalKey);
    if (previous) previous.active = false;
    context.owner.grants.set(lexicalKey, value);
    return () => {
      value.active = false;
      if (context.owner.grants.get(lexicalKey) === value) context.owner.grants.delete(lexicalKey);
    };
  }
  return {
    bind(sender: object, windowId: string, token: string) {
      owners.set(sender, { windowId, token, generation: 0, alive: true, grants: new Map() });
    },
    invalidate(sender: object, destroyed = false) {
      const owner = owners.get(sender);
      if (!owner) return;
      owner.generation += 1;
      if (destroyed) owner.alive = false;
      for (const grant of owner.grants.values()) grant.active = false;
      owner.grants.clear();
    },
    capture,
    requirePath(sender: object, targetPath: string) { source(sender, targetPath); },
    grant,
    async grantNative(sender: object, token: string, targetPath: string) {
      if (ownerFor(sender).token !== token) denyPathAuthority();
      return grant(sender, targetPath, "native-drop");
    },
    revokeRequest(sender: object, requestId: string) {
      const owner = owners.get(sender);
      if (!owner) return;
      for (const [lexicalKey, grant] of owner.grants) {
        if (grant.requestId === requestId) { grant.active = false; owner.grants.delete(lexicalKey); }
      }
    },
    async syncRecent(paths: readonly string[], recordedPath?: string) {
      const revision = ++recentRevision;
      const retained = new Set(paths.map(key));
      // Removal revokes immediately, before resolving any newly trusted main paths.
      recent = new Map([...recent].filter(([entryKey]) => retained.has(entryKey)));
      const next = new Map<string, ResolvedFileIdentity>();
      for (const targetPath of paths) {
        const previous = recent.get(key(targetPath));
        if (previous && (recordedPath === undefined || key(recordedPath) !== key(targetPath))) {
          next.set(key(targetPath), previous);
          continue;
        }
        try {
          const resolved = await input.fileIdentity.resolveProspective(targetPath);
          // Recent entries are recorded by main using canonical paths. Refresh cannot turn a
          // replaced entry into authority for a different symlink/junction destination.
          if (key(resolved.canonicalPath) !== key(targetPath)) continue;
          next.set(key(targetPath), previous && same(previous, resolved) ? previous : resolved);
        }
        catch { /* An inaccessible recent entry remains visible, but cannot grant access. */ }
      }
      if (revision === recentRevision) recent = next;
    },
    consume(sender: object, targetPath: string) {
      const approval = source(sender, targetPath);
      if ("grant" in approval && approval.grant) approval.grant.consumed = true;
      const check = () => { approval.check(); approval.checkSource(); };
      let pinned = approval.resolved;
      let pinObject = !("recent" in approval);
      const resolve = async (candidate: string) => {
        check();
        if (key(candidate) !== key(targetPath) && key(candidate) !== key(approval.resolved.canonicalPath)) denyPathAuthority();
        const current = await input.fileIdentity.resolveProspective(targetPath);
        check();
        if (pinObject) {
          if (!same(current, pinned)) denyPathAuthority();
        } else {
          // A main recent entry authorizes a canonical location. External atomic saves may
          // replace its object; fix this operation's object once, before reading any content.
          if (key(current.canonicalPath) !== key(pinned.canonicalPath)) denyPathAuthority();
          pinned = current; pinObject = true;
        }
        return current;
      };
      return {
        check,
        finish() {
          if ("grant" in approval && approval.grant) {
            approval.grant.active = false;
            if (approval.owner.grants.get(key(targetPath)) === approval.grant) approval.owner.grants.delete(key(targetPath));
          }
        },
        fileIdentity: {
          resolveProspective: resolve,
          async resolveExisting(candidate: string) {
            const result = await resolve(candidate);
            if (!result.exists) throw new Error("The authorized file no longer exists.");
            return result;
          }
        } satisfies FileIdentityPort,
        async beforeRead(candidate: string) { await resolve(candidate); check(); }
      };
    }
  };
}

/** Resolve missing directories through their closest existing ancestor before any mkdir/write. */
export async function requireContainedDirectory(fileIdentity: FileIdentityPort, directory: string, root: string) {
  const resolved = await fileIdentity.resolveProspective(directory);
  const relative = path.relative(root, resolved.canonicalPath);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) denyPathAuthority();
  return resolved.canonicalPath;
}

/** Holds the same tab lease as close/move/save-as, and checks active ownership across every await. */
export function createClipboardTargetAuthority(input: {
  workspace: Pick<WorkspaceState, "getTabSession" | "getWindowProjectionOrNull">;
  tabOperations: KeyedOperationCoordinator<string>;
  paths: Pick<ReturnType<typeof createPathAuthority>, "capture">;
  fileIdentity: FileIdentityPort;
  getTemporaryDirectory(): { path: string; canonicalPath: string };
}) {
  return async function withTarget<T>(sender: object, tabId: string, authorize: () => void,
    operation: (target: { documentPath: string | null; temporaryDirectory: string; check(): void; beforeDirectoryIO(directory: string): Promise<void>; beforeWrite(directory: string): Promise<void> }) => Promise<T>
  ): Promise<T> {
    const owner = input.paths.capture(sender);
    const tab = (() => { try { return input.workspace.getTabSession(tabId); } catch { return denyPathAuthority(); } })();
    const check = () => {
      authorize(); owner.check();
      const current = (() => { try { return input.workspace.getTabSession(tabId); } catch { return denyPathAuthority(); } })();
      if (current.windowId !== owner.windowId || current.path !== tab.path ||
          !sameFileIdentity(current.fileIdentity, tab.fileIdentity) ||
          input.workspace.getWindowProjectionOrNull(owner.windowId)?.activeTabId !== tabId) denyPathAuthority();
    };
    check();
    return input.tabOperations.runExclusive(tabId, async () => {
      check();
      const documentPath = tab.path;
      const temporary = documentPath === null ? input.getTemporaryDirectory() : null;
      const validateDirectory = async (directory: string) => {
        check();
        if (documentPath !== null) {
          const existing = await input.fileIdentity.resolveExisting(documentPath);
          check();
          if (!sameFileIdentity(existing.identity, tab.fileIdentity) || existing.canonicalPath !== documentPath) denyPathAuthority();
          await requireContainedDirectory(input.fileIdentity, directory, path.dirname(documentPath));
        } else {
          if (temporary === null) denyPathAuthority();
          if (input.getTemporaryDirectory().path !== temporary.path) denyPathAuthority();
          const existing = await input.fileIdentity.resolveProspective(directory);
          check();
          if (existing.canonicalPath !== temporary.canonicalPath) denyPathAuthority();
        }
        check();
      };
      const result = await operation({ documentPath, temporaryDirectory: temporary?.path ?? "", check,
        beforeDirectoryIO: validateDirectory, beforeWrite: validateDirectory });
      check();
      return result;
    });
  };
}
