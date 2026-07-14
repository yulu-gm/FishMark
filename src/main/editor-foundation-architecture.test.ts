import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  validateEditorFoundationArchitecture,
  type EditorFoundationArchitectureResult
} from "./editor-foundation-architecture";

type MutableRecord = Record<string, unknown>;

const temporaryRepositories: string[] = [];

afterEach(() => {
  for (const repository of temporaryRepositories.splice(0)) {
    rmSync(repository, { force: true, recursive: true });
  }
});

describe("editor foundation architecture guard", () => {
  it("accepts the real repository and canonical versioned manifest", () => {
    const manifest = readCanonicalManifest();

    expect(manifest.schemaVersion).toBe(1);
    expect((manifest.rules as unknown[]).length).toBeGreaterThan(0);
    expect(validateEditorFoundationArchitecture({ manifest, rootDir: process.cwd() })).toEqual({
      findings: [],
      ok: true
    });
  });

  it.each([
    ["markdown-engine", "packages/markdown-engine/src/forbidden.ts", 'import React from "react";'],
    [
      "markdown-engine CodeMirror",
      "packages/markdown-engine/src/forbidden.ts",
      'import type { Text } from "@codemirror/state"; export type Forbidden = Text;'
    ],
    [
      "markdown-engine editor-core",
      "packages/markdown-engine/src/forbidden.ts",
      'import { editorCore } from "@fishmark/editor-core"; void editorCore;'
    ],
    ["editor-core", "packages/editor-core/src/forbidden.ts", 'import { app } from "electron";'],
    ["renderer", "src/renderer/forbidden.ts", 'import "../main/secret";'],
    ["preload", "src/preload/forbidden.ts", 'import "../renderer/secret";'],
    ["main", "src/main/forbidden.ts", 'import "../preload/secret";']
  ])("rejects a forbidden import in the %s boundary family", (_family, path, source) => {
    const repository = createSyntheticRepository({ [path]: source });

    expect(expectCodes(validateSynthetic(repository))).toContain("forbidden-import");
  });

  it("keeps CodeMirror legal in editor-core until the registered adapter cutover", () => {
    const repository = createSyntheticRepository({
      "packages/editor-core/src/codemirror-current.ts":
        'import type { Text } from "@codemirror/state"; export type CurrentText = Text;'
    });

    expect(validateSynthetic(repository)).toEqual({ findings: [], ok: true });
  });

  it.each([
    [
      "missing forbidden-import source directory",
      (manifest: MutableRecord) => {
        findRule(manifest, "boundary.renderer").sourcePath = "src/renderer-typo";
      },
      "active-rule-path-missing"
    ],
    [
      "forbidden-import source that is a file",
      (manifest: MutableRecord) => {
        findRule(manifest, "boundary.renderer").sourcePath = "src/renderer/index.ts";
      },
      "active-rule-path-not-directory"
    ],
    [
      "missing public-entry source directory",
      (manifest: MutableRecord) => {
        findRule(manifest, "boundary.public-package-entries").sourcePaths = ["src-typo", "packages"];
      },
      "active-rule-path-missing"
    ],
    [
      "empty public-entry source directories",
      (manifest: MutableRecord) => {
        findRule(manifest, "boundary.public-package-entries").sourcePaths = [];
      },
      "active-rule-source-paths-empty"
    ],
    [
      "public-entry packages path that is a file",
      (manifest: MutableRecord) => {
        findRule(manifest, "boundary.public-package-entries").packagesPath = "packages/editor-core/src/index.ts";
      },
      "active-rule-path-not-directory"
    ]
  ])("fails closed for an active rule with %s", (_name, mutate, expectedCode) => {
    const repository = createSyntheticRepository();
    const manifest = readSyntheticManifest(repository);
    mutate(manifest);

    expect(expectCodes(validateSynthetic(repository, manifest))).toContain(expectedCode);
  });

  it("detects string-literal dynamic imports and re-exports", () => {
    const dynamicRepository = createSyntheticRepository({
      "src/renderer/dynamic.ts": 'void import("../main/secret");'
    });
    const reexportRepository = createSyntheticRepository({
      "src/preload/reexport.ts": 'export { secret } from "../renderer/secret";'
    });

    expect(expectCodes(validateSynthetic(dynamicRepository))).toContain("forbidden-import");
    expect(expectCodes(validateSynthetic(reexportRepository))).toContain("forbidden-import");
  });

  it("detects a literal dynamic import that includes import attributes", () => {
    const repository = createSyntheticRepository({
      "src/renderer/dynamic-options.ts": 'void import("../main/secret", { with: {} });'
    });

    expect(expectCodes(validateSynthetic(repository))).toContain("forbidden-import");
  });

  it("ignores comments and arbitrary strings that resemble imports", () => {
    const repository = createSyntheticRepository({
      "src/renderer/not-an-import.ts": [
        '// import "../main/secret";',
        `const sample = 'import("../main/secret")';`,
        "void sample;"
      ].join("\n")
    });

    expect(validateSynthetic(repository)).toEqual({ findings: [], ok: true });
  });

  it("rejects a cross-package internal import without an exact exception", () => {
    const repository = createSyntheticRepository({
      "src/renderer/internal.ts":
        'import { parseInlineAst } from "../../packages/markdown-engine/src/parse-inline-ast"; void parseInlineAst;'
    });

    expect(expectCodes(validateSynthetic(repository))).toContain("non-public-package-import");
  });

  it("accepts an exact exception and rejects it once it becomes stale", () => {
    const importer = "src/renderer/internal.ts";
    const specifier = "../../packages/markdown-engine/src/parse-inline-ast";
    const repository = createSyntheticRepository({
      [importer]: `import { parseInlineAst } from "${specifier}"; void parseInlineAst;`
    });
    const manifest = readSyntheticManifest(repository);
    manifest.exceptions = [createException({ importer, specifier })];

    expect(validateSynthetic(repository, manifest)).toEqual({ findings: [], ok: true });

    writeRepositoryFile(repository, importer, "export const clean = true;");
    expect(expectCodes(validateSynthetic(repository, manifest))).toContain("stale-exception");
  });

  it.each([
    ["wildcard importer", { importer: "src/renderer/*.ts" }, "invalid-exception"],
    ["wildcard specifier", { specifier: "../../packages/*/src/index" }, "invalid-exception"],
    ["missing owner", { owner: "" }, "invalid-exception"],
    ["missing reason", { reason: "" }, "invalid-exception"],
    ["missing retirement", { retireIn: "" }, "missing-retirement-task"],
    ["unknown retirement", { retireIn: "RF-999" }, "unknown-retirement-task"]
  ])("rejects a malformed exception: %s", (_name, change, expectedCode) => {
    const repository = createSyntheticRepository();
    const manifest = readSyntheticManifest(repository);
    manifest.exceptions = [createException(change)];

    expect(expectCodes(validateSynthetic(repository, manifest))).toContain(expectedCode);
  });

  it("accepts retirement IDs only from roadmap task headings", () => {
    const repository = createSyntheticRepository({
      "docs/refactor/editor-foundation/roadmap.md": [
        "#### RF-405: Parser hard cutover",
        "#### RF-604: Adapter hard cutover",
        "A prose note mentions RF-999 but does not define that task."
      ].join("\n")
    });
    const manifest = readSyntheticManifest(repository);
    manifest.exceptions = [createException({ retireIn: "RF-999" })];

    expect(expectCodes(validateSynthetic(repository, manifest))).toContain("unknown-retirement-task");
  });

  it.each([
    [
      "duplicate IDs",
      (manifest: MutableRecord) => {
        const rules = manifest.rules as MutableRecord[];
        rules[1] = { ...rules[1], id: rules[0]?.id };
      },
      "duplicate-id"
    ],
    [
      "unknown rule kinds",
      (manifest: MutableRecord) => {
        (manifest.rules as MutableRecord[])[0]!.kind = "allow-everything";
      },
      "unknown-rule-kind"
    ],
    [
      "escaping paths",
      (manifest: MutableRecord) => {
        (manifest.rules as MutableRecord[])[0]!.sourcePath = "../outside";
      },
      "invalid-path"
    ],
    [
      "empty active rules",
      (manifest: MutableRecord) => {
        manifest.rules = [];
      },
      "empty-active-rules"
    ]
  ])("fails closed for %s", (_name, mutate, expectedCode) => {
    const repository = createSyntheticRepository();
    const manifest = readSyntheticManifest(repository);
    mutate(manifest);

    expect(expectCodes(validateSynthetic(repository, manifest))).toContain(expectedCode);
  });

  it("rejects a planned target package that appears before its boundary is activated", () => {
    const repository = createSyntheticRepository();
    mkdirSync(resolve(repository, "packages/editor-model/src"), { recursive: true });

    expect(expectCodes(validateSynthetic(repository))).toContain("planned-package-present");
  });

  it("rejects an active package path that resolves to a file", () => {
    const repository = createSyntheticRepository();
    const manifest = readSyntheticManifest(repository);
    const markdownEngine = (manifest.packages as MutableRecord[]).find(
      (targetPackage) => targetPackage.id === "markdown-engine"
    );
    if (!markdownEngine) {
      throw new Error("Missing synthetic markdown-engine package");
    }
    markdownEngine.path = "packages/markdown-engine/src/index.ts";

    expect(expectCodes(validateSynthetic(repository, manifest))).toContain("active-package-not-directory");
  });

  it.each([
    ["missing engine directory", "packages/markdown-engine-missing", "parser-engine-path-missing"],
    ["engine path that is a file", "packages/markdown-engine/src/index.ts", "parser-engine-path-not-directory"]
  ])("fails closed for parserPolicy %s", (_name, enginePath, expectedCode) => {
    const repository = createSyntheticRepository();
    const manifest = readSyntheticManifest(repository);
    (manifest.parserPolicy as MutableRecord).enginePath = enginePath;

    expect(expectCodes(validateSynthetic(repository, manifest))).toContain(expectedCode);
  });

  it("rejects an empty parserPolicy governedSourcePaths array", () => {
    const repository = createSyntheticRepository();
    const manifest = readSyntheticManifest(repository);
    (manifest.parserPolicy as MutableRecord).governedSourcePaths = [];

    expect(expectCodes(validateSynthetic(repository, manifest))).toContain("parser-governed-source-paths-empty");
  });

  it("rejects a parserPolicy governed source path that resolves to a file", () => {
    const repository = createSyntheticRepository();
    const manifest = readSyntheticManifest(repository);
    (manifest.parserPolicy as MutableRecord).governedSourcePaths = ["src/renderer/index.ts", "packages"];

    expect(expectCodes(validateSynthetic(repository, manifest))).toContain("active-rule-path-not-directory");
  });

  it("reports a parser public entry that is not a file without throwing", () => {
    const repository = createSyntheticRepository();
    const manifest = readSyntheticManifest(repository);
    (manifest.parserPolicy as MutableRecord).publicEntryPath = "packages/markdown-engine/src";
    let result: EditorFoundationArchitectureResult | undefined;

    expect(() => {
      result = validateSynthetic(repository, manifest);
    }).not.toThrow();
    expect(expectCodes(result!)).toContain("parser-public-entry-not-file");
  });

  it("rejects a new unregistered public parser re-export", () => {
    const repository = createSyntheticRepository({
      "packages/markdown-engine/src/index.ts": [
        syntheticPublicParserExports,
        'export { parseNewDocument } from "./parse-new-document";'
      ].join("\n"),
      "packages/markdown-engine/src/parse-new-document.ts":
        "export function parseNewDocument(source: string): string { return source; }"
    });

    expect(expectCodes(validateSynthetic(repository))).toContain("unregistered-public-parser");
  });

  it("rejects a public alias of a registered document parser", () => {
    const repository = createSyntheticRepository({
      "packages/markdown-engine/src/index.ts": [
        syntheticPublicParserExports,
        'export { parseMarkdownDocument as readMarkdownDocument } from "./parse-markdown-document";'
      ].join("\n")
    });

    expect(expectCodes(validateSynthetic(repository))).toContain("unregistered-public-parser");
  });

  it("rejects a local named parser export in the public entry", () => {
    const repository = createSyntheticRepository({
      "packages/markdown-engine/src/index.ts": [
        syntheticPublicParserExports,
        "const parseNewDocument = (source: string): string => source;",
        "export { parseNewDocument };"
      ].join("\n")
    });

    expect(expectCodes(validateSynthetic(repository))).toContain("unregistered-public-parser");
  });

  it("rejects a locally imported alias that is re-exported as a public parser surface", () => {
    const repository = createSyntheticRepository({
      "packages/markdown-engine/src/index.ts": [
        syntheticPublicParserExports,
        'import { parseMarkdownDocument as readDocument } from "./parse-markdown-document";',
        "export { readDocument };"
      ].join("\n")
    });

    expect(expectCodes(validateSynthetic(repository))).toContain("unregistered-public-parser");
  });

  it("rejects a new internal parse export without relying on document-name suffixes", () => {
    const repository = createSyntheticRepository({
      "packages/markdown-engine/src/parse-document-tree.ts":
        "export function parseDocumentTree(source: string): string { return source; }"
    });

    expect(expectCodes(validateSynthetic(repository))).toContain("unregistered-document-parser-export");
  });

  it("rejects a new direct micromark document parse site", () => {
    const repository = createSyntheticRepository({
      "packages/markdown-engine/src/parse-unregistered.ts": [
        'import { parse, preprocess } from "micromark";',
        'export function scan(source: string): unknown { return parse().document().write(preprocess()(source, "utf8", true)); }'
      ].join("\n")
    });

    expect(expectCodes(validateSynthetic(repository))).toContain("unregistered-micromark-document-site");
  });

  it.each([
    "src/renderer/direct-micromark.ts",
    "packages/editor-core/src/direct-micromark.ts"
  ])("rejects a direct micromark document parse outside markdown-engine at %s", (path) => {
    const repository = createSyntheticRepository({
      [path]: [
        'import { parse } from "micromark";',
        "export function parseCurrentDocument(source: string): unknown { return parse().document().write(source); }"
      ].join("\n")
    });

    expect(expectCodes(validateSynthetic(repository))).toContain("unregistered-micromark-document-site");
  });

  it.each([
    [
      "present-until symbol disappears",
      (manifest: MutableRecord, repository: string) => {
        writeRepositoryFile(repository, "packages/markdown-engine/src/parse-inline-ast.ts", "export const other = true;");
        const inline = findParserEntry(manifest, "parser.parse-inline-ast");
        inline.lifecycle = { state: "present-until", retireIn: "RF-405" };
      },
      "required-parser-symbol-missing"
    ],
    [
      "forbidden public symbol remains",
      (manifest: MutableRecord) => {
        findParserEntry(manifest, "parser.parse-inline-ast").lifecycle = { state: "forbidden" };
      },
      "forbidden-parser-symbol-present"
    ],
    [
      "removed symbol remains in its module",
      (manifest: MutableRecord) => {
        findParserEntry(manifest, "parser.parse-inline-ast").lifecycle = { state: "removed" };
      },
      "removed-parser-symbol-present"
    ]
  ])("enforces parser lifecycle when a %s", (_name, mutate, expectedCode) => {
    const repository = createSyntheticRepository();
    const manifest = readSyntheticManifest(repository);
    mutate(manifest, repository);

    expect(expectCodes(validateSynthetic(repository, manifest))).toContain(expectedCode);
  });

  it("rejects an internal parser that becomes a public re-export", () => {
    const repository = createSyntheticRepository({
      "packages/markdown-engine/src/index.ts": [
        syntheticPublicParserExports,
        'export { parseTopLevelBlocks } from "./parse-block-map";'
      ].join("\n")
    });

    expect(expectCodes(validateSynthetic(repository))).toContain("internal-parser-publicly-exported");
  });

  it("sorts findings deterministically", () => {
    const repository = createSyntheticRepository({
      "src/renderer/z-last.ts": 'import "../main/z";',
      "src/renderer/a-first.ts": 'import "../main/a";'
    });
    const result = validateSynthetic(repository);
    const sorted = [...result.findings].sort((left, right) =>
      [left.code, left.path ?? "", left.ruleId ?? "", left.message].join("|").localeCompare(
        [right.code, right.path ?? "", right.ruleId ?? "", right.message].join("|")
      )
    );

    expect(result.findings).toEqual(sorted);
  });
});

