import ts from "typescript";
import { createHash } from "node:crypto";

// Only the dedicated runtime probe installs this plugin, and only on explicit opt-in.
// Product files and the normal Vite configuration are untouched.
export const runtimePhaseTargets = {
  "src/renderer/code-editor.ts": ["insertText", "setSelection", "observeDocumentUpdate"],
  "packages/codemirror-adapter/src/semantic-keypress.ts": ["applyPreparedSemanticCommand"],
  "packages/codemirror-adapter/src/transaction-adapter.ts": ["readSemanticContext", "prepareCommand", "preparePlan", "nextCache"],
  "packages/markdown-engine/src/cache/incremental-document-parser.ts": ["applyIncrementalEdit"],
  "packages/markdown-engine/src/parse/full-document-parser.ts": ["parseFullDocumentTree"],
  "packages/markdown-engine/src/parse-inline-ast.ts": ["parseInlineAst"],
  "packages/editor-model/src/derived/editor-derived-snapshot.ts": ["createEditorDerivedSnapshotFromCache", "createSnapshot", "createOutlineHeadings", "createDocumentMetrics"],
  "packages/editor-model/src/physical-lines/physical-editing-document.ts": ["createPhysicalEditingDocument"],
  "packages/editor-model/src/derived/editor-derived-state.ts": ["createEditorDerivedState"],
  "packages/editor-model/src/semantic-lines/semantic-editing-document.ts": ["createSemanticEditingDocument"],
  "packages/codemirror-adapter/src/extensions/markdown.ts": ["recomputeDerivedState", "createDecoratedDerivedState", "applyBlockDecorations"],
  "packages/codemirror-adapter/src/decorations/block-decorations.ts": ["createBlockDecorations", "createSelectionScopedBlockDecorations"]
};

export function instrumentRuntimeFunctions(source, file, names) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) throw new Error(`Cannot instrument invalid TypeScript: ${file}`);
  const edits = [];
  const matched = [];
  function visit(node) {
    let name;
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) name = node.name?.getText(ast);
    if (ts.isArrowFunction(node) && ts.isVariableDeclaration(node.parent)) name = node.parent.name.getText(ast);
    if (name && names.includes(name) && node.body && ts.isBlock(node.body)) {
      if (node.asteriskToken || node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) {
        throw new Error(`Only synchronous functions may be instrumented: ${file}:${name}`);
      }
      if (node.body.statements.some((s, i) => i === 0 && ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression))) {
        throw new Error(`Refuse to move a directive prologue: ${file}:${name}`);
      }
      const start = node.body.getStart(ast) + 1;
      const end = node.body.end - 1;
      const token = `__fishmarkRuntimeSpan${start}`;
      const label = `${file}#${name}`;
      const inputChars = name === "parseFullDocumentTree" ? ", source.length" :
        name === "parseInlineAst" ? ", endOffset - startOffset" : "";
      if (source.includes(token)) throw new Error(`Instrumentation identifier collision: ${label}`);
      edits.push({ at: start, text: `\nconst ${token} = globalThis.__fishmarkRuntimePhaseTiming?.begin(${JSON.stringify(label)}${inputChars}); try {\n` });
      edits.push({ at: end, text: `\n} finally { globalThis.__fishmarkRuntimePhaseTiming?.end(${token}); }\n` });
      matched.push({ name, label, bodyStart: start, bodyEnd: end, line: ast.getLineAndCharacterOfPosition(start).line + 1 });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const name of names) {
    if (matched.filter(m => m.name === name).length !== 1) throw new Error(`Expected one function: ${file}:${name}`);
  }
  let code = source;
  for (const edit of edits.sort((a, b) => b.at - a.at)) code = code.slice(0, edit.at) + edit.text + code.slice(edit.at);
  const transformed = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (transformed.parseDiagnostics.length) throw new Error(`Invalid instrumented TypeScript: ${file}`);
  return { code, matched };
}

export function createRuntimePhaseInstrumentation(projectRoot) {
  const applied = new Map();
  const root = projectRoot.replaceAll("\\", "/");
  const sha = source => createHash("sha256").update(source).digest("hex");
  return {
    targets: runtimePhaseTargets,
    manifest: () => [...applied.values()],
    plugin: {
      name: "fishmark-runtime-phase-diagnostic", enforce: "pre", apply: "serve",
      transform(source, id) {
        const path = id.split("?")[0].replaceAll("\\", "/");
        const file = path.startsWith(`${root}/`) ? path.slice(root.length + 1) : null;
        if (!file || !runtimePhaseTargets[file]) return null;
        const { code, matched } = instrumentRuntimeFunctions(source, file, runtimePhaseTargets[file]);
        applied.set(file, { file, sourceSha256: sha(source), transformedSha256: sha(code), matched });
        return { code, map: null };
      }
    }
  };
}
