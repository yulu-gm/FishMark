export interface RuntimePhaseSpan {
  id: number;
  parentId: number | null;
  label: string;
  startMs: number;
  endMs: number | null;
  inclusiveMs: number | null;
  exclusiveMs: number | null;
  directChildMs: number;
  inputChars: number | null;
}

// Capture only the synchronous controller interval. Async rAF/flush work is outside it.
// All clocks use the same renderer performance.now; raw nested intervals are retained.
export function createRuntimePhaseTiming(now: () => number = () => performance.now()) {
  let spans: RuntimePhaseSpan[] = [];
  const stack: RuntimePhaseSpan[] = [];
  let active = false;
  return {
    startSample() {
      if (active || stack.length) throw new Error("Runtime phase capture already active");
      spans = [];
      active = true;
    },
    begin(label: string, inputChars: number | null = null): RuntimePhaseSpan | undefined {
      if (!active) return undefined;
      const span: RuntimePhaseSpan = { id: spans.length, parentId: stack.at(-1)?.id ?? null,
        label, inputChars, startMs: now(), endMs: null, inclusiveMs: null, exclusiveMs: null, directChildMs: 0 };
      spans.push(span);
      stack.push(span);
      return span;
    },
    end(span: RuntimePhaseSpan | undefined) {
      if (!span) return;
      const endedAt = now();
      if (stack.pop() !== span) throw new Error("Unbalanced runtime phase capture");
      span.endMs = endedAt;
      span.inclusiveMs = endedAt - span.startMs;
      span.exclusiveMs = span.inclusiveMs - span.directChildMs;
      const parent = stack.at(-1);
      if (parent) parent.directChildMs += span.inclusiveMs;
    },
    finishSample(): RuntimePhaseSpan[] {
      active = false;
      if (stack.length) throw new Error("Incomplete runtime phase capture");
      return spans;
    }
  };
}

declare global {
  interface Window {
    __fishmarkRuntimePhaseTiming?: ReturnType<typeof createRuntimePhaseTiming>;
  }
}
