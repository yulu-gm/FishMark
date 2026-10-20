import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

type Axis = "vertical" | "horizontal";
type Geometry = { length: number; start: number; client: number; range: number; thumb: number };
type Measurement = { x: number; y: number; width: number; height: number; totalWidth: number; totalHeight: number; left: number; top: number };
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
const PAGE_REPEAT_DELAY = 350;
const PAGE_REPEAT_INTERVAL = 60;
let nextScrollerId = 0;

// The browser still owns scrolling, wheel input, layout and selection. Only
// the scrollbar controls are replaced, so a native thumb drag (and its
// platform snap-back policy) is never started. No polling or scroll rollback.
export function createEditorScrollbars() {
  const plugin = ViewPlugin.fromClass(class {
    readonly scroller: HTMLElement;
    readonly window: Window;
    readonly tracks: Record<Axis, HTMLDivElement>;
    readonly thumbs: Record<Axis, HTMLDivElement>;
    readonly previousId: string;
    readonly resize: ResizeObserver | null;
    geometry: Partial<Record<Axis, Geometry>> = {};
    drag: { axis: Axis; pointer: number; coordinate: number; grab: number } | null = null;
    page: { axis: Axis; pointer: number; coordinate: number; cross: number; direction: -1 | 1 } | null = null;
    pageTimer: number | null = null;
    destroyed = false;
    postMeasurePending = false;
    pendingEdge: "start" | "end" | null = null;
    readonly measure: { key: object; read: () => Measurement; write: (m: Measurement) => void };

    constructor(readonly view: EditorView) {
      this.scroller = view.scrollDOM;
      this.window = view.dom.ownerDocument.defaultView!;
      this.previousId = this.scroller.id;
      if (!this.scroller.id) this.scroller.id = `fishmark-scroll-content-${++nextScrollerId}`;
      this.tracks = {} as Record<Axis, HTMLDivElement>;
      this.thumbs = {} as Record<Axis, HTMLDivElement>;
      for (const axis of ["vertical", "horizontal"] as const) {
        const track = view.dom.ownerDocument.createElement("div");
        const thumb = view.dom.ownerDocument.createElement("div");
        track.className = "fishmark-editor-scrollbar";
        track.dataset.editorScrollbarAxis = axis;
        track.setAttribute("role", "scrollbar");
        track.setAttribute("aria-label", `Document ${axis} scrollbar`);
        track.setAttribute("aria-controls", this.scroller.id);
        track.setAttribute("aria-orientation", axis);
        track.setAttribute("aria-valuemin", "0");
        track.tabIndex = 0;
        track.hidden = true;
        thumb.className = "fishmark-editor-scrollbar-thumb";
        thumb.setAttribute("aria-hidden", "true");
        track.append(thumb);
        this.tracks[axis] = track; this.thumbs[axis] = thumb;
        track.addEventListener("pointerdown", event => this.down(axis, event));
        track.addEventListener("pointermove", this.move);
        track.addEventListener("pointerup", this.up);
        track.addEventListener("pointercancel", this.cancel);
        track.addEventListener("lostpointercapture", this.cancel);
        track.addEventListener("keydown", event => this.key(axis, event));
        track.addEventListener("wheel", this.wheel, { passive: false });
        view.dom.append(track);
      }
      this.measure = {
        key: this,
        read: () => {
          const editor = view.dom.getBoundingClientRect(), scroll = this.scroller.getBoundingClientRect();
          return { x: scroll.left - editor.left, y: scroll.top - editor.top,
            width: this.scroller.clientWidth, height: this.scroller.clientHeight,
            totalWidth: this.scroller.scrollWidth, totalHeight: this.scroller.scrollHeight,
            left: scroll.left, top: scroll.top };
        },
        write: (m: Measurement) => {
          if (this.destroyed) return;
          const vertical = m.totalHeight > m.height + 1, horizontal = m.totalWidth > m.width + 1;
          for (const axis of ["vertical", "horizontal"] as const) {
            const isVertical = axis === "vertical", client = isVertical ? m.height : m.width;
            const total = isVertical ? m.totalHeight : m.totalWidth;
            const length = Math.max(0, client - ((isVertical ? horizontal : vertical) ? 12 : 0));
            this.geometry[axis] = { length, client, range: Math.max(0, total - client),
              start: isVertical ? m.top : m.left, thumb: Math.min(length, Math.max(24, length * client / Math.max(client, total))) };
            const track = this.tracks[axis];
            track.hidden = !(isVertical ? vertical : horizontal) || length === 0;
            track.style.cssText = isVertical
              ? `top:${m.y}px;left:${m.x + m.width - 12}px;height:${length}px;width:12px`
              : `top:${m.y + m.height - 12}px;left:${m.x}px;width:${length}px;height:12px`;
            if (track.hidden && (this.drag?.axis === axis || this.page?.axis === axis)) this.stop();
          }
          this.sync(false);
          if (!this.postMeasurePending) {
            this.postMeasurePending = true;
            // Run after the complete CodeMirror measure call, including its
            // anchor compensation and update listeners. One job per turn;
            // never a frame loop or a second native dragging authority.
            queueMicrotask(() => {
              this.postMeasurePending = false;
              if (this.destroyed) return;
              if (this.pendingEdge !== null) {
                this.setPosition("vertical", this.pendingEdge === "start" ? 0 : this.scroller.scrollHeight - this.scroller.clientHeight);
              }
              this.sync();
            });
          }
        }
      };
      this.scroller.addEventListener("scroll", this.schedule, { passive: true });
      view.dom.addEventListener("pointerdown", this.cancel, true);
      view.dom.addEventListener("keydown", this.cancel, true);
      view.dom.addEventListener("wheel", this.cancel, { passive: true, capture: true });
      view.dom.ownerDocument.addEventListener("visibilitychange", this.visibility);
      this.window.addEventListener("blur", this.blur);
      this.window.addEventListener("pagehide", this.cancel);
      this.resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(this.schedule);
      this.resize?.observe(this.scroller);
      this.resize?.observe(view.contentDOM);
      this.schedule();
    }

    position(axis: Axis) { return axis === "vertical" ? this.scroller.scrollTop : this.scroller.scrollLeft; }
    setPosition(axis: Axis, value: number) {
      const max = axis === "vertical" ? this.scroller.scrollHeight - this.scroller.clientHeight : this.scroller.scrollWidth - this.scroller.clientWidth;
      const target = clamp(value, Math.max(0, max));
      if (Math.abs(target - this.position(axis)) < 0.5) return;
      if (axis === "vertical") this.scroller.scrollTop = target;
      else this.scroller.scrollLeft = target;
    }
    schedule = () => { if (!this.destroyed) this.view.requestMeasure(this.measure); };
    stop = () => {
      this.pendingEdge = null;
      this.clearPageTimer();
      const interaction = this.drag ?? this.page; this.drag = null; this.page = null;
      if (!interaction) return;
      const track = this.tracks[interaction.axis]; delete track.dataset.dragging; delete track.dataset.paging;
      if (track.hasPointerCapture?.(interaction.pointer)) track.releasePointerCapture(interaction.pointer);
    };
    cancel = () => this.stop();
    blur = (event: FocusEvent) => { if (event.eventPhase === Event.AT_TARGET) this.stop(); };
    visibility = () => { if (this.view.dom.ownerDocument.hidden) this.stop(); };
    down(axis: Axis, event: PointerEvent) {
      if (event.button !== 0 || this.drag || this.page || this.tracks[axis].hidden) return;
      const geometry = this.geometry[axis]; if (!geometry || geometry.range <= 0) return;
      event.preventDefault(); event.stopPropagation();
      const coordinate = axis === "vertical" ? event.clientY : event.clientX;
      if (event.target !== this.thumbs[axis]) {
        const start = geometry.start + this.position(axis) / geometry.range * (geometry.length - geometry.thumb);
        if (coordinate >= start && coordinate <= start + geometry.thumb) return;
        try { this.tracks[axis].setPointerCapture(event.pointerId); } catch { return; }
        this.page = { axis, pointer: event.pointerId, coordinate,
          cross: axis === "vertical" ? event.clientX : event.clientY, direction: coordinate < start ? -1 : 1 };
        this.tracks[axis].dataset.paging = "true";
        if (this.pageStep()) this.armPage(PAGE_REPEAT_DELAY);
        return;
      }
      const start = geometry.start + this.position(axis) / geometry.range * (geometry.length - geometry.thumb);
      try { this.tracks[axis].setPointerCapture(event.pointerId); }
      catch { return; }
      this.drag = { axis, pointer: event.pointerId, coordinate, grab: clamp((coordinate - start) / geometry.thumb, 1) };
      this.tracks[axis].dataset.dragging = "true";
    }
    move = (event: PointerEvent) => {
      if (this.page?.pointer === event.pointerId) {
        if (event.buttons === 0) { this.stop(); return; }
        event.preventDefault();
        this.page.coordinate = this.page.axis === "vertical" ? event.clientY : event.clientX;
        this.page.cross = this.page.axis === "vertical" ? event.clientX : event.clientY;
        if (this.pageTarget() === null) this.clearPageTimer();
        else this.armPage(PAGE_REPEAT_INTERVAL);
        return;
      }
      if (!this.drag || event.pointerId !== this.drag.pointer) return;
      if (event.buttons === 0) { this.stop(); return; }
      event.preventDefault();
      this.drag.coordinate = this.drag.axis === "vertical" ? event.clientY : event.clientX;
      this.sync(); this.schedule();
    };
    up = (event: PointerEvent) => {
      if (this.page?.pointer === event.pointerId) { this.stop(); this.schedule(); return; }
      if (this.drag?.pointer !== event.pointerId) return;
      this.drag.coordinate = this.drag.axis === "vertical" ? event.clientY : event.clientX;
      this.sync(); this.stop(); this.schedule();
    };
    sync(applyPointer = true) {
      // CodeMirror can replace estimated heights and compensate a content
      // anchor during measure(). Our own captured thumb instead addresses the
      // pointer's position. Reconcile once after that measurement, not against
      // an active native scrollbar drag. Explicit navigation ends capture.
      for (const axis of ["vertical", "horizontal"] as const) {
        const g = this.geometry[axis]; if (!g) continue;
        g.range = Math.max(0, axis === "vertical" ? this.scroller.scrollHeight - this.scroller.clientHeight : this.scroller.scrollWidth - this.scroller.clientWidth);
        if (applyPointer && this.drag?.axis === axis && g.length > g.thumb)
          this.setPosition(axis, clamp((this.drag.coordinate - g.start - this.drag.grab * g.thumb) / (g.length - g.thumb), 1) * g.range);
        const offset = g.range > 0 ? clamp(this.position(axis) / g.range, 1) * (g.length - g.thumb) : 0;
        this.thumbs[axis].style.cssText = axis === "vertical" ? `height:${g.thumb}px;transform:translateY(${offset}px)` : `width:${g.thumb}px;transform:translateX(${offset}px)`;
        this.tracks[axis].setAttribute("aria-valuemax", String(Math.round(g.range)));
        this.tracks[axis].setAttribute("aria-valuenow", String(Math.round(this.position(axis))));
      }
      if (applyPointer && this.page && this.pageTimer === null && this.pageTarget() !== null) this.armPage(PAGE_REPEAT_INTERVAL);
    }
    clearPageTimer() {
      if (this.pageTimer !== null) this.window.clearTimeout(this.pageTimer);
      this.pageTimer = null;
    }
    pageTarget(): number | null {
      const page = this.page; if (!page) return null;
      const g = this.geometry[page.axis], track = this.tracks[page.axis];
      if (g) g.range = Math.max(0, page.axis === "vertical" ? this.scroller.scrollHeight - this.scroller.clientHeight : this.scroller.scrollWidth - this.scroller.clientWidth);
      if (!g || track.hidden || g.range <= 0 || g.length <= g.thumb) return null;
      const rect = track.getBoundingClientRect();
      const crossStart = page.axis === "vertical" ? rect.left : rect.top;
      const crossEnd = page.axis === "vertical" ? rect.right : rect.bottom;
      if (page.cross < crossStart || page.cross > crossEnd || page.coordinate < g.start || page.coordinate > g.start + g.length) return null;
      const position = this.position(page.axis), travel = g.length - g.thumb;
      const thumbStart = g.start + position / g.range * travel;
      if (page.direction > 0 ? page.coordinate <= thumbStart + g.thumb + 0.5 : page.coordinate >= thumbStart - 0.5) return null;
      // Stop at the pointer rather than paging beyond it and oscillating.
      const boundary = clamp((page.coordinate - g.start - (page.direction > 0 ? g.thumb : 0)) / travel, 1) * g.range;
      const target = page.direction > 0 ? Math.min(position + g.client * 0.9, boundary) : Math.max(position - g.client * 0.9, boundary);
      return Math.abs(target - position) > 0.5 ? target : null;
    }
    pageStep(): boolean {
      const target = this.pageTarget(); if (target === null || !this.page) return false;
      const before = this.position(this.page.axis);
      this.setPosition(this.page.axis, target);
      if (Math.abs(this.position(this.page.axis) - before) < 0.5) return false;
      this.schedule(); return true;
    }
    armPage(delay: number) {
      if (!this.page || this.pageTimer !== null) return;
      this.pageTimer = this.window.setTimeout(() => {
        this.pageTimer = null;
        if (this.pageStep()) this.armPage(PAGE_REPEAT_INTERVAL);
      }, delay);
    }
    key(axis: Axis, event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const g = this.geometry[axis]; if (!g) return;
      const line = 40, position = this.position(axis);
      const value = event.key === "Home" ? 0 : event.key === "End" ? g.range
        : event.key === "PageUp" ? position - g.client * 0.9 : event.key === "PageDown" ? position + g.client * 0.9
          : event.key === (axis === "vertical" ? "ArrowUp" : "ArrowLeft") ? position - line
            : event.key === (axis === "vertical" ? "ArrowDown" : "ArrowRight") ? position + line : null;
      if (value === null) return;
      event.preventDefault(); event.stopPropagation(); this.stop();
      if (axis === "vertical" && (event.key === "Home" || event.key === "End")) {
        // Address the document, rather than the current estimated DOM range.
        // CodeMirror can materialize offscreen tables while settling this jump.
        this.view.dispatch({ effects: EditorView.scrollIntoView(event.key === "Home" ? 0 : this.view.state.doc.length,
          { y: event.key === "Home" ? "start" : "end" }) });
        this.pendingEdge = event.key === "Home" ? "start" : "end";
      } else this.setPosition(axis, value);
      this.schedule();
    }
    wheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const scale = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? this.scroller.clientHeight : 1;
      event.preventDefault(); this.stop();
      this.setPosition("vertical", this.scroller.scrollTop + event.deltaY * scale);
      this.setPosition("horizontal", this.scroller.scrollLeft + event.deltaX * scale);
      this.schedule();
    };
    update(update: ViewUpdate) {
      if (update.transactions.length) this.stop();
    }
    destroy() {
      this.destroyed = true; this.stop(); this.resize?.disconnect();
      this.scroller.removeEventListener("scroll", this.schedule);
      this.view.dom.removeEventListener("pointerdown", this.cancel, true);
      this.view.dom.removeEventListener("keydown", this.cancel, true);
      this.view.dom.removeEventListener("wheel", this.cancel, true);
      this.view.dom.ownerDocument.removeEventListener("visibilitychange", this.visibility);
      this.window.removeEventListener("blur", this.blur);
      this.window.removeEventListener("pagehide", this.cancel);
      for (const track of Object.values(this.tracks)) track.remove();
      if (!this.previousId) this.scroller.removeAttribute("id");
    }
  });
  return [plugin, EditorView.editorAttributes.of({ class: "has-editor-scrollbars" }),
    EditorView.updateListener.of(update => {
      // Queue our geometry read only after CodeMirror finishes its own loop.
      // Scheduling from ViewPlugin.update would extend that loop on every
      // viewport change and can prevent cold long documents from stabilizing.
      if (update.geometryChanged || update.docChanged) update.view.plugin(plugin)?.schedule();
    })] as const;
}
