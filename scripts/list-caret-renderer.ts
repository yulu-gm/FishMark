import "../src/renderer/styles/base.css";
import "../src/renderer/styles/primitives.css";
import "../src/renderer/styles/editor-source.css";
import "../src/renderer/styles/markdown-render.css";
import { EditorView } from "@codemirror/view";
import { createCodeEditorController } from "../src/renderer/code-editor";
const baseSource = "Paragraph control.\n\n- Plain list\n\n1. Ordered list\n\n- [ ] Task list\n\n- Parent list\n  - Nested list\n\n> - Quoted list\n>   - Quoted nested\n\nTail.";
const source = new URLSearchParams(location.search).has("extra")
    ? baseSource.replace("Tail.", "-   Wide space list\n\n-\tTab list\n\n- **Bold list**\n\nTail.") : baseSource;
document.body.style.cssText = "margin:0;background:white;color:#111827;--fishmark-caret-color:#ff0000;--fishmark-document-font-family:Georgia;--fishmark-document-font-size:18px";
const root = document.getElementById("probe-root")!;
root.className = "document-editor";
root.style.cssText = "height:740px;width:860px";
const controller = createCodeEditorController({ parent: root, initialContent: source, onChange: () => undefined });
if (new URLSearchParams(location.search).get("variant") === "prefix-box") {
    const style = document.createElement("style");
    style.textContent = ".document-editor .cm-inactive-list-source-prefix:last-of-type {display:inline-block;width:0;height:1em;font-size:inherit;line-height:1;vertical-align:baseline;caret-color:var(--fishmark-caret-color);overflow:visible;white-space:pre;word-spacing:-1em}";
    document.head.append(style);
}
const view = EditorView.findFromDOM(root.querySelector<HTMLElement>(".cm-editor")!)!;
const rect = (r: DOMRect | null) => r ? Object.fromEntries(["left", "right", "top", "bottom", "width", "height"].map(k => [k, r[k as keyof DOMRect]])) : null;
function snapshot() {
    const selection = getSelection(), range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const node = selection?.focusNode, parent = node instanceof Element ? node : node?.parentElement;
    const line = parent?.closest(".cm-line"), css = parent ? getComputedStyle(parent) : null;
    return { selection: controller.getSelection(), source: controller.getContent(), hasFocus: document.hasFocus(), active: document.activeElement?.className, domSelection: { parentClass: parent?.className, offset: selection?.focusOffset, range: rect(range?.getBoundingClientRect() ?? null) }, line: { rect: rect(line?.getBoundingClientRect() ?? null), html: line?.innerHTML }, styles: css ? { fontSize: css.fontSize, lineHeight: css.lineHeight, caretColor: css.caretColor, overflow: css.overflow, position: css.position } : null, cursorLayers: [...root.querySelectorAll<HTMLElement>(".cm-cursor")].map(e => ({ rect: rect(e.getBoundingClientRect()), display: getComputedStyle(e).display })), coords: view.coordsAtPos(view.state.selection.main.head), scrollTop: view.scrollDOM.scrollTop };
}
const events: unknown[] = [];
for (const type of ["keydown", "keyup", "mousedown", "mouseup", "click", "focusin", "focusout"])
    document.addEventListener(type, event => events.push({ type, trusted: event.isTrusted, key: event instanceof KeyboardEvent ? event.key : null, state: snapshot() }), true);
window.__listCaret = { source, events, snapshot, prepare(label: string, offset = 1) { const pos = source.indexOf(label); if (pos < 0)
        throw Error("No fixture label"); controller.setSelection(pos + offset); controller.focus(); return snapshot(); }, sourceMode(enabled: boolean) { controller.setViewMode(enabled ? "source" : "wysiwym"); }, point(label: string) { const line = [...root.querySelectorAll<HTMLElement>(".cm-line")].find(e => e.textContent?.includes(label))!; const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT); let n; while ((n = walker.nextNode()))
        if (n.textContent?.includes(label)) {
            const r = document.createRange();
            const i = n.textContent.indexOf(label);
            r.setStart(n, i);
            r.setEnd(n, i + 1);
            const b = r.getBoundingClientRect();
            return { x: Math.round(b.left), y: Math.round((b.top + b.bottom) / 2) };
        } throw Error("No label text"); } };
declare global {
    interface Window {
        __listCaret: {
            source: string;
            events: unknown[];
            snapshot: typeof snapshot;
            prepare: (label: string, offset?: number) => ReturnType<typeof snapshot>;
            sourceMode: (enabled: boolean) => void;
            point: (label: string) => {
                x: number;
                y: number;
            };
        };
    }
}
