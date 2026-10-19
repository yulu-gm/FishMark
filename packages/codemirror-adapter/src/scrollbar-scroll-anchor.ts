import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

type ScrollbarPointerAxis = "vertical" | "horizontal" | null;

// CodeMirror normally keeps a document block anchored when measured heights
// replace estimates. A native scrollbar gesture instead addresses a fraction
// of the scroll range. Preserve that fraction after measurement, without
// changing the height map or the anchoring used by ordinary navigation.
export function createScrollbarScrollAnchor(
  pointerAxis: (event: MouseEvent, editor: HTMLElement) => ScrollbarPointerAxis
) {
  const gesture = ViewPlugin.define((view) => {
    const scroller = view.scrollDOM;
    const document = scroller.ownerDocument;
    const window = document.defaultView!;
    const metrics = () => {
      const style = window.getComputedStyle(view.contentDOM);
      return [style.fontFamily, style.fontSize, style.lineHeight, style.letterSpacing, style.fontWeight, style.fontStyle].join("|");
    };
    let active: { width: number; height: number; range: number; metrics: string } | null = null;
    let beforeMeasurement: number | null = null;
    let generation = 0;
    let measurementPending = false;
    const measurementKey = {};

    const stop = () => {
      active = null;
      beforeMeasurement = null;
      generation++;
      measurementPending = false;
      document.removeEventListener("mousedown", stop, true);
      document.removeEventListener("pointerdown", stop, true);
      document.removeEventListener("mouseup", stop, true);
      document.removeEventListener("pointerup", stop, true);
      document.removeEventListener("pointercancel", stop, true);
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("wheel", stop, true);
      document.removeEventListener("keydown", stop, true);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pagehide", stop);
      document.fonts?.removeEventListener("loading", stop);
      document.fonts?.removeEventListener("loadingdone", stop);
      view.dom.removeEventListener("load", stop, true);
    };
    const down = (event: MouseEvent) => {
      stop();
      if (event.button !== 0 || pointerAxis(event, view.dom) !== "vertical" || document.fonts?.status === "loading") return;
      active = { width: scroller.clientWidth, height: scroller.clientHeight,
        range: scroller.scrollHeight - scroller.clientHeight, metrics: metrics() };
      document.addEventListener("mousedown", stop, true);
      document.addEventListener("pointerdown", stop, true);
      document.addEventListener("mouseup", stop, true);
      document.addEventListener("pointerup", stop, true);
      document.addEventListener("pointercancel", stop, true);
      document.addEventListener("mousemove", move, true);
      document.addEventListener("wheel", stop, true);
      document.addEventListener("keydown", stop, true);
      document.addEventListener("visibilitychange", hidden);
      window.addEventListener("blur", blur);
      window.addEventListener("pagehide", stop);
      document.fonts?.addEventListener("loading", stop);
      document.fonts?.addEventListener("loadingdone", stop);
      view.dom.addEventListener("load", stop, true);
    };
    const move = (event: MouseEvent) => { if (event.buttons === 0) stop(); };
    const blur = (event: FocusEvent) => { if (event.eventPhase === Event.AT_TARGET) stop(); };
    const hidden = () => { if (document.hidden) stop(); };

    view.dom.addEventListener("mousedown", down, true);

    return {
      stop,
      update(update: ViewUpdate) {
        if (update.transactions.length) { stop(); return; }
        if (active === null || measurementPending || beforeMeasurement !== null || !update.geometryChanged) return;
        measurementPending = true;
        const requestedGeneration = generation;
        // Keep layout reads in CodeMirror's read phase. Its measurement loop
        // consumes pending reads before applying anchor compensation. Capture
        // once, using the prior completed range: a viewport redraw may already
        // have grown the DOM. Scroll/mousemove events need not arrive in time.
        view.requestMeasure({ key: measurementKey, read: () => {
          if (requestedGeneration !== generation || active === null) return;
          measurementPending = false;
          const range = active.range;
          if (range <= 0 || scroller.clientWidth !== active.width || scroller.clientHeight !== active.height || metrics() !== active.metrics) {
            stop();
            return;
          }
          beforeMeasurement = Math.max(0, Math.min(1, scroller.scrollTop / range));
        } });
      },
      restore() {
        const ratio = beforeMeasurement;
        beforeMeasurement = null;
        if (active === null) return;
        const range = scroller.scrollHeight - scroller.clientHeight;
        if (range <= 0 || scroller.clientWidth !== active.width || scroller.clientHeight !== active.height || metrics() !== active.metrics) {
          stop();
          return;
        }
        active.range = range;
        if (ratio === null) return;
        const target = ratio * range;
        if (Number.isFinite(target) && Math.abs(scroller.scrollTop - target) > 1) scroller.scrollTop = target;
      },
      destroy() {
        stop();
        view.dom.removeEventListener("mousedown", down, true);
      }
    };
  });

  return [gesture, EditorView.updateListener.of((update) => {
    const current = update.view.plugin(gesture);
    // Any explicit transaction takes priority, including a scrollIntoView or
    // scrollSnapshot effect with no selection change (Outline/Tab restoration).
    if (update.transactions.length) current?.stop();
    else if (update.geometryChanged) current?.restore();
  })] as const;
}
