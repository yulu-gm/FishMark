import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import type {
  ImportClipboardImageInput,
  ImportClipboardImageResult
} from "../shared/clipboard-image-import";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type SupportedClipboardFormat = {
  mimeType: "image/png" | "image/jpeg" | "image/jpg" | "image/webp" | "image/gif";
  extension: "png" | "jpg" | "webp" | "gif";
};

type ClipboardImageDependencies = {
  clipboard: {
    availableFormats: () => string[];
    readBuffer: (format: string) => Buffer;
    readImage?: () => {
      isEmpty: () => boolean;
      toPNG: () => Buffer;
    };
  };
  temporaryDirectory?: string | null;
  mkdir?: typeof mkdir;
  writeFile?: typeof writeFile;
  now?: () => Date;
};

type ImportTarget =
  | {
      storage: "assets";
      directory: string;
      fileBaseName: string;
      markdownAlt: string;
      documentDirectory: string;
    }
  | {
      storage: "temporary";
      directory: string;
      fileBaseName: string;
      markdownAlt: string;
    };

const SUPPORTED_FORMATS: SupportedClipboardFormat[] = [
  { mimeType: "image/png", extension: "png" },
  { mimeType: "image/jpeg", extension: "jpg" },
  { mimeType: "image/jpg", extension: "jpg" },
  { mimeType: "image/webp", extension: "webp" },
  { mimeType: "image/gif", extension: "gif" }
];

export async function importClipboardImage(
  input: ImportClipboardImageInput,
  dependencies: ClipboardImageDependencies
): Promise<ImportClipboardImageResult> {
  const selectedFormat = selectSupportedFormat(dependencies.clipboard.availableFormats());
  const imageFile = readClipboardImageFile(dependencies.clipboard, selectedFormat);

  if (!imageFile) {
    return {
      status: "error",
      error: {
        code: "no-image",
        message: "Clipboard does not contain a supported image."
      }
    };
  }

  if (imageFile.buffer.byteLength > MAX_IMAGE_BYTES) {
    return {
      status: "error",
      error: {
        code: "image-too-large",
        message: "Clipboard image is too large to import."
      }
    };
  }

  const createDirectory = dependencies.mkdir ?? mkdir;
  const writeImageFile = dependencies.writeFile ?? writeFile;
  const timestamp = formatTimestamp((dependencies.now ?? (() => new Date()))());
  const target = resolveImportTarget(input, dependencies.temporaryDirectory);

  if (!target) {
    return {
      status: "error",
      error: {
        code: "write-failed",
        message: "The clipboard image could not be imported."
      }
    };
  }

  await createDirectory(target.directory, { recursive: true });

  let attempt = 1;

  while (true) {
    const candidateName = buildCandidateName({
      baseName: target.fileBaseName,
      extension: imageFile.extension,
      timestamp,
      attempt
    });
    const imagePath = normalizePathForFs(path.join(target.directory, candidateName));

    try {
      await writeImageFile(imagePath, imageFile.buffer, { flag: "wx" });

      const markdownPath =
        target.storage === "assets"
          ? path.relative(target.documentDirectory, imagePath).replace(/\\/g, "/")
          : imagePath;

      return {
        status: "success",
        markdown: `![${target.markdownAlt}](${markdownPath})`,
        storage: target.storage,
        filePath: imagePath,
        relativePath: target.storage === "assets" ? markdownPath : null
      };
    } catch (error) {
      if (isNodeErrorWithCode(error, "EEXIST")) {
        attempt += 1;
        continue;
      }

      return {
        status: "error",
        error: {
          code: "write-failed",
          message: "The clipboard image could not be imported."
        }
      };
    }
  }
}

function resolveImportTarget(
  input: ImportClipboardImageInput,
  temporaryDirectory: string | null | undefined
): ImportTarget | null {
  if (input.documentPath) {
    const parsedDocumentPath = path.parse(input.documentPath);
    const documentBaseName = sanitizeBaseName(parsedDocumentPath.name || "image");

    return {
      storage: "assets",
      directory: normalizePathForFs(path.join(parsedDocumentPath.dir, "assets")),
      fileBaseName: documentBaseName,
      markdownAlt: documentBaseName,
      documentDirectory: parsedDocumentPath.dir
    };
  }

  if (!temporaryDirectory) {
    return null;
  }

  return {
    storage: "temporary",
    directory: normalizePathForFs(temporaryDirectory),
    fileBaseName: "clipboard",
    markdownAlt: "image"
  };
}

function readClipboardImageFile(
  clipboard: ClipboardImageDependencies["clipboard"],
  selectedFormat: SupportedClipboardFormat | null
): { buffer: Buffer; extension: SupportedClipboardFormat["extension"] } | null {
  if (selectedFormat) {
    const imageBuffer = clipboard.readBuffer(selectedFormat.mimeType);

    if (isEncodedImageBuffer(imageBuffer, selectedFormat.extension)) {
      return {
        buffer: imageBuffer,
        extension: selectedFormat.extension
      };
    }
  }

  const nativeImage = clipboard.readImage?.();

  if (!nativeImage || nativeImage.isEmpty()) {
    return null;
  }

  const encodedPng = nativeImage.toPNG();

  if (!isEncodedImageBuffer(encodedPng, "png")) {
    return null;
  }

  return {
    buffer: encodedPng,
    extension: "png"
  };
}

function isEncodedImageBuffer(buffer: Buffer, extension: SupportedClipboardFormat["extension"]): boolean {
  if (buffer.byteLength === 0) {
    return false;
  }

  switch (extension) {
    case "png":
      return buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    case "jpg":
      return (
        buffer.byteLength >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
      );
    case "webp":
      return (
        buffer.byteLength >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
      );
    case "gif": {
      const signature = buffer.subarray(0, 6).toString("ascii");
      return signature === "GIF87a" || signature === "GIF89a";
    }
  }
}

function selectSupportedFormat(availableFormats: string[]): SupportedClipboardFormat | null {
  const normalizedFormats = new Set(availableFormats.map((entry) => entry.toLowerCase()));

  for (const format of SUPPORTED_FORMATS) {
    if (normalizedFormats.has(format.mimeType)) {
      return format;
    }
  }

  return null;
}

function buildCandidateName(input: {
  baseName: string;
  timestamp: string;
  extension: string;
  attempt: number;
}): string {
  const suffix = input.attempt === 1 ? "" : `-${input.attempt}`;
  return `${input.baseName}-image-${input.timestamp}${suffix}.${input.extension}`;
}

function sanitizeBaseName(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "image";
}

function formatTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join("") + `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

function normalizePathForFs(targetPath: string): string {
  return targetPath.replace(/\\/g, "/");
}

function isNodeErrorWithCode(error: unknown, expectedCode: string): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as NodeJS.ErrnoException).code === "string" &&
    (error as NodeJS.ErrnoException).code === expectedCode
  );
}
