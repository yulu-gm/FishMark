// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installTableCjkFont } from "./table-cjk-font";

describe("table CJK font lifecycle", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete document.documentElement.dataset.fishmarkTableCjkFont; });
  function setup() {
    let resolve!: () => void;
    let reject!: () => void;
    const load = vi.fn(() => new Promise<void>((yes, no) => { resolve = yes; reject = no; }));
    const fonts = { add: vi.fn(), delete: vi.fn() };
    const constructor = vi.fn(function() { return { load }; });
    vi.stubGlobal("FontFace", constructor);
    Object.defineProperty(document, "fonts", { value: fonts, configurable: true });
    return { resolve: () => resolve(), reject: () => reject(), fonts, constructor };
  }
  it("activates only after loading and removes the face on cleanup", async () => {
    const mock = setup(); const cleanup = installTableCjkFont(document, "Microsoft YaHei");
    expect(document.documentElement.dataset.fishmarkTableCjkFont).toBeUndefined();
    mock.resolve(); await Promise.resolve();
    expect(mock.fonts.add).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.fishmarkTableCjkFont).toBe("ready");
    cleanup(); expect(mock.fonts.delete).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.fishmarkTableCjkFont).toBeUndefined();
  });
  it("does not activate a stale load after preference change or unmount", async () => {
    const mock = setup(); const cleanup = installTableCjkFont(document, "Microsoft YaHei");
    cleanup(); mock.resolve(); await Promise.resolve();
    expect(mock.fonts.add).not.toHaveBeenCalled();
  });
  it("keeps the existing fallback when local loading fails", async () => {
    const mock = setup(); installTableCjkFont(document, "Missing font");
    mock.reject(); await Promise.resolve(); await Promise.resolve();
    expect(mock.fonts.add).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.fishmarkTableCjkFont).toBeUndefined();
  });
  it("uses exactly the preview decorator character coverage and escapes the family", () => {
    const mock = setup(); installTableCjkFont(document, 'a"b\\c');
    const args = mock.constructor.mock.calls[0] as unknown as [string, string, FontFaceDescriptors];
    expect(args[1]).toBe('local("a\\"b\\\\c")');
    const ranges = args[2].unicodeRange!.split(',').map(range => range.slice(2).split('-').map(n => parseInt(n,16)));
    for(let cp=0;cp<=0x10ffff;cp++) {
      const expected = /[\p{Script=Han}\u3000-\u303F\uFF00-\uFFEF]/u.test(String.fromCodePoint(cp));
      const actual = ranges.some(([a,b=a])=>a!==undefined && b!==undefined && cp>=a && cp<=b);
      if(actual!==expected) throw new Error(`Font coverage mismatch U+${cp.toString(16)}`);
    }
  });
});