const syntheticPublicParserExports = [
  'export { parseMarkdownDocument } from "./parse-markdown-document";',
  'export { parseBlockMap } from "./parse-block-map";',
  'export { parseInlineAst } from "./parse-inline-ast";'
].join("\n");

function createSyntheticRepository(overrides: Record<string, string> = {}): string {
  const repository = mkdtempSync(resolve(tmpdir(), "fishmark-architecture-"));
  temporaryRepositories.push(repository);

  const files: Record<string, string> = {
    "docs/refactor/editor-foundation/roadmap.md": ["#### RF-405: Parser hard cutover", "#### RF-604: Adapter hard cutover"].join("\n"),
    "packages/editor-core/src/index.ts": "export const editorCore = true;",
    "packages/markdown-engine/src/index.ts": syntheticPublicParserExports,
    "packages/markdown-engine/src/parse-block-map.ts": [
      'import { parse } from "micromark";',
      "export function parseBlockMap(source: string): unknown { return parse().document().write(source); }",
      "export function parseTopLevelBlocks(source: string): unknown { return parse().document().write(source); }"
    ].join("\n"),
    "packages/markdown-engine/src/parse-inline-ast.ts":
      "export function parseInlineAst(source: string): string { return source; }",
    "packages/markdown-engine/src/parse-markdown-document.ts": [
      'import { parse } from "micromark";',
      "export function parseMarkdownDocument(source: string): unknown { return parse().document().write(source); }"
    ].join("\n"),
    "src/main/index.ts": "export const main = true;",
    "src/preload/index.ts": "export const preload = true;",
    "src/renderer/index.ts": "export const renderer = true;"
  };

  for (const [path, source] of Object.entries({ ...files, ...overrides })) {
    writeRepositoryFile(repository, path, source);
  }

  const manifest = createSyntheticManifest();
  writeRepositoryFile(
    repository,
    "fixtures/architecture/editor-foundation-guard.json",
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  return repository;
}

function createSyntheticManifest(): MutableRecord {
  return {
    schemaVersion: 1,
    roadmapPath: "docs/refactor/editor-foundation/roadmap.md",
    packages: [
      {
        id: "markdown-engine",
        path: "packages/markdown-engine",
        publicEntry: "@fishmark/markdown-engine",
        state: "active",
        boundaryRuleId: "boundary.markdown-engine"
      },
      {
        id: "editor-core",
        path: "packages/editor-core",
        publicEntry: "@fishmark/editor-core",
        state: "active",
        boundaryRuleId: "boundary.editor-core"
      },
      {
        id: "editor-model",
        path: "packages/editor-model",
        publicEntry: "@fishmark/editor-model",
        state: "planned",
        boundaryRuleId: "boundary.editor-model"
      }
    ],
    rules: [
      {
        id: "boundary.markdown-engine",
        kind: "forbidden-imports",
        state: "active",
        sourcePath: "packages/markdown-engine",
        forbiddenPackages: ["react", "react-dom", "electron", "@codemirror/*", "@fishmark/editor-core"],
        forbiddenPaths: ["src/main", "src/preload", "src/renderer", "packages/editor-core"]
      },
      {
        id: "boundary.editor-core",
        kind: "forbidden-imports",
        state: "active",
        sourcePath: "packages/editor-core",
        forbiddenPackages: ["react", "react-dom", "electron"],
        forbiddenPaths: ["src/main", "src/preload", "src/renderer"]
      },
      {
        id: "boundary.renderer",
        kind: "forbidden-imports",
        state: "active",
        sourcePath: "src/renderer",
        forbiddenPackages: [],
        forbiddenPaths: ["src/main", "src/preload"]
      },
      {
        id: "boundary.preload",
        kind: "forbidden-imports",
        state: "active",
        sourcePath: "src/preload",
        forbiddenPackages: [],
        forbiddenPaths: ["src/main", "src/renderer"]
      },
      {
        id: "boundary.main",
        kind: "forbidden-imports",
        state: "active",
        sourcePath: "src/main",
        forbiddenPackages: [],
        forbiddenPaths: ["src/preload", "src/renderer"]
      },
      {
        id: "boundary.public-package-entries",
        kind: "public-package-entry",
        state: "active",
        sourcePaths: ["src", "packages"],
        packagesPath: "packages",
        publicPrefix: "@fishmark/"
      }
    ],
    exceptions: [],
    parserPolicy: {
      enginePath: "packages/markdown-engine/src",
      publicEntryPath: "packages/markdown-engine/src/index.ts",
      governedSourcePaths: ["src", "packages"]
    },
    parserEntries: [
      createParserEntry(
        "parser.parse-markdown-document",
        "packages/markdown-engine/src/parse-markdown-document.ts",
        "parseMarkdownDocument",
        "public",
        "rich-document",
        "full-document",
        { state: "present-until", retireIn: "RF-405" }
      ),
      createParserEntry(
        "parser.parse-block-map",
        "packages/markdown-engine/src/parse-block-map.ts",
        "parseBlockMap",
        "public",
        "lean-legacy-document",
        "full-document",
        { state: "present-until", retireIn: "RF-405" }
      ),
      createParserEntry(
        "parser.parse-top-level-blocks",
        "packages/markdown-engine/src/parse-block-map.ts",
        "parseTopLevelBlocks",
        "internal-export",
        "legacy-top-level-document",
        "full-document",
        { state: "present-until", retireIn: "RF-405" }
      ),
      createParserEntry(
        "parser.parse-inline-ast",
        "packages/markdown-engine/src/parse-inline-ast.ts",
        "parseInlineAst",
        "public",
        "inline-range",
        "inline-range",
        { state: "present" }
      )
    ],
    micromarkDocumentSites: [
      createMicromarkSite(
        "micromark-document.parse-markdown-document",
        "packages/markdown-engine/src/parse-markdown-document.ts"
      ),
      createMicromarkSite(
        "micromark-document.parse-block-map",
        "packages/markdown-engine/src/parse-block-map.ts"
      )
    ]
  };
}

function createParserEntry(
  id: string,
  module: string,
  symbol: string,
  visibility: string,
  role: string,
  scope: string,
  lifecycle: MutableRecord
): MutableRecord {
  return { id, lifecycle, module, role, scope, symbol, visibility };
}

function createMicromarkSite(id: string, module: string): MutableRecord {
  return {
    id,
    lifecycle: { state: "present-until", retireIn: "RF-405" },
    module
  };
}

function createException(overrides: MutableRecord = {}): MutableRecord {
  return {
    id: "exception.synthetic-internal-import",
    ruleId: "boundary.public-package-entries",
    importer: "src/renderer/internal.ts",
    specifier: "../../packages/markdown-engine/src/parse-inline-ast",
    owner: "editor-foundation-refactor",
    reason: "Synthetic current debt for exact exception validation.",
    retireIn: "RF-604",
    ...overrides
  };
}

function validateSynthetic(repository: string, manifest = readSyntheticManifest(repository)) {
  return validateEditorFoundationArchitecture({ manifest, rootDir: repository });
}

function readCanonicalManifest(): MutableRecord {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "fixtures/architecture/editor-foundation-guard.json"), "utf8")
  ) as MutableRecord;
}

function readSyntheticManifest(repository: string): MutableRecord {
  return JSON.parse(
    readFileSync(resolve(repository, "fixtures/architecture/editor-foundation-guard.json"), "utf8")
  ) as MutableRecord;
}

function findParserEntry(manifest: MutableRecord, id: string): MutableRecord {
  const entry = (manifest.parserEntries as MutableRecord[]).find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(`Missing synthetic parser entry: ${id}`);
  }
  return entry;
}

function findRule(manifest: MutableRecord, id: string): MutableRecord {
  const rule = (manifest.rules as MutableRecord[]).find((candidate) => candidate.id === id);
  if (!rule) {
    throw new Error(`Missing synthetic rule: ${id}`);
  }
  return rule;
}

function expectCodes(result: EditorFoundationArchitectureResult): string[] {
  expect(result.ok).toBe(false);
  return result.findings.map((finding) => finding.code);
}

function writeRepositoryFile(repository: string, path: string, source: string): void {
  const absolutePath = resolve(repository, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source, "utf8");
}
