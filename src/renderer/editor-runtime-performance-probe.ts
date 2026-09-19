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

async function runEditorRuntimePerformanceProbe() {
  const root = document.getElementById("probe-root")!;
  root.style.cssText = "height:720px;width:1000px;overflow:hidden";
  const fixtures = [];
  for (const lineCount of [5000, 20000]) {
    console.info(`runtime-perf: opening ${lineCount} lines`);
    const source = Array.from({ length: lineCount / 5 }, (_, index) =>
      `# Section ${index}\n\nPlain paragraph number ${index}.\n\n`).join("\n");
    let emittedFrames = 0;
    const openStart = performance.now();
    const editor = createCodeEditorController({
      parent: root,
      initialContent: source,
      onChange: () => undefined,
      onDocumentChangeFrame: () => { emittedFrames += 1; }
    });
    const openMs = performance.now() - openStart;
    console.info(`runtime-perf: opened ${lineCount} lines in ${openMs.toFixed(1)}ms`);
    try {
      const insertAt = source.indexOf("paragraph") + 4;
      editor.setSelection(insertAt);
      editor.focus();
      await frames();
      const typingDispatchMs: number[] = [];
      const typingToFrameMs: number[] = [];
      const selectionDispatchMs: number[] = [];
      for (let sample = 0; sample < 30; sample++) {
        const start = performance.now();
        editor.insertText("x");
        typingDispatchMs.push(performance.now() - start);
        await frames();
        typingToFrameMs.push(performance.now() - start);
        if (sample % 10 === 9) console.info(`runtime-perf: ${lineCount} lines typing ${sample + 1}/30`);
      }
      for (let sample = 0; sample < 30; sample++) {
        const start = performance.now();
        editor.setSelection(source.indexOf("paragraph") + sample % 5);
        selectionDispatchMs.push(performance.now() - start);
        await frames();
      }
      editor.flushPendingDocumentChanges();
      fixtures.push({ lineCount, chars: source.length, openMs, emittedFrames,
        typingDispatchMs: summarize(typingDispatchMs), typingToFrameMs: summarize(typingToFrameMs),
        selectionDispatchMs: summarize(selectionDispatchMs),
        sourcePreserved: editor.getContent() === source.slice(0, insertAt) + "x".repeat(30) + source.slice(insertAt)
      });
    } finally { editor.destroy(); root.replaceChildren(); }
  }
  return { schemaVersion: 1, measurement: "production-controller-dispatch-and-two-animation-frames", fixtures };
}

declare global {
  interface Window {
    __runEditorRuntimePerformanceProbe: typeof runEditorRuntimePerformanceProbe;
  }
}
window.__runEditorRuntimePerformanceProbe = runEditorRuntimePerformanceProbe;
