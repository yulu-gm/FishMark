import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/editor-source.css";
import "./styles/markdown-render.css";
import "./theme-packages/default/tokens/light.css";
import "./theme-packages/default/styles/markdown.css";

import { createCodeEditorController } from "./code-editor";

type StyleSnapshot = {
  backgroundColor: string;
  borderBottomColor: string;
  borderBottomStyle: string;
  borderBottomWidth: string;
  borderBottomLeftRadius: string;
  borderBottomRightRadius: string;
  borderLeftColor: string;
  borderLeftStyle: string;
  borderLeftWidth: string;
  borderRightColor: string;
  borderRightStyle: string;
  borderRightWidth: string;
  borderTopColor: string;
  borderTopStyle: string;
  borderTopWidth: string;
  borderTopLeftRadius: string;
  borderTopRightRadius: string;
  boxShadow: string;
  color: string;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  marginBottom: string;
  marginTop: string;
  paddingBottom: string;
  paddingLeft: string;
  paddingRight: string;
  paddingTop: string;
};

type GeometrySnapshot = {
  blockLeft: number;
  blockTop: number;
  contentInset: number;
  contentLeft: number;
  height: number;
  width: number;
};

type TextRectSnapshot = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type BlockquoteTyporaVisualProbeResult = {
  details: {
    fishmark: {
      codeBlockAfterContent: string;
      codeBlockGeometry: GeometrySnapshot | null;
      codeLineCount: number;
      codeBlockStyle: StyleSnapshot | null;
      firstLineGeometry: GeometrySnapshot;
      firstLineStyle: StyleSnapshot;
      lineCount: number;
      listLineCount: number;
      mathBlockGeometry: GeometrySnapshot | null;
      mathRenderedGeometry: GeometrySnapshot | null;
      mathBlockStyle: StyleSnapshot | null;
      mathLineCount: number;
      mathRenderedCount: number;
      textRects: Record<string, TextRectSnapshot | null>;
    };
    reference: {
      codeBlockGeometry: GeometrySnapshot | null;
      codeBlockStyle: StyleSnapshot | null;
      geometry: GeometrySnapshot;
      mathBlockGeometry: GeometrySnapshot | null;
      mathBlockStyle: StyleSnapshot | null;
      textRects: Record<string, TextRectSnapshot | null>;
      style: StyleSnapshot;
    };
  };
  failures: string[];
  pass: boolean;
};

const SAMPLE_MARKDOWN = [
  "# Markdown 编辑器复杂能力与性能测试样例",
  "",
  "> 目标：覆盖 **Markdown 原生语法**、常见扩展语法、LaTeX 数学公式、Mermaid 图表、脚注、HTML 混排、长文档性能压力测试等。",
  ">",
  "> 说明：不同编辑器对 GFM、脚注、Mermaid、LaTeX、HTML 的支持差异很大。本文档故意包含简单样例和复杂样例，也包含边界情况。",
  ">",
  "> - 引用内列表需要和外部列表一样渲染",
  ">   - 引用内列表子项需要保留外部列表缩进",
  "> - 引用内也保留 **加粗** 和 `inline code`",
  ">",
  "> 第一层引用",
  ">",
  "> > 第二层引用",
  "> > - 二层列表父项",
  "> >   - 二层列表子项",
  ">",
  "> > > 第三层引用",
  ">",
  "> ```ts",
  '> const label = "quote";',
  "> ```",
  ">",
  "> $$",
  "> E = mc^2",
  "> $$",
  "",
  "普通段落用于让引用块保持非激活渲染。"
].join("\n");

