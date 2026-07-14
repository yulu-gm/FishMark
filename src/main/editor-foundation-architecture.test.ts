import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  validateEditorFoundationArchitecture,
  type EditorFoundationArchitectureResult
} from "./editor-foundation-architecture";
import { analyzeSourceModule, collectSourceFiles } from "./editor-foundation-source-scan";

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

  it("allows only the exact registered CodeMirror importer/specifier debt", () => {
    const importer = "packages/editor-core/src/codemirror-current.ts";
    const specifier = "@codemirror/state";
    const repository = createSyntheticRepository({
      [importer]: `import type { Text } from "${specifier}"; export type CurrentText = Text;`
    });
    const manifest = readSyntheticManifest(repository);
    manifest.exceptions = [createCodeMirrorException({ importer, specifier })];

    expect(validateSynthetic(repository, manifest)).toEqual({ findings: [], ok: true });
  });

  it("rejects a new CodeMirror package from an otherwise excepted importer", () => {
    const importer = "packages/editor-core/src/codemirror-current.ts";
    const repository = createSyntheticRepository({
      [importer]: [
        'import type { Text } from "@codemirror/state";',
        'import type { EditorView } from "@codemirror/view";',
        "export type CurrentText = Text | EditorView;"
      ].join("\n")
    });
    const manifest = readSyntheticManifest(repository);
    manifest.exceptions = [createCodeMirrorException({ importer, specifier: "@codemirror/state" })];

    expect(expectCodes(validateSynthetic(repository, manifest))).toContain("forbidden-import");
  });

  it("rejects an excepted CodeMirror package from a new importer", () => {
    const allowedImporter = "packages/editor-core/src/codemirror-current.ts";
    const repository = createSyntheticRepository({
      [allowedImporter]: 'import type { Text } from "@codemirror/state"; export type CurrentText = Text;',
      "packages/editor-core/src/codemirror-new.ts":
        'import type { Text } from "@codemirror/state"; export type NewText = Text;'
    });
    const manifest = readSyntheticManifest(repository);
    manifest.exceptions = [
      createCodeMirrorException({ importer: allowedImporter, specifier: "@codemirror/state" })
    ];

    expect(expectCodes(validateSynthetic(repository, manifest))).toContain("forbidden-import");
  });

  it("rejects wildcard CodeMirror debt declarations", () => {
    const importer = "packages/editor-core/src/codemirror-current.ts";
    const repository = createSyntheticRepository({
      [importer]: 'import type { Text } from "@codemirror/state"; export type CurrentText = Text;'
    });
    const manifest = readSyntheticManifest(repository);
    const editorCoreRule = findRule(manifest, "boundary.editor-core");
    editorCoreRule.temporaryAllowedPackages = [
      {
        id: "allowance.synthetic-editor-core-codemirror",
        owner: "editor-foundation-refactor",
        package: "@codemirror/*",
        reason: "A wildcard must never suppress CodeMirror debt.",
        retireIn: "RF-604"
      }
    ];
    manifest.exceptions = [createCodeMirrorException({ importer: "packages/editor-core/src/*.ts" })];

    expect(expectCodes(validateSynthetic(repository, manifest))).toEqual(
      expect.arrayContaining(["forbidden-import", "invalid-exception", "unknown-rule-field"])
    );
  });

  it("rejects a stale exact CodeMirror exception", () => {
    const importer = "packages/editor-core/src/codemirror-current.ts";
    const repository = createSyntheticRepository({
      [importer]: "export const clean = true;"
    });
    const manifest = readSyntheticManifest(repository);
    manifest.exceptions = [createCodeMirrorException({ importer })];

    expect(expectCodes(validateSynthetic(repository, manifest))).toContain("stale-exception");
  });

  it("keeps the canonical CodeMirror debt equal to scanner evidence", () => {
    const manifest = readCanonicalManifest();
    const actualTargets = collectSourceFiles(process.cwd(), "packages/editor-core")
      .flatMap((importer) =>
        analyzeSourceModule(process.cwd(), importer).imports
          .filter(({ specifier }) => specifier.startsWith("@codemirror/"))
          .map(({ specifier }) => `${importer}|${specifier}`)
      )
      .filter((target, index, targets) => targets.indexOf(target) === index)
      .sort();
    const declaredTargets = (manifest.exceptions as MutableRecord[])
      .filter((exception) => exception.ruleId === "boundary.editor-core")
      .map((exception) => `${String(exception.importer)}|${String(exception.specifier)}`)
      .sort();

    expect(declaredTargets).toEqual(actualTargets);
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

  it.each([
    [
      "a public-entry rule",
      (manifest: MutableRecord) => {
        findPackage(manifest, "editor-core").boundaryRuleId = "boundary.public-package-entries";
      },
      "package-boundary-rule-wrong-kind"
    ],
    [
      "a forbidden-import rule for another source path",
      (manifest: MutableRecord) => {
        findPackage(manifest, "editor-core").boundaryRuleId = "boundary.markdown-engine";
      },
      "package-boundary-rule-source-mismatch"
    ],
    [
      "a forbidden-import rule claimed by two packages",
      (manifest: MutableRecord) => {
        findPackage(manifest, "editor-core").boundaryRuleId = "boundary.markdown-engine";
        findPackage(manifest, "editor-core").path = "packages/markdown-engine";
      },
      "package-boundary-rule-reused"
    ]
  ])("rejects an active package bound to %s", (_name, mutate, expectedCode) => {
    const repository = createSyntheticRepository();
    const manifest = readSyntheticManifest(repository);
    mutate(manifest);

    expect(expectCodes(validateSynthetic(repository, manifest))).toContain(expectedCode);
  });

  it("requires a planned package to activate with its own matching forbidden-import rule", () => {
    const repository = createSyntheticRepository({
      "packages/editor-model/src/index.ts": "export const editorModel = true;"
    });
    const manifest = readSyntheticManifest(repository);
    findPackage(manifest, "editor-model").state = "active";
    findPackage(manifest, "editor-model").boundaryRuleId = "boundary.editor-core";

    expect(expectCodes(validateSynthetic(repository, manifest))).toEqual(
      expect.arrayContaining([
        "package-boundary-rule-reused",
        "package-boundary-rule-source-mismatch"
      ])
    );
  });

  it("reports a roadmap path that is not a readable file without throwing", () => {
    const importer = "src/renderer/internal.ts";
    const specifier = "../../packages/markdown-engine/src/parse-inline-ast";
    const repository = createSyntheticRepository({
      [importer]: `import { parseInlineAst } from "${specifier}"; void parseInlineAst;`
    });
    const manifest = readSyntheticManifest(repository);
    manifest.roadmapPath = "docs/refactor/editor-foundation";
    manifest.exceptions = [createException({ importer, specifier })];
    let result: EditorFoundationArchitectureResult | undefined;

    expect(() => {
      result = validateSynthetic(repository, manifest);
    }).not.toThrow();
    expect(expectCodes(result!)).toEqual(["roadmap-not-file"]);
  });

  it("still rejects malformed retirement metadata when roadmap evidence is unavailable", () => {
    const repository = createSyntheticRepository();
    const manifest = readSyntheticManifest(repository);
    manifest.roadmapPath = "docs/refactor/editor-foundation";
    manifest.exceptions = [createException({ retireIn: "not-a-roadmap-task" })];

    expect(expectCodes(validateSynthetic(repository, manifest))).toEqual([
      "invalid-retirement-task",
      "roadmap-not-file"
    ]);
  });

  it("throws when direct source collection receives a missing scan root", () => {
    const repository = createSyntheticRepository();

    expect(() => collectSourceFiles(repository, "src/missing-scan-root")).toThrow();
  });

  it("marks a missing active scan root incomplete without declaring debt stale", () => {
    const repository = createSyntheticRepository();
    const manifest = readSyntheticManifest(repository);
    findRule(manifest, "boundary.renderer").sourcePath = "src/renderer-missing";
    manifest.exceptions = [createException()];
    const codes = expectCodes(validateSynthetic(repository, manifest));

    expect(codes).toEqual(
      expect.arrayContaining(["active-rule-path-missing", "source-walk-error"])
    );
    expect(codes).not.toContain("stale-exception");
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

  it.each([
    ["main require", "src/main/require.ts", 'require("../preload/secret");'],
    ["preload import-equals", "src/preload/import-equals.ts", 'import secret = require("../renderer/secret"); void secret;'],
    ["renderer require", "src/renderer/require.ts", 'require("../main/secret");'],
    ["markdown-engine require", "packages/markdown-engine/src/require.ts", 'require("react");'],
    ["editor-core import-equals", "packages/editor-core/src/import-equals.ts", 'import electron = require("electron"); void electron;']
  ])("detects forbidden %s syntax", (_name, path, source) => {
    const repository = createSyntheticRepository({ [path]: source });

    expect(expectCodes(validateSynthetic(repository))).toContain("forbidden-import");
  });

  it.each([
    ["require", 'const parser = require("../../packages/markdown-engine/src/parse-inline-ast"); void parser;'],
    ["import-equals", 'import parser = require("../../packages/markdown-engine/src/parse-inline-ast"); void parser;']
  ])("rejects a cross-package internal %s", (_name, source) => {
    const repository = createSyntheticRepository({
      "src/renderer/internal-require.ts": source
    });

    expect(expectCodes(validateSynthetic(repository))).toContain("non-public-package-import");
  });

  it("collects static require, import-equals, and import-type without text false positives", () => {
    const path = "src/renderer/source-import-kinds.ts";
    const repository = createSyntheticRepository({
      [path]: [
        'import state = require("@codemirror/state");',
        'const view = require("@codemirror/view");',
        'type Transaction = import("@codemirror/state").Transaction;',
        'const dynamicName = "@codemirror/commands";',
        "require(dynamicName);",
        '// require("@codemirror/lang-markdown");',
        'const sample = \'require("@codemirror/lang-json")\';',
        "void state; void view; void sample;"
      ].join("\n")
    });

    expect(analyzeSourceModule(repository, path).imports).toEqual([
      { kind: "import-equals", specifier: "@codemirror/state" },
      { kind: "import-type", specifier: "@codemirror/state" },
      { kind: "require-call", specifier: "@codemirror/view" }
    ]);
  });

  it("conservatively treats a shadowed literal require as dependency evidence", () => {
    const repository = createSyntheticRepository({
      "src/renderer/shadowed-require.ts": [
        "function require(_specifier: string): unknown { return {}; }",
        'require("../main/secret");'
      ].join("\n")
    });

    expect(expectCodes(validateSynthetic(repository))).toContain("forbidden-import");
  });

  it("ignores comments, arbitrary strings, and non-literal require calls", () => {
    const repository = createSyntheticRepository({
      "src/renderer/not-an-import.ts": [
        '// import "../main/secret";',
        '// require("../main/secret");',
        `const sample = 'import("../main/secret")';`,
        `const requireSample = 'require("../main/secret")';`,
        'const dynamicName = "../main/secret";',
        "require(dynamicName);",
        "void sample; void requireSample;"
      ].join("\n")
    });

    expect(validateSynthetic(repository)).toEqual({ findings: [], ok: true });
  });

  it("fails closed when malformed TypeScript disrupts a forbidden import", () => {
    const repository = createSyntheticRepository({
      "src/renderer/malformed.ts": 'import { secret from "../main/secret"; void secret;'
    });
    let result: EditorFoundationArchitectureResult | undefined;

    expect(() => {
      result = validateSynthetic(repository);
    }).not.toThrow();
    expect(expectCodes(result!)).toContain("source-parse-error");
    const parseErrors = result!.findings.filter(
      (finding) => finding.code === "source-parse-error"
    );
    expect(parseErrors).toHaveLength(1);
    expect(parseErrors[0]).toMatchObject({ path: "src/renderer/malformed.ts" });
    expect(parseErrors[0]?.message).toMatch(
      /^src\/renderer\/malformed\.ts:\d+:\d+ TS\d+: .+/u
    );
    expect(parseErrors[0]?.message).not.toContain(repository.replaceAll("\\", "/"));
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

  it("does not declare exact exception debt stale when source parsing is incomplete", () => {
    const repository = createSyntheticRepository({
      "src/renderer/malformed-evidence.ts": "export const broken = ;"
    });
    const manifest = readSyntheticManifest(repository);
    manifest.exceptions = [
      createException(),
      createException({ id: "exception.synthetic-malformed", owner: "" })
    ];
    const codes = expectCodes(validateSynthetic(repository, manifest));

    expect(codes).toContain("source-parse-error");
    expect(codes).toContain("invalid-exception");
    expect(codes).not.toContain("stale-exception");
  });

  it.each([
    ["wildcard importer", { importer: "src/renderer/*.ts" }, "invalid-exception"],
    ["wildcard specifier", { specifier: "../../packages/*/src/index" }, "invalid-exception"],
    ["missing owner", { owner: "" }, "invalid-exception"],
    ["missing reason", { reason: "" }, "invalid-exception"],
    ["missing retirement", { retireIn: "" }, "missing-retirement-task"],
    ["malformed retirement", { retireIn: "not-a-task" }, "invalid-retirement-task"],
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

  it("owns the complete public bundle baseline in the canonical manifest", () => {
    const manifest = readCanonicalManifest();
    const bundlePolicy = manifest.bundlePolicy as MutableRecord;
    const checks = bundlePolicy.checks as MutableRecord[];

    expect(bundlePolicy.schemaVersion).toBe(1);
    expect(checks).toHaveLength(23);
    expect(checks.map((check) => check.id)).toEqual(
      [...checks.map((check) => check.id)].sort()
    );
  });

  it.each([
    [
      "a missing policy",
      (manifest: MutableRecord) => {
        delete manifest.bundlePolicy;
      },
      "invalid-bundle-policy"
    ],
    [
      "an empty check list",
      (manifest: MutableRecord) => {
        (manifest.bundlePolicy as MutableRecord).checks = [];
      },
      "empty-bundle-policy-checks"
    ],
    [
      "an unknown check kind",
      (manifest: MutableRecord) => {
        ((manifest.bundlePolicy as MutableRecord).checks as MutableRecord[])[0]!.kind = "allow";
      },
      "unknown-bundle-check-kind"
    ],
    [
      "a non-positive maximum limit",
      (manifest: MutableRecord) => {
        ((manifest.bundlePolicy as MutableRecord).checks as MutableRecord[])[0]!.limit = 0;
      },
      "invalid-bundle-check"
    ],
    [
      "an unexpected kind field",
      (manifest: MutableRecord) => {
        ((manifest.bundlePolicy as MutableRecord).checks as MutableRecord[])[0]!.pattern = "extra";
      },
      "invalid-bundle-check-field"
    ],
    [
      "a non-canonical check id",
      (manifest: MutableRecord) => {
        ((manifest.bundlePolicy as MutableRecord).checks as MutableRecord[])[0]!.id = "bundle.custom";
      },
      "noncanonical-bundle-check-id"
    ],
    [
      "a duplicate semantic target",
      (manifest: MutableRecord) => {
        const checks = (manifest.bundlePolicy as MutableRecord).checks as MutableRecord[];
        checks.push({ ...checks[0], id: "bundle.duplicate" });
      },
      "duplicate-bundle-check-target"
    ],
    [
      "an id duplicated outside bundle policy",
      (manifest: MutableRecord) => {
        ((manifest.bundlePolicy as MutableRecord).checks as MutableRecord[])[0]!.id =
          "boundary.editor-core";
      },
      "duplicate-id"
    ]
  ])("fails closed for bundle policy with %s", (_name, mutate, expectedCode) => {
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

  it("reports a missing required parser module", () => {
    const repository = createSyntheticRepository();
    const manifest = readSyntheticManifest(repository);
    findParserEntry(manifest, "parser.parse-inline-ast").module =
      "packages/markdown-engine/src/parse-inline-ast-missing.ts";

    expect(expectCodes(validateSynthetic(repository, manifest))).toContain("parser-module-missing");
  });

  it("does not infer a missing parser symbol from a module with incomplete parse evidence", () => {
    const repository = createSyntheticRepository({
      "packages/markdown-engine/src/parse-inline-ast.ts": "export const = true;"
    });
    const codes = expectCodes(validateSynthetic(repository));

    expect(codes).toContain("source-parse-error");
    expect(codes).not.toContain("required-parser-symbol-missing");
  });

  it.each(["present", "removed"])(
    "reports a %s parser module that is not a readable file without throwing",
    (state) => {
      const repository = createSyntheticRepository();
      const manifest = readSyntheticManifest(repository);
      const module = "packages/markdown-engine/src/parse-inline-ast.ts";
      rmSync(resolve(repository, module));
      mkdirSync(resolve(repository, module));
      findParserEntry(manifest, "parser.parse-inline-ast").lifecycle = { state };
      let result: EditorFoundationArchitectureResult | undefined;

      expect(() => {
        result = validateSynthetic(repository, manifest);
      }).not.toThrow();
      expect(expectCodes(result!)).toContain("parser-module-not-file");
    }
  );

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

  it("rejects a namespace re-export from a parser module", () => {
    const repository = createSyntheticRepository({
      "packages/markdown-engine/src/index.ts": [
        syntheticPublicParserExports,
        'export * as parsers from "./parse-markdown-document";'
      ].join("\n")
    });

    expect(expectCodes(validateSynthetic(repository))).toContain("unsupported-parser-star-export");
  });

  it.each([
    [
      'import { parseMarkdownDocument } from "./parse-markdown-document";',
      "export default parseMarkdownDocument;"
    ],
    ["", "export default function parseNewDocument(source: string): string { return source; }"]
  ])("rejects a default parser export in the public entry", (parserImport, defaultExport) => {
    const repository = createSyntheticRepository({
      "packages/markdown-engine/src/index.ts": [
        syntheticPublicParserExports,
        parserImport,
        defaultExport
      ].join("\n")
    });

    expect(expectCodes(validateSynthetic(repository))).toContain("unsupported-parser-export-assignment");
  });

  it.each([
    ['export { default } from "./default-document-parser";', "default-document-parser.ts"],
    ['export { parseMarkdownDocument as default } from "./parse-markdown-document";', null]
  ])("rejects a named default export in the parser public entry: %s", (publicExport, moduleName) => {
    const overrides: Record<string, string> = {
      "packages/markdown-engine/src/index.ts": [syntheticPublicParserExports, publicExport].join("\n")
    };
    if (moduleName) {
      overrides[`packages/markdown-engine/src/${moduleName}`] =
        "export default function buildDocument(source: string): string { return source; }";
    }
    const repository = createSyntheticRepository(overrides);

    expect(expectCodes(validateSynthetic(repository))).toContain("unsupported-parser-export-assignment");
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

  it.each([
    ['export { buildDocument as parseNewDocument } from "./build-document";', "build-document.ts"],
    ['export { default as parseNewDocument } from "./default-document-parser";', "default-document-parser.ts"]
  ])("rejects an unregistered parse-named public alias: %s", (publicExport, moduleName) => {
    const moduleSource = moduleName.startsWith("default-")
      ? "export default function buildDocument(source: string): string { return source; }"
      : "export function buildDocument(source: string): string { return source; }";
    const repository = createSyntheticRepository({
      "packages/markdown-engine/src/index.ts": [syntheticPublicParserExports, publicExport].join("\n"),
      [`packages/markdown-engine/src/${moduleName}`]: moduleSource
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
    [
      "ES namespace import",
      'import * as micromark from "micromark"; micromark.parse().document();'
    ],
    [
      "import-equals namespace",
      'import micromark = require("micromark"); micromark.parse().document();'
    ],
    [
      "require namespace",
      'const micromark = require("micromark"); micromark.parse().document();'
    ],
    [
      "require destructured parse",
      'const { parse } = require("micromark"); parse().document();'
    ],
    [
      "require renamed destructured parse",
      'const { parse: readMicromark } = require("micromark"); readMicromark().document();'
    ],
    [
      "direct require parse",
      'require("micromark").parse().document();'
    ],
    [
      "dynamic import namespace",
      'const micromark = await import("micromark"); micromark.parse().document();'
    ],
    [
      "dynamic import destructured parse",
      'const { parse } = await import("micromark"); parse().document();'
    ],
    [
      "dynamic import renamed destructured parse",
      'const { parse: readMicromark } = await import("micromark"); readMicromark().document();'
    ],
    [
      "direct dynamic import parse",
      '(await import("micromark")).parse().document();'
    ]
  ])("rejects an unregistered micromark document site loaded through %s", (_name, source) => {
    const repository = createSyntheticRepository({
      "packages/markdown-engine/src/runtime-micromark-site.ts": source
    });

    expect(expectCodes(validateSynthetic(repository))).toContain("unregistered-micromark-document-site");
  });

  it.each([
    [
      "direct require parse property extraction",
      'const parse = require("micromark").parse; parse().document();'
    ],
    [
      "renamed direct dynamic parse property extraction",
      'const readMicromark = (await import("micromark")).parse; readMicromark().document();'
    ],
    [
      "require namespace parse property extraction",
      'const mm = require("micromark"); const parse = mm.parse; parse().document();'
    ],
    [
      "dynamic namespace parse property extraction",
      'const mm = await import("micromark"); const readMicromark = mm.parse; readMicromark().document();'
    ],
    [
      "import-equals namespace parse property extraction",
      'import mm = require("micromark"); const parse = mm.parse; parse().document();'
    ],
    [
      "ES namespace parse property extraction",
      'import * as mm from "micromark"; const parse = mm.parse; parse().document();'
    ],
    [
      "confirmed namespace parse destructuring",
      'const mm = require("micromark"); const { parse } = mm; parse().document();'
    ],
    [
      "confirmed namespace renamed parse destructuring",
      'const mm = await import("micromark"); const { parse: readMicromark } = mm; readMicromark().document();'
    ],
    [
      "namespace alias propagation",
      'const mm = require("micromark"); const mm2 = mm; mm2.parse().document();'
    ],
    [
      "parse alias propagation",
      'import { parse } from "micromark"; const p = parse; p().document();'
    ],
    [
      "combined namespace destructuring and parse alias propagation",
      'const mm = require("micromark"); const mm2 = mm; const { parse } = mm2; const p = parse; p().document();'
    ],
    [
      "static parse element extraction",
      'const mm = require("micromark"); const p = mm["parse"]; p().document();'
    ],
    [
      "static parse element call",
      'const mm = require("micromark"); mm["parse"]().document();'
    ]
  ])("rejects a propagated micromark document site through %s", (_name, source) => {
    const repository = createSyntheticRepository({
      "packages/markdown-engine/src/propagated-micromark-site.ts": source
    });

    expect(expectCodes(validateSynthetic(repository))).toContain("unregistered-micromark-document-site");
  });

  it.each([
    ["module import without document parse", 'const { parse } = require("micromark"); void parse();'],
    ["non-document parser call", 'const micromark = require("micromark"); micromark.parse().content();'],
    ["another package with matching names", 'const { parse } = require("other-parser"); parse().document();'],
    [
      "another package direct parse property",
      'const parse = require("other-parser").parse; parse().document();'
    ],
    [
      "another package namespace parse property",
      'const other = require("other-parser"); const parse = other.parse; parse().document();'
    ],
    [
      "another package namespace parse destructuring",
      'const other = require("other-parser"); const { parse } = other; parse().document();'
    ],
    [
      "micromark namespace non-parse property",
      'const mm = require("micromark"); const build = mm.build; build().document();'
    ],
    [
      "micromark aliases without document parse",
      'const mm = require("micromark"); const mm2 = mm; const parse = mm2["parse"]; void parse;'
    ],
    [
      "comments and strings",
      [
        '// const { parse } = require("micromark"); parse().document();',
        'const sample = \'(await import("micromark")).parse().document()\';',
        "void sample;"
      ].join("\n")
    ]
  ])("does not mistake %s for a micromark document site", (_name, source) => {
    const repository = createSyntheticRepository({
      "packages/markdown-engine/src/runtime-micromark-nonsite.ts": source
    });
    const result = validateSynthetic(repository);

    expect(result.findings.map((finding) => finding.code)).not.toContain(
      "unregistered-micromark-document-site"
    );
    expect(result.ok).toBe(true);
  });

  it("does not infer a missing micromark site from a module with incomplete parse evidence", () => {
    const repository = createSyntheticRepository({
      "packages/markdown-engine/src/parse-block-map.ts": "export const = true;"
    });
    const codes = expectCodes(validateSynthetic(repository));

    expect(codes).toContain("source-parse-error");
    expect(codes).not.toContain("required-parser-symbol-missing");
    expect(codes).not.toContain("required-micromark-document-site-missing");
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
      "src/renderer/Z-first.ts": 'import "../main/z";',
      "src/renderer/a-second.ts": 'import "../main/a";'
    });
    const result = validateSynthetic(repository);

    expect(
      result.findings
        .filter((finding) => finding.code === "forbidden-import")
        .map((finding) => finding.path)
    ).toEqual(["src/renderer/Z-first.ts", "src/renderer/a-second.ts"]);
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
        forbiddenPackages: ["react", "react-dom", "electron", "@codemirror/*"],
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
    bundlePolicy: {
      schemaVersion: 1,
      checks: [
        {
          id: "bundle.max-total-gzip-bytes",
          kind: "maximum",
          metric: "totalJsGzipBytes",
          limit: 1_500_000
        }
      ]
    },
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

function createCodeMirrorException(overrides: MutableRecord = {}): MutableRecord {
  return {
    id: "exception.synthetic-editor-core-codemirror",
    importer: "packages/editor-core/src/codemirror-current.ts",
    owner: "editor-foundation-refactor",
    reason: "Synthetic exact CodeMirror debt until the adapter cutover.",
    retireIn: "RF-604",
    ruleId: "boundary.editor-core",
    specifier: "@codemirror/state",
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

function findPackage(manifest: MutableRecord, id: string): MutableRecord {
  const targetPackage = (manifest.packages as MutableRecord[]).find((candidate) => candidate.id === id);
  if (!targetPackage) {
    throw new Error(`Missing synthetic package: ${id}`);
  }
  return targetPackage;
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
