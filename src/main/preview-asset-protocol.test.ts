import { describe, expect, it, vi } from "vitest";

import { createPreviewAssetResponse } from "./preview-asset-protocol";
import { createPreviewAssetUrl } from "../shared/preview-asset-url";

describe("createPreviewAssetResponse", () => {
  it("serves theme CSS files with a stylesheet content type", async () => {
    const response = await createPreviewAssetResponse(
      createPreviewAssetUrl("D:/notes/themes/terminal-dark/dark/ui.css"),
      {
        readFile: vi.fn().mockResolvedValue(Buffer.from(":root { color: #fff; }", "utf8"))
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/css; charset=utf-8");
    await expect(response.text()).resolves.toContain(":root");
  });

  it("serves local SVG files through the preview asset protocol", async () => {
    const response = await createPreviewAssetResponse(
      createPreviewAssetUrl("D:/notes/assets/logo.svg"),
      {
        readFile: vi.fn().mockResolvedValue(Buffer.from("<svg></svg>", "utf8"))
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    await expect(response.text()).resolves.toBe("<svg></svg>");
  });

  it("returns 404 when the preview asset request omits the local file path", async () => {
    const response = await createPreviewAssetResponse("yulora-asset://preview", {
      readFile: vi.fn()
    });

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toContain("Missing preview asset path");
  });
});