const PROBE_STYLES = `
  .blockquote-typora-probe-shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 28px;
    box-sizing: border-box;
    min-height: 100vh;
    padding: 28px;
    background: #ffffff;
  }

  .blockquote-typora-probe-panel {
    min-width: 0;
  }

  .blockquote-typora-probe-panel > h2 {
    margin: 0 0 12px;
    color: #667085;
    font: 600 12px/1.4 "Helvetica Neue", Helvetica, Arial, sans-serif;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  #fishmark-editor {
    height: 790px;
    border: 1px solid #eeeeee;
    background: #ffffff;
    overflow: hidden;
  }

  #fishmark-editor .cm-content {
    padding: 30px;
  }

  .typora-reference-doc {
    box-sizing: border-box;
    height: 790px;
    padding: 30px;
    border: 1px solid #eeeeee;
    background: #ffffff;
    color: rgb(51, 51, 51);
    font-family: "Open Sans", "Clear Sans", "Helvetica Neue", Helvetica, Arial, "Segoe UI Emoji", "SF Pro", sans-serif;
    font-size: 16px;
    line-height: 1.6;
    overflow: hidden;
  }

  .typora-reference-doc h1 {
    position: relative;
    margin-top: 1rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid #eeeeee;
    color: rgb(51, 51, 51);
    font-size: 2.25em;
    font-weight: 700;
    line-height: 1.2;
  }

  .typora-reference-doc p,
  .typora-reference-doc blockquote,
  .typora-reference-doc ul,
  .typora-reference-doc ol,
  .typora-reference-doc pre,
  .typora-reference-doc .typora-reference-math {
    margin: 0.8em 0;
  }

  .typora-reference-doc ul,
  .typora-reference-doc ol {
    padding-left: 30px;
  }

  .typora-reference-doc blockquote {
    border-left: 4px solid #dfe2e5;
    padding: 0 15px;
    color: #777777;
    background: transparent;
    box-shadow: none;
    border-radius: 0;
  }

  .typora-reference-doc blockquote blockquote {
    padding-right: 0;
  }

  .typora-reference-doc blockquote > :first-child {
    margin-top: 0;
  }

  .typora-reference-doc blockquote > :last-child {
    margin-bottom: 0;
  }

  .typora-reference-doc blockquote code,
  .typora-reference-doc blockquote pre {
    font-family: "Lucida Console", Consolas, Courier, monospace;
  }

  .typora-reference-doc blockquote code {
    font-size: 85%;
  }

  .typora-reference-doc blockquote pre {
    margin-top: 15px;
    margin-bottom: 0;
    padding: 8px 4px 6px;
    border: 1px solid #e7eaed;
    border-radius: 3px;
    background: #f8f8f8;
    color: #777777;
    font-size: 0.9em;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .typora-reference-math {
    padding: 0.8em 0 0;
    background: transparent;
    color: #777777;
    line-height: 1.6;
    text-align: center;
  }
`;

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

