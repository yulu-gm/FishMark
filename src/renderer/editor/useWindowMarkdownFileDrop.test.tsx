// @vitest-environment jsdom

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getDroppedMarkdownPaths, useWindowMarkdownFileDrop } from "./useWindowMarkdownFileDrop";

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
  it("reports a rejected native grant and retains the remaining valid paths in original deduplicated order", async () => {
    const reportError = vi.fn();
    const files = [new File([""], "a.md"), new File([""], "lost.md"), new File([""], "b.md"), new File([""], "a.md")];
    const getPath = vi.fn(async (file: File) => {
      if (file.name === "lost.md") throw new Error("native grant lost");
      return `C:/notes/${file.name}`;
    });
    await expect(getDroppedMarkdownPaths(getPath, { files } as unknown as DataTransfer, reportError)).resolves.toEqual(["C:/notes/a.md", "C:/notes/b.md"]);
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "native grant lost" }));
  });
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
      reportError: vi.fn(),
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
