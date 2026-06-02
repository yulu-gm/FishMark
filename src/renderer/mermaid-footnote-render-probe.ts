import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/editor-source.css";
import "./styles/markdown-render.css";

import { createCodeEditorController } from "./code-editor";
import SAMPLE_MARKDOWN from "../../fixtures/test-harness/mermaid-footnote-math.md?raw";

type MermaidFootnoteRenderProbeResult = {
  details: {
    fallbackMermaidText: string;
    footnoteLabels: string[];
    inlineMathPreviewCount: number;
    loadingMermaidPreviewCount: number;
    blockMathPreviewCount: number;
    blockMathRenderedCount: number;
    mermaidPreviewCount: number;
    renderedMermaidText: string;
    validMermaidHasSvg: boolean;
  };
  failures: string[];
  pass: boolean;
};

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextFrame();
}

async function waitForProbeResult(root: HTMLElement): Promise<MermaidFootnoteRenderProbeResult> {
  const deadline = performance.now() + 10_000;
  let latest = collectProbeResult(root);

  while (performance.now() < deadline) {
    latest = collectProbeResult(root);

    if (latest.pass) {
      return latest;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 100));
    await settle();
  }

  return latest;
}

function collectProbeResult(root: HTMLElement): MermaidFootnoteRenderProbeResult {
  const mermaidPreviews = Array.from(root.querySelectorAll<HTMLElement>(".cm-mermaid-preview"));
  const renderedMermaidPreview = mermaidPreviews.find((preview) => preview.querySelector("svg") !== null) ?? null;
  const fallbackMermaidPreview =
    mermaidPreviews.find((preview) => preview.classList.contains("cm-mermaid-preview-fallback")) ?? null;
  const footnoteReferences = Array.from(
    root.querySelectorAll<HTMLElement>(".cm-footnote-reference-preview")
  );
  const inlineMathPreviews = Array.from(root.querySelectorAll<HTMLElement>(".cm-math-preview-inline"));
  const blockMathPreviews = Array.from(root.querySelectorAll<HTMLElement>(".cm-math-preview-block"));
  const footnoteLabels = footnoteReferences.map((reference) => reference.textContent ?? "");
  const details = {
    fallbackMermaidText: fallbackMermaidPreview?.textContent ?? "",
    footnoteLabels,
    inlineMathPreviewCount: inlineMathPreviews.length,
    loadingMermaidPreviewCount: mermaidPreviews.filter((preview) =>
      preview.classList.contains("cm-mermaid-preview-loading")
    ).length,
    blockMathPreviewCount: blockMathPreviews.length,
    blockMathRenderedCount: blockMathPreviews.filter((preview) => preview.querySelector(".katex") !== null).length,
    mermaidPreviewCount: mermaidPreviews.length,
    renderedMermaidText: renderedMermaidPreview?.textContent ?? "",
    validMermaidHasSvg: renderedMermaidPreview !== null
  };
  const failures: string[] = [];

  if (details.mermaidPreviewCount !== 2) {
    failures.push(`expected two Mermaid preview containers; got ${details.mermaidPreviewCount}`);
  }

  if (!details.validMermaidHasSvg) {
    failures.push("valid Mermaid preview did not render an SVG");
  }

  if (details.inlineMathPreviewCount < 1) {
    failures.push("inline math preview widget did not render");
  }

  if (details.blockMathPreviewCount !== 1 || details.blockMathRenderedCount !== 1) {
    failures.push(
      `expected one rendered block math preview; got ${details.blockMathRenderedCount}/${details.blockMathPreviewCount}`
    );
  }

  if (details.loadingMermaidPreviewCount > 0) {
    failures.push(`Mermaid previews are still loading: ${details.loadingMermaidPreviewCount}`);
  }

  if (details.renderedMermaidText.includes("```mermaid")) {
    failures.push("valid Mermaid source fence is still visible inside the SVG preview");
  }

  if (!details.fallbackMermaidText.includes("```mermaid") || !details.fallbackMermaidText.includes("A -->")) {
    failures.push("invalid Mermaid preview did not fall back to the original source fence");
  }

  if (footnoteLabels.length !== 2 || footnoteLabels.some((label) => label !== "1")) {
    failures.push(`expected two rendered footnote reference widgets labelled 1; got [${footnoteLabels.join(", ")}]`);
  }

  return {
    details,
    failures,
    pass: failures.length === 0
  };
}

export async function runMermaidFootnoteRenderProbe(): Promise<MermaidFootnoteRenderProbeResult> {
  document.body.style.margin = "0";
  document.body.style.width = "100vw";
  document.body.style.minHeight = "100vh";
  document.body.style.background = "#f7f6f2";

  const root = document.getElementById("probe-root");
  if (!(root instanceof HTMLElement)) {
    throw new Error("Missing probe root.");
  }

  root.className = "document-editor";
  root.style.boxSizing = "border-box";
  root.style.width = "980px";
  root.style.minHeight = "720px";
  root.style.margin = "0 auto";
  root.style.padding = "64px 0";
  root.style.setProperty("--fishmark-document-font-family", "Georgia, 'Times New Roman', serif");
  root.style.setProperty("--fishmark-document-font-size", "17px");

  const controller = createCodeEditorController({
    parent: root,
    initialContent: SAMPLE_MARKDOWN,
    onChange: () => undefined
  });

  const trailingLineOffset = SAMPLE_MARKDOWN.indexOf("结尾行");
  controller.setSelection(trailingLineOffset);
  controller.focus();
  await settle();

  const result = await waitForProbeResult(root);

  return result;
}

Object.assign(window, {
  __runFishmarkMermaidFootnoteRenderProbe: runMermaidFootnoteRenderProbe
});
