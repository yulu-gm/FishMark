import { contextBridge, ipcRenderer, webUtils } from "electron";
import { resolvePreloadBridgeModeFromArgv } from "../shared/preload-bridge-mode";
import { createProductApi, type ProductIpcPort } from "./product-api";
import { createTestApi } from "./test-api";

const ipc: ProductIpcPort = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, listener) => { ipcRenderer.on(channel, listener); },
  off: (channel, listener) => { ipcRenderer.off(channel, listener); }
};
const productApi = createProductApi({
  ipc,
  filePath: webUtils,
  runtime: { platform: process.platform, argv: process.argv ?? [] }
});
contextBridge.exposeInMainWorld("fishmark", productApi);
const preloadBridgeMode = resolvePreloadBridgeModeFromArgv({
  argv: process.argv ?? []
});
if (preloadBridgeMode !== "product") {
  contextBridge.exposeInMainWorld("fishmarkTest", createTestApi(ipc));
}