async function waitForProbeResult(root: HTMLElement): Promise<BlockquoteTyporaVisualProbeResult> {
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

function renderReference(root: HTMLElement): void {
  root.innerHTML = [
    '<article class="typora-reference-doc">',
    "<h1>Markdown 编辑器复杂能力与性能测试样例</h1>",
    '<blockquote class="typora-reference-blockquote">',
    "<p>目标：覆盖 <strong>Markdown 原生语法</strong>、常见扩展语法、LaTeX 数学公式、Mermaid 图表、脚注、HTML 混排、长文档性能压力测试等。</p>",
    "<p>说明：不同编辑器对 GFM、脚注、Mermaid、LaTeX、HTML 的支持差异很大。本文档故意包含简单样例和复杂样例，也包含边界情况。</p>",
    "<ul>",
    "<li>引用内列表需要和外部列表一样渲染<ul><li>引用内列表子项需要保留外部列表缩进</li></ul></li>",
    "<li>引用内也保留 <strong>加粗</strong> 和 <code>inline code</code></li>",
    "</ul>",
    "<p>第一层引用</p>",
    "<blockquote>",
    "<p>第二层引用</p>",
    "<ul><li>二层列表父项<ul><li>二层列表子项</li></ul></li></ul>",
    "<blockquote><p>第三层引用</p></blockquote>",
    "</blockquote>",
    '<pre><code>const label = "quote";</code></pre>',
    '<div class="typora-reference-math">E = mc²</div>',
    "</blockquote>",
    "</article>"
  ].join("");
}

function takeStyleSnapshot(element: HTMLElement, pseudoElement?: string): StyleSnapshot {
  const style = getComputedStyle(element, pseudoElement);
  return {
    backgroundColor: style.backgroundColor,
    borderBottomColor: style.borderBottomColor,
    borderBottomStyle: style.borderBottomStyle,
    borderBottomWidth: style.borderBottomWidth,
    borderBottomLeftRadius: style.borderBottomLeftRadius,
    borderBottomRightRadius: style.borderBottomRightRadius,
    borderLeftColor: style.borderLeftColor,
    borderLeftStyle: style.borderLeftStyle,
    borderLeftWidth: style.borderLeftWidth,
    borderRightColor: style.borderRightColor,
    borderRightStyle: style.borderRightStyle,
    borderRightWidth: style.borderRightWidth,
    borderTopColor: style.borderTopColor,
    borderTopStyle: style.borderTopStyle,
    borderTopWidth: style.borderTopWidth,
    borderTopLeftRadius: style.borderTopLeftRadius,
    borderTopRightRadius: style.borderTopRightRadius,
    boxShadow: style.boxShadow,
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    marginBottom: style.marginBottom,
    marginTop: style.marginTop,
    paddingBottom: style.paddingBottom,
    paddingLeft: style.paddingLeft,
    paddingRight: style.paddingRight,
    paddingTop: style.paddingTop
  };
}

function firstVisibleTextRect(element: HTMLElement): DOMRect {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();

  while (textNode !== null) {
    const text = textNode.textContent ?? "";
    const visibleIndex = text.search(/\S/);
    if (visibleIndex >= 0) {
      const range = document.createRange();
      range.setStart(textNode, visibleIndex);
      range.setEnd(textNode, Math.min(text.length, visibleIndex + 1));
      const rect = range.getBoundingClientRect();
      range.detach();
      if (rect.width > 0 || rect.height > 0) {
        return rect;
      }
    }
    textNode = walker.nextNode();
  }

  throw new Error("Unable to find visible text for geometry measurement.");
}

function takeGeometrySnapshot(element: HTMLElement): GeometrySnapshot {
  const blockRect = element.getBoundingClientRect();
  const contentRect = firstVisibleTextRect(element);
  return {
    blockLeft: round(blockRect.left),
    blockTop: round(blockRect.top),
    contentInset: round(contentRect.left - blockRect.left),
    contentLeft: round(contentRect.left),
    height: round(blockRect.height),
    width: round(blockRect.width)
  };
}

function findTextRect(root: HTMLElement, text: string): DOMRect | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();

  while (textNode !== null) {
    const value = textNode.textContent ?? "";
    const index = value.indexOf(text);
    if (index >= 0) {
      const range = document.createRange();
      range.setStart(textNode, index);
      range.setEnd(textNode, index + text.length);
      const rect = range.getBoundingClientRect();
      range.detach();

      if (rect.width > 0 || rect.height > 0) {
        return rect;
      }
    }

    textNode = walker.nextNode();
  }

  return null;
}

function takeTextRectSnapshot(root: HTMLElement, text: string): TextRectSnapshot | null {
  const rect = findTextRect(root, text);

  if (rect === null) {
    return null;
  }

  return {
    height: round(rect.height),
    left: round(rect.left),
    top: round(rect.top),
    width: round(rect.width)
  };
}

function collectTextRects(root: HTMLElement, labels: readonly string[]): Record<string, TextRectSnapshot | null> {
  const rects: Record<string, TextRectSnapshot | null> = {};

  for (const label of labels) {
    rects[label] = takeTextRectSnapshot(root, label);
  }

  return rects;
}

