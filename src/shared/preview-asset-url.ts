export const PREVIEW_ASSET_PROTOCOL = "fishmark-asset";
export const PREVIEW_ASSET_HOST = "preview";

export function createPreviewAssetUrl(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/");
  // A directory base is required for CSS url()/@import dependencies. The host identifies
  // the protocol, never the requesting window or an authorization capability.
  const absolute = normalizedPath.startsWith("//")
    ? `/~unc${normalizedPath}`
    : normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  return `${PREVIEW_ASSET_PROTOCOL}://${PREVIEW_ASSET_HOST}${absolute.split("/").map(encodeURIComponent).join("/")}`;
}
