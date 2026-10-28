// @vitest-environment jsdom
import { act, createElement, createRef, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { CodeEditorHandle, CodeEditorView } from "../code-editor-view";
import { DeferredCodeEditorView } from "./DeferredCodeEditorView";

const loading = vi.hoisted(() => {
  let finish!: () => void;
  const ready = new Promise<void>(resolve => { finish = resolve; });
  return { ready, finish, receive: vi.fn() };
});
vi.mock("../code-editor-view", async () => {
  await loading.ready;
  return { CodeEditorView: (props: ComponentProps<typeof CodeEditorView>) => {
    loading.receive(props);
    return createElement("div", null, props.initialContent);
  } };
});

it("加载中卸载并切换文档后只呈现当前参数，保留 ref，后续挂载复用模块", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  const root = createRoot(host);
  const ref = createRef<CodeEditorHandle>();
  const props = { ref, initialContent: "旧文档" } as ComponentProps<typeof CodeEditorView>;
  try {
    await act(async () => { root.render(createElement(DeferredCodeEditorView, props)); });
    expect(host.textContent).toBe("");
    await act(async () => { root.render(null); });
    await act(async () => { root.render(createElement(DeferredCodeEditorView, { ...props, initialContent: "当前文档" })); });
    await act(async () => { loading.finish(); });
    await vi.waitFor(() => expect(host.textContent).toBe("当前文档"));
    expect(loading.receive.mock.calls.every(([value]) => value.initialContent === "当前文档" && value.ref === ref)).toBe(true);
    await act(async () => { root.render(null); });
    await act(async () => { root.render(createElement(DeferredCodeEditorView, { ...props, initialContent: "下一文档" })); });
    expect(host.textContent).toBe("下一文档");
  } finally {
    await act(async () => { root.unmount(); });
  }
});
