// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { isWorkspaceTabDropTarget } from "./workspace-tab-drop-target";

const original = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
afterEach(() => {
  document.body.innerHTML = "";
  if (original) Object.defineProperty(document, "elementFromPoint", original);
  else Reflect.deleteProperty(document, "elementFromPoint");
});

function hit(markup: string, selector: string) {
  document.body.innerHTML = markup;
  const element = document.querySelector(selector);
  expect(element).not.toBeNull();
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => element) });
  return isWorkspaceTabDropTarget({ x: 20, y: 30 });
}

describe("workspace tab drop targets", () => {
  it("accepts blank home canvas without a tab strip", () => {
    expect(hit('<section data-fishmark-region="workspace-canvas" data-fishmark-has-document="false"><div><p>Welcome</p></div></section>', 'p')).toBe(true);
  });

  it.each(['button', 'a', 'input', 'textarea', 'select', '[role="button"]'])("rejects interactive home element %s", selector => {
    const formControl = ['input', 'textarea', 'select'].includes(selector);
    const inner = selector === '[role="button"]' ? '<div role="button"><span></span></div>' : formControl ? `<${selector}></${selector}>` : `<${selector}><span></span></${selector}>`;
    expect(hit(`<section data-fishmark-region="workspace-canvas" data-fishmark-has-document="false">${inner}</section>`, formControl ? selector : `${selector} span`)).toBe(false);
  });

  it("accepts the visible strip and rejects a collapsed strip or document body", () => {
    expect(hit('<div data-fishmark-region="workspace-tab-strip" data-visibility="visible"><span></span></div>', 'span')).toBe(true);
    expect(hit('<div data-fishmark-region="workspace-tab-strip" data-visibility="collapsed"><span></span></div>', 'span')).toBe(false);
    expect(hit('<section data-fishmark-region="workspace-canvas" data-fishmark-has-document="true"><p>Document</p></section>', 'p')).toBe(false);
  });

  it("rejects non-finite coordinates before hit testing", () => {
    const elementFromPoint = vi.fn();
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: elementFromPoint });
    expect(isWorkspaceTabDropTarget({ x: Number.NaN, y: 0 })).toBe(false);
    expect(isWorkspaceTabDropTarget({ x: 0, y: Number.POSITIVE_INFINITY })).toBe(false);
    expect(elementFromPoint).not.toHaveBeenCalled();
  });
});
