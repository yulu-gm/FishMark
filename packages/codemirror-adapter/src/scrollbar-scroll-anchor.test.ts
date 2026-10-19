// @vitest-environment jsdom
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { createScrollbarScrollAnchor } from "./scrollbar-scroll-anchor";

// Lifecycle/measurement-phase contracts only. Measurements are explicit test
// inputs; browser layout and native scrollbar timing require separate evidence.
function fixture(axis: "vertical" | "horizontal" | null = "vertical") {
  const host = document.createElement("div");
  document.body.append(host);
  const extension = createScrollbarScrollAnchor(() => axis);
  const view = new EditorView({ parent: host, doc: "unchanged", extensions: extension });
  const plugin = view.plugin(extension[0])!;
  const scroller = view.scrollDOM;
  const dimensions = { height: 10600, width: 900, clientHeight: 600 };
  Object.defineProperties(scroller, {
    scrollHeight: { configurable: true, get: () => dimensions.height },
    clientWidth: { configurable: true, get: () => dimensions.width },
    clientHeight: { configurable: true, get: () => dimensions.clientHeight }
  });
  scroller.scrollTop = 5000;
  const phase = { view, transactions: [], geometryChanged: true } as unknown as ViewUpdate;
  const reads: (() => void)[] = [];
  vi.spyOn(view, "requestMeasure").mockImplementation(request => {
    if (request) reads.push(() => { request.read(view); });
  });
  const flushReads = () => {
    for (const read of reads.splice(0)) read();
  };
  const startMeasure = () => { plugin.update(phase); flushReads(); };
  const finish = () => {
    for (const listener of view.state.facet(EditorView.updateListener)) listener(phase);
  };
  const down = () => scroller.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, buttons: 1 }));
  const measure = () => {
    // The viewport may mount a tall table before the first height update.
    dimensions.height = 12600;
    startMeasure();
    scroller.scrollTop = 7000; // CodeMirror's block-anchor compensation.
    finish();
  };
  return { view, host, plugin, scroller, dimensions, phase, finish, down, measure, startMeasure, flushReads,
    destroy() { view.destroy(); host.remove(); } };
}

describe("native scrollbar measurement anchor", () => {
  it("reads layout only in the requested measurement phase", () => {
    const f = fixture();
    const width = vi.spyOn(f.scroller, "clientWidth", "get");
    try {
      f.down(); width.mockClear();
      f.plugin.update(f.phase);
      expect(width).not.toHaveBeenCalled();
      f.flushReads();
      expect(width).toHaveBeenCalled();
    } finally { width.mockRestore(); f.destroy(); }
  });

  it("discards a queued read when the gesture ends before it runs", () => {
    const f = fixture();
    const width = vi.spyOn(f.scroller, "clientWidth", "get");
    try {
      f.down(); f.plugin.update(f.phase);
      document.dispatchEvent(new MouseEvent("mouseup"));
      width.mockClear(); f.flushReads();
      expect(width).not.toHaveBeenCalled();
      f.dimensions.height = 12600; f.scroller.scrollTop = 7000; f.finish();
      expect(f.scroller.scrollTop).toBe(7000);
    } finally { width.mockRestore(); f.destroy(); }
  });

  it("uses the current top and previous completed range, without a scroll/move event", () => {
    const f = fixture();
    try {
      f.down();
      f.scroller.scrollTop = 4000;
      f.measure();
      expect(f.scroller.scrollTop).toBe(4800);
      // The next measurement starts from the updated range, not a stale ratio.
      f.scroller.scrollTop = 3000;
      f.dimensions.height = 14600;
      f.startMeasure();
      f.scroller.scrollTop = 5000;
      f.finish();
      expect(f.scroller.scrollTop).toBe(3500);
      expect(f.view.state.doc.toString()).toBe("unchanged");
    } finally { f.destroy(); }
  });

  it("captures only once across multiple height updates, including equal total heights", () => {
    const f = fixture();
    try {
      f.down();
      f.startMeasure();
      f.scroller.scrollTop = 6500;
      f.startMeasure();
      f.finish();
      expect(f.scroller.scrollTop).toBe(5000);
    } finally { f.destroy(); }
  });

  it.each([null, "horizontal"] as const)("leaves %s gestures on normal anchoring", (axis) => {
    const f = fixture(axis);
    try { f.down(); f.measure(); expect(f.scroller.scrollTop).toBe(7000); }
    finally { f.destroy(); }
  });

  it.each(["mouseup", "pointerup", "pointercancel", "pointerdown", "mousedown", "wheel", "keydown", "mousemove", "blur", "pagehide", "visibilitychange"])("stops on %s", (event) => {
    const f = fixture();
    let hidden: ReturnType<typeof vi.spyOn> | undefined;
    try {
      f.down();
      if (event === "visibilitychange") hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      const target = event === "blur" || event === "pagehide" ? window : document;
      target.dispatchEvent(event === "mousemove" ? new MouseEvent(event, { buttons: 0 }) : new Event(event));
      f.measure();
      expect(f.scroller.scrollTop).toBe(7000);
    } finally { hidden?.mockRestore(); f.destroy(); }
  });

  it("ignores cell blur and a held mousemove", () => {
    const f = fixture();
    try {
      f.down();
      f.scroller.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      document.dispatchEvent(new MouseEvent("mousemove", { buttons: 1 }));
      f.measure();
      expect(f.scroller.scrollTop).toBe(6000);
    } finally { f.destroy(); }
  });

  it.each(["font", "load"])("cancels on asynchronous content metric change: %s", (kind) => {
    const f = fixture();
    try {
      f.down();
      if (kind === "font") f.view.contentDOM.style.fontSize = "24px";
      else f.view.contentDOM.dispatchEvent(new Event("load"));
      f.measure();
      expect(f.scroller.scrollTop).toBe(7000);
    } finally { f.destroy(); }
  });

  it.each(["width", "clientHeight", "height"] as const)("cancels on resized/no-overflow %s", (dimension) => {
    const f = fixture();
    try {
      f.down();
      f.startMeasure();
      f.dimensions[dimension] = dimension === "height" ? 500 : 800;
      f.scroller.scrollTop = 100;
      f.finish();
      expect(f.scroller.scrollTop).toBe(100);
      // Cancellation persists even if the dimensions later recover.
      f.dimensions.width = 900; f.dimensions.clientHeight = 600;
      f.measure();
      expect(f.scroller.scrollTop).toBe(7000);
    } finally { f.destroy(); }
  });

  it.each(["scrollIntoView", "scrollSnapshot", "selection", "edit"])("gives explicit %s transactions priority", (kind) => {
    const f = fixture();
    try {
      f.down();
      f.startMeasure();
      f.view.dispatch(kind === "scrollIntoView" ? { effects: EditorView.scrollIntoView(0) }
        : kind === "scrollSnapshot" ? { effects: f.view.scrollSnapshot() }
          : kind === "selection" ? { selection: { anchor: 1 } } : { changes: { from: 0, insert: "x" } });
      f.measure();
      expect(f.scroller.scrollTop).toBe(7000);
    } finally { f.destroy(); }
  });

  it("removes active document listeners when destroyed", () => {
    const f = fixture();
    const remove = vi.spyOn(document, "removeEventListener");
    try {
      f.down(); f.destroy();
      for (const name of ["mousedown", "pointerdown", "mouseup", "pointerup", "pointercancel", "mousemove", "wheel", "keydown", "visibilitychange"]) {
        expect(remove.mock.calls.some(([event]) => event === name)).toBe(true);
      }
    } finally { remove.mockRestore(); }
  });
});