function takeInsetSurfaceGeometry(element: HTMLElement, contentInsetPx: number, rightInsetPx: number): GeometrySnapshot {
  const blockRect = element.getBoundingClientRect();
  const contentRect = firstVisibleTextRect(element);
  const blockLeft = contentRect.left - contentInsetPx;
  const width = blockRect.right - rightInsetPx - blockLeft;

  return {
    blockLeft: round(blockLeft),
    blockTop: round(blockRect.top),
    contentInset: round(contentInsetPx),
    contentLeft: round(contentRect.left),
    height: round(blockRect.height),
    width: round(width)
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function px(value: string): number {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function isTransparent(color: string): boolean {
  return color === "transparent" || color === "rgba(0, 0, 0, 0)";
}

function within(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

function compareTextLeftDelta(
  failures: string[],
  fishmarkRects: Record<string, TextRectSnapshot | null>,
  referenceRects: Record<string, TextRectSnapshot | null>,
  label: string,
  baselineLabel: string,
  tolerance: number
): void {
  const fishmarkRect = fishmarkRects[label];
  const fishmarkBaseline = fishmarkRects[baselineLabel];
  const referenceRect = referenceRects[label];
  const referenceBaseline = referenceRects[baselineLabel];

  if (!fishmarkRect || !fishmarkBaseline || !referenceRect || !referenceBaseline) {
    failures.push(`expected measurable text rects for ${baselineLabel} -> ${label}`);
    return;
  }

  const fishmarkDelta = fishmarkRect.left - fishmarkBaseline.left;
  const referenceDelta = referenceRect.left - referenceBaseline.left;

  if (!within(fishmarkDelta, referenceDelta, tolerance)) {
    failures.push(
      `expected ${label} left delta ${round(referenceDelta)}px from ${baselineLabel}; got ${round(fishmarkDelta)}px`
    );
  }
}

function compareTextLeftDeltaToExpected(
  failures: string[],
  fishmarkRects: Record<string, TextRectSnapshot | null>,
  label: string,
  baselineLabel: string,
  expectedDelta: number,
  tolerance: number
): void {
  const fishmarkRect = fishmarkRects[label];
  const fishmarkBaseline = fishmarkRects[baselineLabel];

  if (!fishmarkRect || !fishmarkBaseline) {
    failures.push(`expected measurable text rects for ${baselineLabel} -> ${label}`);
    return;
  }

  const fishmarkDelta = fishmarkRect.left - fishmarkBaseline.left;

  if (!within(fishmarkDelta, expectedDelta, tolerance)) {
    failures.push(
      `expected ${label} left delta ${round(expectedDelta)}px from ${baselineLabel}; got ${round(fishmarkDelta)}px`
    );
  }
}

function installProbeStyles(): void {
  if (document.getElementById("blockquote-typora-probe-styles") !== null) {
    return;
  }

  const style = document.createElement("style");
  style.id = "blockquote-typora-probe-styles";
  style.textContent = PROBE_STYLES;
  document.head.append(style);
}

function collectProbeResult(root: HTMLElement): BlockquoteTyporaVisualProbeResult {
  const fishmarkRoot = root.querySelector<HTMLElement>("#fishmark-editor");
  const referenceBlockquote = root.querySelector<HTMLElement>(".typora-reference-blockquote");
  if (!(fishmarkRoot instanceof HTMLElement) || !(referenceBlockquote instanceof HTMLElement)) {
    throw new Error("Probe roots were not created.");
  }

  const measuredTextLabels = [
    "第一层引用",
    "第二层引用",
    "第三层引用",
    "引用内列表需要和外部列表一样渲染",
    "引用内列表子项需要保留外部列表缩进",
    "二层列表父项",
    "二层列表子项"
  ] as const;
  const quoteLines = Array.from(fishmarkRoot.querySelectorAll<HTMLElement>(".cm-inactive-blockquote"));
  const firstQuoteLine = quoteLines[0];
  const fishmarkCodeBlock = fishmarkRoot.querySelector<HTMLElement>(".cm-inactive-blockquote.cm-inactive-code-block");
  const fishmarkMathBlock = fishmarkRoot.querySelector<HTMLElement>(".cm-math-preview-block");
  const fishmarkRenderedMath = fishmarkRoot.querySelector<HTMLElement>(".cm-math-preview-block .katex");
  const referenceCodeBlock = root.querySelector<HTMLElement>(".typora-reference-blockquote pre");
  const referenceMathBlock = root.querySelector<HTMLElement>(".typora-reference-math");
  if (!(firstQuoteLine instanceof HTMLElement)) {
    throw new Error("FishMark did not render inactive blockquote lines.");
  }

  const fishmarkStyle = takeStyleSnapshot(firstQuoteLine);
  const referenceStyle = takeStyleSnapshot(referenceBlockquote);
  const fishmarkCodeElementStyle = fishmarkCodeBlock ? takeStyleSnapshot(fishmarkCodeBlock) : null;
  const fishmarkCodeSurfaceStyle = fishmarkCodeBlock ? takeStyleSnapshot(fishmarkCodeBlock, "::after") : null;
  const referenceCodeStyle = referenceCodeBlock ? takeStyleSnapshot(referenceCodeBlock) : null;
  const fishmarkMathStyle = fishmarkMathBlock ? takeStyleSnapshot(fishmarkMathBlock) : null;
  const referenceMathStyle = referenceMathBlock ? takeStyleSnapshot(referenceMathBlock) : null;
  const fishmarkGeometry = takeGeometrySnapshot(firstQuoteLine);
  const referenceGeometry = takeGeometrySnapshot(referenceBlockquote);
  const referenceCodeGeometry = referenceCodeBlock ? takeGeometrySnapshot(referenceCodeBlock) : null;
  const fishmarkMathGeometry = fishmarkMathBlock ? takeGeometrySnapshot(fishmarkMathBlock) : null;
  const fishmarkRenderedMathGeometry = fishmarkRenderedMath ? takeGeometrySnapshot(fishmarkRenderedMath) : null;
  const referenceMathGeometry = referenceMathBlock ? takeGeometrySnapshot(referenceMathBlock) : null;
  const fishmarkTextRects = collectTextRects(fishmarkRoot, measuredTextLabels);
  const referenceTextRects = collectTextRects(referenceBlockquote, measuredTextLabels);
  const fishmarkCodeGeometry =
    fishmarkCodeBlock && referenceCodeGeometry
      ? takeInsetSurfaceGeometry(fishmarkCodeBlock, referenceCodeGeometry.contentInset, px(referenceStyle.paddingRight))
      : null;
  const failures: string[] = [];

  if (quoteLines.length < 10) {
    failures.push(`expected a multi-block quote rendering; got ${quoteLines.length} quote lines`);
  }

  if (!isTransparent(fishmarkStyle.backgroundColor)) {
    failures.push(`expected transparent quote background; got ${fishmarkStyle.backgroundColor}`);
  }

  if (fishmarkStyle.boxShadow !== "none") {
    failures.push(`expected no inset/card shadow; got ${fishmarkStyle.boxShadow}`);
  }

  if (!within(px(fishmarkStyle.borderLeftWidth), px(referenceStyle.borderLeftWidth), 0.5)) {
    failures.push(
      `expected ${referenceStyle.borderLeftWidth} left rail; got ${fishmarkStyle.borderLeftWidth}`
    );
  }

  if (fishmarkStyle.borderLeftStyle !== referenceStyle.borderLeftStyle) {
    failures.push(
      `expected ${referenceStyle.borderLeftStyle} left rail style; got ${fishmarkStyle.borderLeftStyle}`
    );
  }

  if (fishmarkStyle.borderLeftColor !== referenceStyle.borderLeftColor) {
    failures.push(
      `expected quote rail ${referenceStyle.borderLeftColor}; got ${fishmarkStyle.borderLeftColor}`
    );
  }

  if (fishmarkStyle.color !== referenceStyle.color) {
    failures.push(`expected quote text ${referenceStyle.color}; got ${fishmarkStyle.color}`);
  }

  if (!within(px(fishmarkStyle.lineHeight), px(referenceStyle.lineHeight), 0.5)) {
    failures.push(`expected ${referenceStyle.lineHeight} line-height; got ${fishmarkStyle.lineHeight}`);
  }

  if (!within(px(fishmarkStyle.paddingLeft), px(referenceStyle.paddingLeft), 1.5)) {
    failures.push(`expected ${referenceStyle.paddingLeft} left padding; got ${fishmarkStyle.paddingLeft}`);
  }

  if (!within(px(fishmarkStyle.paddingRight), px(referenceStyle.paddingRight), 1.5)) {
    failures.push(`expected ${referenceStyle.paddingRight} right padding; got ${fishmarkStyle.paddingRight}`);
  }

  if (px(fishmarkStyle.borderTopLeftRadius) > 0.5 || px(fishmarkStyle.borderBottomLeftRadius) > 0.5) {
    failures.push(
      `expected square quote rail corners; got ${fishmarkStyle.borderTopLeftRadius}/${fishmarkStyle.borderBottomLeftRadius}`
    );
  }

  if (!within(fishmarkGeometry.contentInset, referenceGeometry.contentInset, 1.5)) {
    failures.push(
      `expected content inset ${referenceGeometry.contentInset}px; got ${fishmarkGeometry.contentInset}px`
    );
  }

  const details = {
    fishmark: {
      codeBlockAfterContent: fishmarkCodeBlock
        ? getComputedStyle(fishmarkCodeBlock, "::after").content
        : "",
      codeBlockGeometry: fishmarkCodeGeometry,
      codeLineCount: fishmarkRoot.querySelectorAll(".cm-inactive-blockquote.cm-inactive-code-block").length,
      codeBlockStyle: fishmarkCodeSurfaceStyle,
      firstLineGeometry: fishmarkGeometry,
      firstLineStyle: fishmarkStyle,
      lineCount: quoteLines.length,
      listLineCount: fishmarkRoot.querySelectorAll(".cm-inactive-blockquote.cm-inactive-list").length,
      mathBlockGeometry: fishmarkMathGeometry,
      mathRenderedGeometry: fishmarkRenderedMathGeometry,
      mathBlockStyle: fishmarkMathStyle,
      mathLineCount: fishmarkRoot.querySelectorAll(".cm-math-preview-block").length,
      mathRenderedCount: fishmarkRoot.querySelectorAll(".cm-math-preview-block .katex").length,
      textRects: fishmarkTextRects
    },
    reference: {
      codeBlockGeometry: referenceCodeGeometry,
      codeBlockStyle: referenceCodeStyle,
      geometry: referenceGeometry,
      mathBlockGeometry: referenceMathGeometry,
      mathBlockStyle: referenceMathStyle,
      textRects: referenceTextRects,
      style: referenceStyle
    }
  };

  compareTextLeftDelta(failures, fishmarkTextRects, referenceTextRects, "第二层引用", "第一层引用", 2);
  compareTextLeftDelta(failures, fishmarkTextRects, referenceTextRects, "第三层引用", "第一层引用", 2);
  const expectedListNestedIndent = px(fishmarkStyle.fontSize) * 1.4;
  compareTextLeftDeltaToExpected(
    failures,
    fishmarkTextRects,
    "引用内列表子项需要保留外部列表缩进",
    "引用内列表需要和外部列表一样渲染",
    expectedListNestedIndent,
    2
  );
  compareTextLeftDeltaToExpected(
    failures,
    fishmarkTextRects,
    "二层列表子项",
    "二层列表父项",
    expectedListNestedIndent,
    2
  );

  if (details.fishmark.listLineCount < 4) {
    failures.push(`expected quote-internal list lines; got ${details.fishmark.listLineCount}`);
  }

  if (details.fishmark.codeLineCount < 1) {
    failures.push(`expected quote-internal code block lines; got ${details.fishmark.codeLineCount}`);
  }

  if (fishmarkCodeSurfaceStyle !== null && fishmarkCodeElementStyle !== null && referenceCodeStyle !== null) {
    if (fishmarkCodeSurfaceStyle.backgroundColor !== referenceCodeStyle.backgroundColor) {
      failures.push(
        `expected quote code background ${referenceCodeStyle.backgroundColor}; got ${fishmarkCodeSurfaceStyle.backgroundColor}`
      );
    }

    if (fishmarkCodeElementStyle.color !== referenceCodeStyle.color) {
      failures.push(`expected quote code color ${referenceCodeStyle.color}; got ${fishmarkCodeElementStyle.color}`);
    }

    if (!within(px(fishmarkCodeElementStyle.fontSize), px(referenceCodeStyle.fontSize), 0.5)) {
      failures.push(`expected quote code font-size ${referenceCodeStyle.fontSize}; got ${fishmarkCodeElementStyle.fontSize}`);
    }

    if (!within(px(fishmarkCodeElementStyle.lineHeight), px(referenceCodeStyle.lineHeight), 0.5)) {
      failures.push(
        `expected quote code line-height ${referenceCodeStyle.lineHeight}; got ${fishmarkCodeElementStyle.lineHeight}`
      );
    }

    for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
      const widthKey = `border${side}Width` as keyof StyleSnapshot;
      const colorKey = `border${side}Color` as keyof StyleSnapshot;
      const styleKey = `border${side}Style` as keyof StyleSnapshot;
      if (!within(px(fishmarkCodeSurfaceStyle[widthKey]), px(referenceCodeStyle[widthKey]), 0.5)) {
        failures.push(
          `expected quote code ${String(widthKey)} ${referenceCodeStyle[widthKey]}; got ${fishmarkCodeSurfaceStyle[widthKey]}`
        );
      }
      if (fishmarkCodeSurfaceStyle[colorKey] !== referenceCodeStyle[colorKey]) {
        failures.push(
          `expected quote code ${String(colorKey)} ${referenceCodeStyle[colorKey]}; got ${fishmarkCodeSurfaceStyle[colorKey]}`
        );
      }
      if (fishmarkCodeSurfaceStyle[styleKey] !== referenceCodeStyle[styleKey]) {
        failures.push(
          `expected quote code ${String(styleKey)} ${referenceCodeStyle[styleKey]}; got ${fishmarkCodeSurfaceStyle[styleKey]}`
        );
      }
    }

    if (!within(px(fishmarkCodeElementStyle.paddingTop), px(referenceCodeStyle.paddingTop), 1)) {
      failures.push(`expected quote code padding-top ${referenceCodeStyle.paddingTop}; got ${fishmarkCodeElementStyle.paddingTop}`);
    }
    if (!within(fishmarkCodeGeometry?.contentInset ?? 0, referenceCodeGeometry?.contentInset ?? 0, 1)) {
      failures.push(
        `expected quote code content inset ${referenceCodeGeometry?.contentInset}px; got ${fishmarkCodeGeometry?.contentInset}px`
      );
    }
    if (!within(px(fishmarkCodeElementStyle.paddingBottom), px(referenceCodeStyle.paddingBottom), 1)) {
      failures.push(
        `expected quote code padding-bottom ${referenceCodeStyle.paddingBottom}; got ${fishmarkCodeElementStyle.paddingBottom}`
      );
    }

    if (!within(px(fishmarkCodeSurfaceStyle.borderTopLeftRadius), px(referenceCodeStyle.borderTopLeftRadius), 0.5)) {
      failures.push(
        `expected quote code radius ${referenceCodeStyle.borderTopLeftRadius}; got ${fishmarkCodeSurfaceStyle.borderTopLeftRadius}`
      );
    }

    if (details.fishmark.codeBlockAfterContent !== "\"\"") {
      failures.push(`expected quote code language label to be hidden; got ${details.fishmark.codeBlockAfterContent}`);
    }
  }

  if (details.fishmark.mathLineCount < 1) {
    failures.push(`expected quote-internal math lines; got ${details.fishmark.mathLineCount}`);
  }

  if (details.fishmark.mathRenderedCount < 1) {
    failures.push(`expected quote-internal math to render through KaTeX; got ${details.fishmark.mathRenderedCount}`);
  }

  if (fishmarkRenderedMathGeometry === null || fishmarkRenderedMathGeometry.width < 8 || fishmarkRenderedMathGeometry.height < 8) {
    failures.push(
      `expected visible quote math geometry; got ${JSON.stringify(fishmarkRenderedMathGeometry)}`
    );
  }

  if (fishmarkMathStyle !== null && referenceMathStyle !== null) {
    if (!isTransparent(fishmarkMathStyle.backgroundColor)) {
      failures.push(`expected quote math transparent background; got ${fishmarkMathStyle.backgroundColor}`);
    }
    if (px(fishmarkMathStyle.borderTopLeftRadius) > 0.5) {
      failures.push(`expected quote math square corners; got ${fishmarkMathStyle.borderTopLeftRadius}`);
    }
    if (!within(px(fishmarkMathStyle.paddingTop), px(referenceMathStyle.paddingTop), 1)) {
      failures.push(`expected quote math padding-top ${referenceMathStyle.paddingTop}; got ${fishmarkMathStyle.paddingTop}`);
    }
  }

  return {
    details,
    failures,
    pass: failures.length === 0
  };
}

export async function runBlockquoteTyporaVisualProbe(): Promise<BlockquoteTyporaVisualProbeResult> {
  installProbeStyles();
  document.documentElement.dataset.fishmarkThemeMode = "light";
  document.body.style.margin = "0";
  document.body.style.width = "100vw";
  document.body.style.minHeight = "100vh";
  document.body.style.background = "#ffffff";

  const root = document.getElementById("probe-root");
  if (!(root instanceof HTMLElement)) {
    throw new Error("Missing probe root.");
  }

  root.innerHTML = [
    '<main class="blockquote-typora-probe-shell">',
    '<section class="blockquote-typora-probe-panel">',
    "<h2>FishMark</h2>",
    '<div id="fishmark-editor" class="document-editor"></div>',
    "</section>",
    '<section class="blockquote-typora-probe-panel">',
    "<h2>Typora reference</h2>",
    '<div id="typora-reference"></div>',
    "</section>",
    "</main>"
  ].join("");

  const fishmarkRoot = root.querySelector<HTMLElement>("#fishmark-editor");
  const referenceRoot = root.querySelector<HTMLElement>("#typora-reference");
  if (!(fishmarkRoot instanceof HTMLElement) || !(referenceRoot instanceof HTMLElement)) {
    throw new Error("Unable to create probe surfaces.");
  }

  renderReference(referenceRoot);

  fishmarkRoot.style.setProperty(
    "--fishmark-document-font-family",
    "\"Open Sans\", \"Clear Sans\", \"Helvetica Neue\", Helvetica, Arial, sans-serif"
  );
  fishmarkRoot.style.setProperty("--fishmark-document-font-size", "16px");

  const controller = createCodeEditorController({
    parent: fishmarkRoot,
    initialContent: SAMPLE_MARKDOWN,
    onChange: () => undefined
  });
  const trailingParagraphOffset = controller.getContent().indexOf("普通段落");
  if (trailingParagraphOffset < 0) {
    throw new Error("Probe fixture is missing the trailing paragraph.");
  }
  controller.setSelection(trailingParagraphOffset);
  controller.focus();
  await settle();

  return waitForProbeResult(root);
}

Object.assign(window, {
  __runFishmarkBlockquoteTyporaVisualProbe: runBlockquoteTyporaVisualProbe
});
