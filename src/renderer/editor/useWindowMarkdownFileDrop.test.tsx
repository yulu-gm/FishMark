// @vitest-environment jsdom

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWindowMarkdownFileDrop } from "./useWindowMarkdownFileDrop";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderDropProbe(input: Parameters<typeof useWindowMarkdownFileDrop>[0]): {
  root: Root;
  container: HTMLDivElement;
} {
  const container = document.createElement("div");
  const root = createRoot(container);

  function Probe(): null {
    useWindowMarkdownFileDrop(input);
    return null;
  }

  act(() => {
    root.render(createElement(Probe));
  });

  return { root, container };
}

function createDroppedMarkdownFile(fileName: string, targetPath: string): File {
  const file = new File(["content"], fileName, { type: "text/markdown" });
  Object.defineProperty(file, "path", {
    value: targetPath
  });
  return file;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useWindowMarkdownFileDrop", () => {
  it("opens one dropped file batch instead of replaying single-file opens", async () => {
    const openMarkdownFromPaths = vi.fn(async () => {});
    const fishmark = {
      getPathForDroppedFile: vi.fn((file: File) => (file as File & { path?: string }).path ?? ""),
      handleDroppedMarkdownFile: vi.fn(async () => ({
        disposition: "open-in-place" as const
      }))
    } as unknown as Window["fishmark"];

    const { root } = renderDropProbe({
      getPathForDroppedFile: fishmark.getPathForDroppedFile,
      dropMarkdownFiles: openMarkdownFromPaths
    });
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as unknown as DragEvent;

    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        files: [
          createDroppedMarkdownFile("alpha.md", "C:/notes/alpha.md"),
          createDroppedMarkdownFile("beta.md", "C:/notes/beta.md")
        ] as unknown as FileList
      }
    });

    await act(async () => {
      window.dispatchEvent(dropEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(openMarkdownFromPaths).toHaveBeenCalledWith(["C:/notes/alpha.md", "C:/notes/beta.md"]);

    act(() => {
      root.unmount();
    });
  });
});
