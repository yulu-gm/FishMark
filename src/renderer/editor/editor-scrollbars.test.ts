// @vitest-environment jsdom
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { createEditorScrollbars } from "./editor-scrollbars";

// Lifecycle and intent contracts. Real geometry/pointer capture is tested in
// the separate browser matrix; these mocked dimensions are not drag evidence.
function fixture() {
  const parent = document.createElement("div"); document.body.append(parent);
  const extension = createEditorScrollbars();
  const raf = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(0);
  const view = new EditorView({ parent, doc: "unchanged", extensions: extension });
  raf.mockRestore();
  const plugin = view.plugin(extension[0])!;
  const dimensions = { height: 10600, width: 900, clientHeight: 600 };
  Object.defineProperties(view.scrollDOM, {
    scrollHeight: { configurable: true, get: () => dimensions.height },
    clientHeight: { configurable: true, get: () => dimensions.clientHeight },
    scrollWidth: { configurable: true, value: 900 }, clientWidth: { configurable: true, get: () => dimensions.width }
  });
  vi.spyOn(view.dom, "getBoundingClientRect").mockReturnValue(new DOMRect(0,0,900,600));
  vi.spyOn(view.scrollDOM, "getBoundingClientRect").mockReturnValue(new DOMRect(0,0,900,600));
  vi.spyOn(view, "requestMeasure").mockImplementation(() => {});
  const track = plugin.tracks.vertical, thumb = plugin.thumbs.vertical;
  vi.spyOn(track, "getBoundingClientRect").mockReturnValue(new DOMRect(888,0,12,600));
  let captured = false;
  track.setPointerCapture = vi.fn(() => { captured = true; });
  track.hasPointerCapture = vi.fn(() => captured);
  track.releasePointerCapture = vi.fn(() => { captured = false; });
  const layout = () => plugin.measure.write(plugin.measure.read());
  layout();
  const pointer = (type: string, x: number, y: number, buttons = 1, id = 7) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerId", { value: id });
    return event;
  };
  const down = () => thumb.dispatchEvent(pointer("pointerdown", 895, 12));
  const pageDown = (y = 550) => track.dispatchEvent(pointer("pointerdown", 895, y));
  const move = (x: number, y: number, buttons = 1, id = 7) => track.dispatchEvent(pointer("pointermove", x, y, buttons, id));
  return { view, plugin, dimensions, track, thumb, layout, pointer, down, pageDown, move,
    destroy() { view.destroy(); parent.remove(); } };
}
describe("editor scrollbar intent and lifetime", () => {
  it("exposes the actual range and controlled scroller accessibly", () => {
    const f = fixture(); try {
      expect(f.track.getAttribute("role")).toBe("scrollbar");
      expect(f.track.getAttribute("aria-controls")).toBe(f.view.scrollDOM.id);
      expect(f.track.getAttribute("aria-valuemax")).toBe("10000");
      expect(f.track.hidden).toBe(false);
      expect(f.plugin.tracks.horizontal.hidden).toBe(true);
    } finally { f.destroy(); }
  });
  it("keeps vertical intent independent of either horizontal deviation", () => {
    const f = fixture(); try {
      f.down(); f.move(895, 210); const top = f.view.scrollDOM.scrollTop;
      f.move(-2000, 210); expect(f.view.scrollDOM.scrollTop).toBeCloseTo(top);
      f.move(4000, 210); expect(f.view.scrollDOM.scrollTop).toBeCloseTo(top);
      expect(f.view.state.doc.toString()).toBe("unchanged");
      expect(f.view.state.selection.main.anchor).toBe(0);
    } finally { f.destroy(); }
  });
  it("clamps document ends and supports immediate reversal", () => {
    const f = fixture(); try {
      f.down(); f.move(895, 5000); expect(f.view.scrollDOM.scrollTop).toBe(10000);
      f.move(895, -100); expect(f.view.scrollDOM.scrollTop).toBe(0);
      f.move(895, 250); expect(f.view.scrollDOM.scrollTop).toBeGreaterThan(0);
    } finally { f.destroy(); }
  });
  it.each(["pointerup", "pointercancel", "lostpointercapture"])("ends %s without rollback or subsequent move writes", type => {
    const f = fixture(); try {
      f.down(); f.move(895, 200); f.track.dispatchEvent(f.pointer(type, -2000, 200, 0));
      const top = f.view.scrollDOM.scrollTop; f.move(895, 450);
      expect(f.view.scrollDOM.scrollTop).toBe(top); expect(f.plugin.drag).toBeNull();
    } finally { f.destroy(); }
  });
  it("ignores another pointer and releases a missing-button gesture safely", () => {
    const f = fixture(); try {
      f.down(); f.move(895, 300, 1, 88); expect(f.view.scrollDOM.scrollTop).toBe(0);
      f.move(895, 200); const top = f.view.scrollDOM.scrollTop;
      f.move(895, 300, 0); expect(f.plugin.drag).toBeNull(); expect(f.view.scrollDOM.scrollTop).toBe(top);
    } finally { f.destroy(); }
  });
  it("gives explicit navigation priority over captured pointer intent", () => {
    const f = fixture(); try {
      f.down(); f.move(895, 200);
      f.plugin.update({ transactions: [{}], geometryChanged: false, docChanged: false } as unknown as ViewUpdate);
      f.view.scrollDOM.scrollTop = 19; f.plugin.sync();
      expect(f.view.scrollDOM.scrollTop).toBe(19); expect(f.plugin.drag).toBeNull();
    } finally { f.destroy(); }
  });
  it("does not write scroll position from the measurement write phase", () => {
    const f = fixture(); try {
      f.down(); f.move(895, 200); const top = f.view.scrollDOM.scrollTop;
      f.dimensions.height = 20600; f.layout(); expect(f.view.scrollDOM.scrollTop).toBe(top);
      f.plugin.sync(); expect(f.view.scrollDOM.scrollTop).toBeGreaterThan(top);
    } finally { f.destroy(); }
  });
  it("keeps keyboard scrolling in the control without editing or moving selection", () => {
    const f = fixture(); try {
      const dispatch = vi.spyOn(f.view, "dispatch");
      f.track.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles:true, cancelable:true }));
      expect(dispatch).toHaveBeenCalled();
      f.view.scrollDOM.scrollTop = 10000; // Explicit geometry input for PageUp.
      f.track.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp", bubbles:true, cancelable:true }));
      expect(f.view.scrollDOM.scrollTop).toBe(9460);
      dispatch.mockClear();
      f.track.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles:true, cancelable:true }));
      expect(dispatch).toHaveBeenCalled(); expect(f.view.state.selection.main.anchor).toBe(0);
    } finally { f.destroy(); }
  });
  it("retains position on blur and removes controls/capture on destroy", () => {
    const f = fixture(); f.down(); f.move(895, 250); const top=f.view.scrollDOM.scrollTop;
    window.dispatchEvent(new FocusEvent("blur"));
    expect(f.plugin.drag).toBeNull(); expect(f.view.scrollDOM.scrollTop).toBe(top);
    f.destroy(); expect(f.track.isConnected).toBe(false);
  });
});

