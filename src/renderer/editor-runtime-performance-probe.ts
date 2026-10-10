import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/editor-source.css";
import "./styles/markdown-render.css";
import { createCodeEditorController } from "./code-editor";

// Uses the actual product controller, including its transaction filters, derived state and
// decorations. Two animation frames are a rendering opportunity, not a native IME or
// compositor presentation timestamp. Keep synchronous dispatch and frame latency separate.
const frames = () => new Promise<void>((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
});

function summarize(values: readonly number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * p) - 1)]!;
  return { samples: values.length, p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: ordered.at(-1)! };
}

interface RuntimeFixtureReport {
  lineCount: number;
  chars: number;
  source: string;
  openMs: number | null;
  emittedFrames: number;
  raw: { typingDispatchMs: number[]; typingToFrameMs: number[]; selectionDispatchMs: number[] };
  complete: boolean;
  sourcePreserved: boolean;
  typingDispatchMs: ReturnType<typeof summarize> | null;
  typingToFrameMs: ReturnType<typeof summarize> | null;
  selectionDispatchMs: ReturnType<typeof summarize> | null;
  presentation: { dpr: number; fontFamily: string; fontSize: string; lineHeight: string } | null;
}

async function runEditorRuntimePerformanceProbe() {
  const root = document.getElementById("probe-root")!;
  root.style.cssText = "height:720px;width:1000px;overflow:hidden";
  const fixtures: RuntimeFixtureReport[] = [];
  const report = { schemaVersion: 2, measurement: "production-controller-dispatch-and-two-animation-frames",
    complete: false, fixtures };
  window.__editorRuntimePerformancePartial = report;
  for (const lineCount of [5000, 20000]) {
    console.info(`runtime-perf: opening ${lineCount} lines`);
    const source = Array.from({ length: lineCount / 5 }, (_, index) =>
      `# Section ${index}\n\nPlain paragraph number ${index}.\n\n`).join("\n");
    const raw = { typingDispatchMs: [] as number[], typingToFrameMs: [] as number[], selectionDispatchMs: [] as number[] };
    const fixture: RuntimeFixtureReport = { lineCount, chars: source.length, source, openMs: null,
      emittedFrames: 0, raw, complete: false, sourcePreserved: false,
      typingDispatchMs: null,
      typingToFrameMs: null,
      selectionDispatchMs: null,
      presentation: null };
    fixtures.push(fixture);
    let emittedFrames = 0;
    const openStart = performance.now();
    const editor = createCodeEditorController({
      parent: root,
      initialContent: source,
      onChange: () => undefined,
      onDocumentChangeFrame: () => { emittedFrames += 1; fixture.emittedFrames = emittedFrames; }
    });
    const openMs = performance.now() - openStart;
    fixture.openMs = openMs;
    console.info(`runtime-perf: opened ${lineCount} lines in ${openMs.toFixed(1)}ms`);
    try {
      const insertAt = source.indexOf("paragraph") + 4;
      editor.setSelection(insertAt);
      editor.focus();
      await frames();
      const { typingDispatchMs, typingToFrameMs, selectionDispatchMs } = raw;
      const contentStyle = getComputedStyle(root.querySelector(".cm-content")!);
      fixture.presentation = { dpr: devicePixelRatio, fontFamily: contentStyle.fontFamily,
        fontSize: contentStyle.fontSize, lineHeight: contentStyle.lineHeight };
      for (let sample = 0; sample < 30; sample++) {
        const start = performance.now();
        editor.insertText("x");
        typingDispatchMs.push(performance.now() - start);
        await frames();
        typingToFrameMs.push(performance.now() - start);
        console.info(`runtime-perf: sample ${JSON.stringify({ lineCount, kind: "typing", sample,
          dispatchMs: typingDispatchMs.at(-1), toTwoFramesMs: typingToFrameMs.at(-1) })}`);
        if (sample % 10 === 9) console.info(`runtime-perf: ${lineCount} lines typing ${sample + 1}/30`);
      }
      for (let sample = 0; sample < 30; sample++) {
        const start = performance.now();
        editor.setSelection(source.indexOf("paragraph") + sample % 5);
        selectionDispatchMs.push(performance.now() - start);
        await frames();
        console.info(`runtime-perf: sample ${JSON.stringify({ lineCount, kind: "selection", sample,
          dispatchMs: selectionDispatchMs.at(-1) })}`);
      }
      editor.flushPendingDocumentChanges();
      fixture.emittedFrames = emittedFrames;
      fixture.typingDispatchMs = summarize(typingDispatchMs);
      fixture.typingToFrameMs = summarize(typingToFrameMs);
      fixture.selectionDispatchMs = summarize(selectionDispatchMs);
      fixture.sourcePreserved = editor.getContent() === source.slice(0, insertAt) + "x".repeat(30) + source.slice(insertAt);
      fixture.complete = true;
    } finally { editor.destroy(); root.replaceChildren(); }
  }
  report.complete = true;
  return report;
}

declare global {
  interface Window {
    __runEditorRuntimePerformanceProbe: typeof runEditorRuntimePerformanceProbe;
    __editorRuntimePerformancePartial?: unknown;
  }
}
window.__runEditorRuntimePerformanceProbe = runEditorRuntimePerformanceProbe;
