import { describe, expect, it } from "vitest";
import { resizeImageSource } from "./image-resize";

function resize(source: string, overrides: Partial<Parameters<typeof resizeImageSource>[0]> = {}) {
  return resizeImageSource({ source, from: 0, to: source.length, kind: "markdown", href: "a.png", alt: "alt", title: null, width: 135.6, ...overrides });
}

describe("image resize source edit", () => {
  it("preserves source, alt and title when converting a standalone image", () => {
    expect(resize('![alt](a.png "caption")', { title: "caption" })).toBe('<img src="a.png" alt="alt" title="caption" width="136" />');
  });
  it("does not destroy reference semantics or unsafe attributes", () => {
    expect(resize("![alt][id]")).toBeNull();
    expect(resize("text ![alt](a.png) tail", { from: 5, to: 18 })).toBe('<img src="a.png" alt="alt" width="136" />');
    expect(resize("![alt](a.png)", { href: 'a.png?x=1&y=2' })).toBeNull();
    expect(resize("![*alt*](a.png)")).toBeNull();
  });
  it("replaces conflicting dimensions while retaining unrelated HTML and CSS", () => {
    const source = '<div align="right"><img src="a.png" alt="alt" title="title" height="200" style="zoom:50%; border: 1px solid red" /></div>';
    expect(resize(source, { kind: "html" })).toBe('<div align="right"><img src="a.png" alt="alt" title="title" style=" border: 1px solid red" width="136" /></div>');
  });
  it("does not mistake text inside an attribute for another attribute", () => {
    const source = `<img src="a.png" title=" width='keep'" width="200">`;
    expect(resize(source, { kind: "html" })).toBe(`<img src="a.png" title=" width='keep'" width="136" />`);
  });
  it("rejects ambiguous attributes and invalid dimensions", () => {
    expect(resize('<img src="a" width="2" width="3">', { kind: "html" })).toBeNull();
    expect(resize("![alt](a.png)", { width: NaN })).toBeNull();
  });
});