describe("editor scrollbar held track paging", () => {
  it("pages immediately, waits for the initial delay, then repeats", () => {
    vi.useFakeTimers(); const f=fixture();
    try {
      f.pageDown(); expect(f.view.scrollDOM.scrollTop).toBe(540);
      vi.advanceTimersByTime(349); expect(f.view.scrollDOM.scrollTop).toBe(540);
      vi.advanceTimersByTime(1); expect(f.view.scrollDOM.scrollTop).toBe(1080);
      vi.advanceTimersByTime(60); expect(f.view.scrollDOM.scrollTop).toBe(1620);
    } finally { f.destroy(); vi.useRealTimers(); }
  });
  it("pauses outside the track and resumes while still held on reentry", () => {
    vi.useFakeTimers(); const f=fixture();
    try {
      f.pageDown(); f.move(-1000,550); vi.advanceTimersByTime(1500);
      expect(f.view.scrollDOM.scrollTop).toBe(540); expect(f.plugin.pageTimer).toBeNull();
      f.move(895,550); vi.advanceTimersByTime(60); expect(f.view.scrollDOM.scrollTop).toBe(1080);
      f.move(895,900); vi.advanceTimersByTime(500); expect(f.view.scrollDOM.scrollTop).toBe(1080);
    } finally { f.destroy(); vi.useRealTimers(); }
  });
  it("stops at the pointer with no ongoing timer or oscillation", () => {
    vi.useFakeTimers(); const f=fixture();
    try {
      f.pageDown(300); vi.advanceTimersByTime(3000);
      const g=f.plugin.geometry.vertical!, top=f.view.scrollDOM.scrollTop;
      const thumbEnd=g.start+top/g.range*(g.length-g.thumb)+g.thumb;
      expect(thumbEnd).toBeCloseTo(300); expect(f.plugin.pageTimer).toBeNull();
      vi.advanceTimersByTime(5000); expect(f.view.scrollDOM.scrollTop).toBe(top);
      expect(f.view.state.doc.toString()).toBe("unchanged"); expect(f.view.state.selection.main.anchor).toBe(0);
    } finally { f.destroy(); vi.useRealTimers(); }
  });
  it.each(["pointerup","pointercancel","lostpointercapture"])("terminates held paging on %s", type => {
    vi.useFakeTimers(); const f=fixture();
    try {
      f.pageDown(); vi.advanceTimersByTime(350); const top=f.view.scrollDOM.scrollTop;
      f.track.dispatchEvent(f.pointer(type,-1000,550,0)); vi.advanceTimersByTime(1500);
      expect(f.view.scrollDOM.scrollTop).toBe(top); expect(f.plugin.pageTimer).toBeNull(); expect(f.plugin.page).toBeNull();
    } finally { f.destroy(); vi.useRealTimers(); }
  });
  it("pages upward and stops when the thumb reaches the pointer", () => {
    vi.useFakeTimers(); const f=fixture();
    try {
      f.view.scrollDOM.scrollTop=8000; f.plugin.sync(); f.pageDown(150); vi.advanceTimersByTime(3000);
      const g=f.plugin.geometry.vertical!, top=f.view.scrollDOM.scrollTop;
      expect(g.start+top/g.range*(g.length-g.thumb)).toBeCloseTo(150);
      expect(f.plugin.pageTimer).toBeNull();
    } finally { f.destroy(); vi.useRealTimers(); }
  });
  it.each(["blur","destroy","navigation"])("cancels the repeat timer on %s", kind => {
    vi.useFakeTimers(); const f=fixture();
    try {
      f.pageDown(); const top=f.view.scrollDOM.scrollTop;
      if(kind==='blur')window.dispatchEvent(new FocusEvent('blur'));
      else if(kind==='navigation')f.plugin.update({transactions:[{}]} as unknown as ViewUpdate);
      else f.destroy();
      vi.advanceTimersByTime(2000); expect(f.view.scrollDOM.scrollTop).toBe(top); expect(f.plugin.pageTimer).toBeNull();
    } finally { if(kind!=='destroy')f.destroy(); vi.useRealTimers(); }
  });
});
