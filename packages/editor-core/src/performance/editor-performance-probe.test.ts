// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { EditorView } from "@codemirror/view";

import { createLongMarkdownFixture } from "./long-document-fixtures";
import {
  measureEditorPerformanceProbe
} from "./editor-performance-probe";

describe("measureEditorPerformanceProbe", () => {
  it("records honest open, edit, selection, and ordered-list operation evidence", () => {
    const fixture = createLongMarkdownFixture({
      kind: "mixed-blocks",
      lineCount: 5000
    });
    const report = measureEditorPerformanceProbe({
      source: fixture.source
    });

    expect(report.fixture).toEqual({
      lineCount: 5000,
      sourceLength: fixture.source.length
    });
    expect(report.operations.map((operation) => operation.name)).toEqual([
      "open",
      "edit",
      "selection",
      "orderedListEdit"
    ]);

    for (const operation of report.operations) {
      expect(Number.isFinite(operation.durationMs)).toBe(true);
      expect(operation.durationMs).toBeGreaterThanOrEqual(0);
      expect(operation.capabilityRefs).toEqual(["incrementalStructureCache"]);
      expect(operation.unavailableCapabilityReason).toBeNull();

      for (const counter of Object.values(operation.counters)) {
        expect(Number.isInteger(counter)).toBe(true);
        expect(counter).toBeGreaterThanOrEqual(0);
      }

      for (const count of Object.values(operation.parserEntries)) {
        expect(Number.isInteger(count)).toBe(true);
        expect(count).toBeGreaterThanOrEqual(0);
      }

      expect(operation.counters.fullParse).toBeGreaterThanOrEqual(
        operation.parserEntries.parseMarkdownDocument + operation.parserEntries.parseOrderedListNormalization
      );
    }

    const open = report.operations.find((operation) => operation.name === "open");
    const edit = report.operations.find((operation) => operation.name === "edit");
    const selection = report.operations.find((operation) => operation.name === "selection");
    const orderedListEdit = report.operations.find(
      (operation) => operation.name === "orderedListEdit"
    );

    expect(open?.parserEntries.parseMarkdownDocument).toBeGreaterThan(0);
    expect(open?.counters.fullParse).toBeGreaterThan(
      (open?.parserEntries.parseMarkdownDocument ?? 0) + (open?.parserEntries.parseOrderedListNormalization ?? 0)
    );
    expect(open?.counters.decorationRebuild).toBeGreaterThan(0);
    expect(edit?.parserEntries.parseMarkdownDocument).toBe(0);
    expect(edit?.counters.invalidatedNodes).toBeGreaterThan(0);
    expect(selection?.counters.fullParse).toBe(0);
    expect(selection?.counters.cacheHit).toBeGreaterThan(0);
    expect(orderedListEdit?.parserEntries.parseOrderedListNormalization).toBe(0);
    expect(orderedListEdit?.counters.fullParse).toBeGreaterThan(0);
  }, 15_000);

  it("counts real incremental windows for warm plain text and real fallback parses for structural input", () => {
    const report = measureEditorPerformanceProbe({ source: "Paragraph\n\n1. Ordered item" });
    const edit = report.operations.find(operation => operation.name === "edit")!;
    expect(edit.counters.fullParse).toBe(0);
    expect(edit.counters.incrementalParseWindow).toBeGreaterThan(0);
    expect(edit.counters.invalidatedNodes).toBeGreaterThan(0);
    const structural = report.operations.find(operation => operation.name === "orderedListEdit")!;
    expect(structural.counters.fullParse).toBeGreaterThan(0);
    expect(structural.counters.incrementalParseWindow).toBe(0);
  });

  it("removes the host when EditorView construction throws after the host is appended", () => {
    const bodyChildrenBefore = Array.from(document.body.childNodes);
    const originalBodyAppendChild = document.body.appendChild;

    document.body.appendChild = ((node: Node) => {
      const appended = originalBodyAppendChild.call(document.body, node);

      if (node instanceof HTMLDivElement) {
        node.appendChild = (() => {
          throw new Error("forced EditorView construction failure");
        }) as typeof node.appendChild;
      }

      return appended;
    }) as typeof document.body.appendChild;

    try {
      expect(() =>
        measureEditorPerformanceProbe({ source: "# Heading\n\nParagraph" })
      ).toThrow("forced EditorView construction failure");
    } finally {
      document.body.appendChild = originalBodyAppendChild;
    }

    expect(Array.from(document.body.childNodes)).toEqual(bodyChildrenBefore);
  });

  it("removes the host even when EditorView destruction throws", () => {
    const bodyChildrenBefore = Array.from(document.body.childNodes);
    const originalDestroy = EditorView.prototype.destroy;

    EditorView.prototype.destroy = function destroyWithFailure(): void {
      originalDestroy.call(this);
      throw new Error("forced EditorView destruction failure");
    };

    try {
      expect(() =>
        measureEditorPerformanceProbe({
          source: "# Heading\n\nParagraph\n\n1. Ordered item"
        })
      ).toThrow("forced EditorView destruction failure");
    } finally {
      EditorView.prototype.destroy = originalDestroy;
    }

    expect(Array.from(document.body.childNodes)).toEqual(bodyChildrenBefore);
  });
});

