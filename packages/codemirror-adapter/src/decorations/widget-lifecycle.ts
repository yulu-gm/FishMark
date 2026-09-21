// The measurement target is described structurally on purpose: a widget only needs the view DOM
// plus a re-measure.

export type WidgetMeasurementTarget = {
  readonly dom: { contains(other: Node | null): boolean };
  requestMeasure(): void;
};

// Widget DOM is created synchronously but filled asynchronously (KaTeX, Mermaid, image loading).
// The continuation must not touch a container the view already discarded, and an accepted size
// change must ask CodeMirror to re-measure, otherwise the height map, caret geometry and scroll
// anchors keep the pre-render size.
export function isWidgetMounted(view: WidgetMeasurementTarget, container: HTMLElement): boolean {
  return container.isConnected && view.dom.contains(container);
}

export function requestMountedWidgetMeasurement(
  view: WidgetMeasurementTarget,
  container: HTMLElement
): void {
  if (!isWidgetMounted(view, container)) {
    return;
  }

  view.requestMeasure();
}

export function completeMountedWidget(
  view: WidgetMeasurementTarget,
  container: HTMLElement,
  fill: () => void
): void {
  if (!isWidgetMounted(view, container)) {
    return;
  }

  fill();
  view.requestMeasure();
}
