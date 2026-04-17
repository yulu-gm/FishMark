import path from "node:path";
import { readFile as readFileFromDisk } from "node:fs/promises";

import { protocol } from "electron";

import {
  PREVIEW_ASSET_HOST,
  PREVIEW_ASSET_PROTOCOL
} from "../shared/preview-asset-url";

type PreviewAssetProtocolDependencies = {
  protocol?: {
    handle: (scheme: string, handler: (request: { url: string }) => Response | Promise<Response>) => void;
    registerSchemesAsPrivileged: (
      customSchemes: Array<{
        scheme: string;
        privileges: Record<string, boolean>;
      }>
    ) => void;
  };
  readFile?: (filePath: string) => Promise<Buffer>;
};

export function registerPreviewAssetScheme(
  dependencies: Pick<PreviewAssetProtocolDependencies, "protocol"> = {}
): void {
  (dependencies.protocol ?? protocol).registerSchemesAsPrivileged([
    {
      scheme: PREVIEW_ASSET_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ]);
}

export function registerPreviewAssetProtocol(
  dependencies: PreviewAssetProtocolDependencies = {}
): void {
  const protocolApi = dependencies.protocol ?? protocol;
  const readFile = dependencies.readFile ?? readFileFromDisk;

  protocolApi.handle(PREVIEW_ASSET_PROTOCOL, (request) =>
    createPreviewAssetResponse(request.url, { readFile })
  );
}

export async function createPreviewAssetResponse(
  requestUrl: string,
  dependencies: Pick<PreviewAssetProtocolDependencies, "readFile"> = {}
): Promise<Response> {
  const readFile = dependencies.readFile ?? readFileFromDisk;

  let filePath: string;

  try {
    filePath = resolvePreviewAssetFilePath(requestUrl);
  } catch (error) {
    return createTextResponse(
      404,
      error instanceof Error ? error.message : "Invalid preview asset request."
    );
  }

  try {
    const fileBuffer = await readFile(filePath);
    return new Response(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "content-type": resolvePreviewAssetContentType(filePath),
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException | undefined)?.code;
    return createTextResponse(
      errorCode === "ENOENT" ? 404 : 500,
      errorCode === "ENOENT"
        ? `Preview asset not found: ${filePath}`
        : `Failed to read preview asset: ${filePath}`
    );
  }
}

function resolvePreviewAssetFilePath(requestUrl: string): string {
  const url = new URL(requestUrl);

  if (url.protocol !== `${PREVIEW_ASSET_PROTOCOL}:` || url.hostname !== PREVIEW_ASSET_HOST) {
    throw new Error("Invalid preview asset request.");
  }

  const filePath = url.searchParams.get("path")?.replace(/\\/g, "/");

  if (!filePath) {
    throw new Error("Missing preview asset path.");
  }

  if (!isAbsolutePreviewAssetPath(filePath)) {
    throw new Error("Preview asset path must be absolute.");
  }

  return filePath;
}

function isAbsolutePreviewAssetPath(filePath: string): boolean {
  return path.isAbsolute(filePath) || /^[a-zA-Z]:\//.test(filePath) || filePath.startsWith("//");
}

function resolvePreviewAssetContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".bmp":
      return "image/bmp";
    case ".ico":
      return "image/x-icon";
    case ".avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}

function createTextResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8"
    }
  });
}
