// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createCodeEditorController } from "./code-editor";

describe("正文段落换行", () => {
  it("Enter、Enter、Backspace 创建段落后删除一个完整空段落", () => {
    const host = document.createElement("div");
    const editor = createCodeEditorController({ parent: host, initialContent: "111\n222", onChange: vi.fn() });
    try {
      editor.setSelection(3);
      editor.pressEnter();
      expect(editor.getContent()).toBe("111\n\n222");
      expect(editor.getSelection()).toEqual({ anchor: 5, head: 5 });
      editor.pressEnter();
      expect(editor.getContent()).toBe("111\n\n\n\n222");
      expect(editor.getSelection()).toEqual({ anchor: 7, head: 7 });
      editor.pressBackspace();
      expect(editor.getContent()).toBe("111\n\n222");
      expect(editor.getSelection()).toEqual({ anchor: 5, head: 5 });
    } finally { editor.destroy(); }
  });
});
