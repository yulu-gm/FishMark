import { describe, expect, it, vi } from "vitest";

import { importClipboardImage } from "./clipboard-image-import";

describe("importClipboardImage", () => {
  it("writes a PNG from the clipboard into sibling assets and returns relative-path markdown", async () => {
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);

    const result = await importClipboardImage(
      {
        documentPath: "C:/notes/today.md"
      },
      {
        clipboard: {
          availableFormats: () => ["text/plain", "image/png"],
          readBuffer: () => Buffer.from([0x89, 0x50, 0x4e, 0x47])
        },
        mkdir,
        writeFile,
        now: () => new Date("2026-04-17T12:46:30.000Z")
      }
    );

    expect(mkdir).toHaveBeenCalledWith("C:/notes/assets", { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(
      "C:/notes/assets/today-image-20260417-124630.png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      { flag: "wx" }
    );
    expect(result).toEqual({
      status: "success",
      markdown: "![today](assets/today-image-20260417-124630.png)",
      storage: "assets",
      filePath: "C:/notes/assets/today-image-20260417-124630.png",
      relativePath: "assets/today-image-20260417-124630.png"
    });
  });

  it("falls back to native image PNG bytes when the advertised image buffer is not an encoded PNG", async () => {
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const invalidAdvertisedPng = Buffer.from([0x28, 0x00, 0x00, 0x00]);
    const encodedNativePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const result = await importClipboardImage(
      {
        documentPath: "C:/notes/today.md"
      },
      {
        clipboard: {
          availableFormats: () => ["image/png"],
          readBuffer: () => invalidAdvertisedPng,
          readImage: () => ({
            isEmpty: () => false,
            toPNG: () => encodedNativePng
          })
        },
        mkdir,
        writeFile,
        now: () => new Date("2026-04-17T12:46:30.000Z")
      } as unknown as Parameters<typeof importClipboardImage>[1]
    );

    expect(writeFile).toHaveBeenCalledWith(
      "C:/notes/assets/today-image-20260417-124630.png",
      encodedNativePng,
      { flag: "wx" }
    );
    expect(result).toEqual({
      status: "success",
      markdown: "![today](assets/today-image-20260417-124630.png)",
      storage: "assets",
      filePath: "C:/notes/assets/today-image-20260417-124630.png",
      relativePath: "assets/today-image-20260417-124630.png"
    });
  });

  it("increments a numeric suffix when the target filename already exists", async () => {
    const writeFile = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("exists"), { code: "EEXIST" }))
      .mockResolvedValueOnce(undefined);

    const result = await importClipboardImage(
      {
        documentPath: "C:/notes/daily-note.md"
      },
      {
        clipboard: {
          availableFormats: () => ["image/png"],
          readBuffer: () => Buffer.from([0x89, 0x50, 0x4e, 0x47])
        },
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile,
        now: () => new Date("2026-04-17T12:46:30.000Z")
      }
    );

    expect(writeFile).toHaveBeenNthCalledWith(
      1,
      "C:/notes/assets/daily-note-image-20260417-124630.png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      { flag: "wx" }
    );
    expect(writeFile).toHaveBeenNthCalledWith(
      2,
      "C:/notes/assets/daily-note-image-20260417-124630-2.png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      { flag: "wx" }
    );
    expect(result).toEqual({
      status: "success",
      markdown: "![daily-note](assets/daily-note-image-20260417-124630-2.png)",
      storage: "assets",
      filePath: "C:/notes/assets/daily-note-image-20260417-124630-2.png",
      relativePath: "assets/daily-note-image-20260417-124630-2.png"
    });
  });

  it("writes images for unsaved documents into the temporary image directory with absolute-path markdown", async () => {
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);

    const result = await importClipboardImage(
      {
        documentPath: null
      },
      {
        clipboard: {
          availableFormats: () => ["image/png"],
          readBuffer: () => Buffer.from([0x89, 0x50, 0x4e, 0x47])
        },
        temporaryDirectory: "D:/FishMark/temp/clipboard-images",
        mkdir,
        writeFile,
        now: () => new Date("2026-04-17T12:46:30.000Z")
      }
    );

    expect(mkdir).toHaveBeenCalledWith("D:/FishMark/temp/clipboard-images", { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(
      "D:/FishMark/temp/clipboard-images/clipboard-image-20260417-124630.png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      { flag: "wx" }
    );
    expect(result).toEqual({
      status: "success",
      markdown: "![image](D:/FishMark/temp/clipboard-images/clipboard-image-20260417-124630.png)",
      storage: "temporary",
      filePath: "D:/FishMark/temp/clipboard-images/clipboard-image-20260417-124630.png",
      relativePath: null
    });
  });

  it("returns an explicit no-image error when the clipboard does not contain a supported image", async () => {
    const result = await importClipboardImage(
      {
        documentPath: "C:/notes/today.md"
      },
      {
        clipboard: {
          availableFormats: () => ["text/plain"],
          readBuffer: () => Buffer.alloc(0)
        },
        mkdir: vi.fn(),
        writeFile: vi.fn()
      }
    );

    expect(result).toEqual({
      status: "error",
      error: {
        code: "no-image",
        message: "Clipboard does not contain a supported image."
      }
    });
  });

  it("rejects oversized clipboard images before writing files", async () => {
    const oversizedPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      Buffer.alloc(10 * 1024 * 1024 + 1, 1)
    ]);
    const result = await importClipboardImage(
      {
        documentPath: "C:/notes/today.md"
      },
      {
        clipboard: {
          availableFormats: () => ["image/png"],
          readBuffer: () => oversizedPng
        },
        mkdir: vi.fn(),
        writeFile: vi.fn()
      }
    );

    expect(result).toEqual({
      status: "error",
      error: {
        code: "image-too-large",
        message: "Clipboard image is too large to import."
      }
    });
  });
});
