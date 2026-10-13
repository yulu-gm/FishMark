import { NATIVE_FILE_PATH_CHANNEL } from "../../shared/native-file-path";
import { denyPathAuthority, type createPathAuthority } from "../path-authority";
import type { IpcRegistration } from "./ipc-lifecycle";
import type { AuthorizeIpcSender } from "./ipc-sender";

export function registerNativeFileHandlers(input: {
  ipc: IpcRegistration; authorize: AuthorizeIpcSender;
  paths: Pick<ReturnType<typeof createPathAuthority>, "grantNative">;
}) {
  input.ipc.handle(NATIVE_FILE_PATH_CHANNEL, async (event, ...args) => {
    const check = input.authorize(event, ["product", "editor-test"]);
    const value = args.length === 1 ? args[0] : null;
    if (value === null || typeof value !== "object" || !("token" in value) || !("targetPath" in value) ||
        typeof value.token !== "string" || typeof value.targetPath !== "string" || value.targetPath.length === 0) denyPathAuthority();
    const revoke = await input.paths.grantNative(event.sender, value.token, value.targetPath);
    try { check(); } catch (error) { revoke(); throw error; }
  });
}
