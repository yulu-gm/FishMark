import type { IpcMainInvokeEvent } from "electron";

export type IpcHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;
export interface IpcRegistration {
  handle(channel: string, handler: IpcHandler): void;
}

/** Own only this composition's registrations. Electron rejects duplicate channels. */
export function createIpcLifecycle(ipc: IpcRegistration & { removeHandler(channel: string): void }) {
  const channels = new Set<string>();
  let disposed = false;
  return {
    handle(channel: string, handler: IpcHandler): void {
      if (disposed) throw new Error("IPC registrations have been disposed.");
      if (channels.has(channel)) throw new Error(`Duplicate IPC channel: ${channel}`);
      ipc.handle(channel, (event, ...args) => {
        if (disposed) throw new Error("IPC registrations have been disposed.");
        return handler(event, ...args);
      });
      channels.add(channel);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const channel of channels) ipc.removeHandler(channel);
      channels.clear();
    }
  };
}
