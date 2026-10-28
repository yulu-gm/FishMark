// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installMarkdownLinkGesture } from "./markdown-link-gesture";

afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

function fixture() {
  const addEventListener = vi.fn();
  const gesture = installMarkdownLinkGesture({ addEventListener } as unknown as Window);
  document.body.innerHTML = '<div class="cm-editor"><span data-fishmark-link-href="../报告.md">报告</span></div>';
  const link = document.querySelector("span")!;
  const dispatch = (overrides: Partial<MouseEvent> = {}) => {
    const callback = addEventListener.mock.calls[0]![1] as (event: MouseEvent) => void;
    callback({ isTrusted: true, button: 0, ctrlKey: true, target: link, ...overrides } as MouseEvent);
  };
  return { gesture, dispatch, link };
}

describe("隔离 preload 链接手势", () => {
  it("只消费本次真实点击的完整 href，不能重复使用", () => {
    const f = fixture(); f.dispatch();
    expect(f.gesture.consume("../报告.md")).toBe(true);
    expect(f.gesture.consume("../报告.md")).toBe(false);
    f.dispatch(); expect(f.gesture.consume("../other.md")).toBe(false);
    expect(f.gesture.consume("../报告.md")).toBe(false);
  });
  it.each([{ isTrusted: false }, { button: 2 }, { ctrlKey: false, metaKey: false }, { target: document.body }])("拒绝非链接打开手势 %j", overrides => {
    const f = fixture(); f.dispatch(overrides);
    expect(f.gesture.consume("../报告.md")).toBe(false);
  });
  it("支持 Command 点击，并在事件任务结束后失效", () => {
    vi.useFakeTimers(); const f = fixture();
    f.dispatch({ ctrlKey: false, metaKey: true });
    expect(f.gesture.consume("../报告.md")).toBe(true);
    f.dispatch(); vi.runAllTimers();
    expect(f.gesture.consume("../报告.md")).toBe(false);
  });
  it("捕获后修改 DOM 不会替换获准的 href", () => {
    const f = fixture(); f.dispatch(); f.link.setAttribute("data-fishmark-link-href", "../other.md");
    expect(f.gesture.consume("../other.md")).toBe(false);
  });
});
