import { protocol } from "electron";
import { PREVIEW_ASSET_PROTOCOL } from "../shared/preview-asset-url";

// Scheme privileges are global; resource handlers belong exclusively to per-window sessions.
export function registerPreviewAssetScheme(input: { protocol?: Pick<typeof protocol, "registerSchemesAsPrivileged"> } = {}) {
  (input.protocol ?? protocol).registerSchemesAsPrivileged([{
    scheme: PREVIEW_ASSET_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }]);
}
