import { describe, expect, it } from "vitest";

import { createStringTextBuffer } from "@fishmark/workspace-domain";
import { runTextBufferConformance } from "workspace-domain-test-conformance";

import * as publicApi from "./index";
import { createCodeMirrorTextBuffer } from "./index";

runTextBufferConformance("CodeMirror", createCodeMirrorTextBuffer);

describe("CodeMirror TextBuffer adapter", () => {
  it("exposes only the public factory", () => {
    expect(Object.keys(publicApi)).toEqual(["createCodeMirrorTextBuffer"]);
  });

  it("compares exact content across buffer implementations", () => {
    const codeMirror = createCodeMirrorTextBuffer("alpha\r\n鱼🙂");
    const equalString = createStringTextBuffer("alpha\r\n鱼🙂");
    const differentString = createStringTextBuffer("alpha\n鱼🙂");

    expect(codeMirror.equals(equalString)).toBe(true);
    expect(equalString.equals(codeMirror)).toBe(true);
    expect(codeMirror.equals(differentString)).toBe(false);
  });
});
