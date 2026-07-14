import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";

import ts from "typescript";

export type SourceImport = {
  kind: "dynamic-import" | "import" | "re-export";
  specifier: string;
};

export type SourceReExport = {
  exportedName: string;
  importedName: string;
  specifier: string | null;
};

export type SourceParseDiagnostic = {
  code: number;
  column: number;
  line: number;
  message: string;
  offset: number;
};

export type SourceModuleAnalysis = {
  declaredSymbols: ReadonlySet<string>;
  exportedSymbols: ReadonlySet<string>;
  hasDefaultOrExportAssignment: boolean;
  hasMicromarkDocumentParse: boolean;
  hasStarReExport: boolean;
  imports: readonly SourceImport[];
  parseDiagnostics: readonly SourceParseDiagnostic[];
  reExports: readonly SourceReExport[];
};

const sourceFilePattern = /\.(?:[cm]?[jt]sx?)$/iu;

export function collectSourceFiles(rootDir: string, sourcePath: string): string[] {
  const absoluteSourcePath = resolve(rootDir, sourcePath);
  if (!existsSync(absoluteSourcePath)) {
    return [];
  }

  if (statSync(absoluteSourcePath).isFile()) {
    return sourceFilePattern.test(absoluteSourcePath) ? [toRepoPath(rootDir, absoluteSourcePath)] : [];
  }

  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name)
    )) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile() && sourceFilePattern.test(entry.name)) {
        files.push(toRepoPath(rootDir, absolutePath));
      }
    }
  };

  visit(absoluteSourcePath);
  return files.sort((left, right) => left.localeCompare(right));
}

export function analyzeSourceModule(rootDir: string, path: string): SourceModuleAnalysis {
  const source = readFileSync(resolve(rootDir, path), "utf8");
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKindForPath(path));
  const parseDiagnostics = normalizeParseDiagnostics(sourceFile);
  const declaredSymbols = new Set<string>();
  const exportedSymbols = new Set<string>();
  const imports: SourceImport[] = [];
  const reExports: SourceReExport[] = [];
  const importedBindings = new Map<string, { importedName: string; specifier: string }>();
  const micromarkParseAliases = new Set<string>();
  const micromarkNamespaceAliases = new Set<string>();
  const micromarkParserVariables = new Set<string>();
  let hasDefaultOrExportAssignment = false;
  let hasStarReExport = false;

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !isStringLiteralLike(statement.moduleSpecifier) ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    for (const element of statement.importClause.namedBindings.elements) {
      importedBindings.set(element.name.text, {
        importedName: (element.propertyName ?? element.name).text,
        specifier: statement.moduleSpecifier.text
      });
    }
  }

  for (const statement of sourceFile.statements) {
    if (
      ts.isExportAssignment(statement) ||
      (ts.canHaveModifiers(statement) &&
        (ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ?? false))
    ) {
      hasDefaultOrExportAssignment = true;
    }
    if (ts.isImportDeclaration(statement) && isStringLiteralLike(statement.moduleSpecifier)) {
      imports.push({ kind: "import", specifier: statement.moduleSpecifier.text });
      if (statement.moduleSpecifier.text === "micromark") {
        const importClause = statement.importClause;
        const bindings = importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            if ((element.propertyName ?? element.name).text === "parse") {
              micromarkParseAliases.add(element.name.text);
            }
          }
        } else if (bindings && ts.isNamespaceImport(bindings)) {
          micromarkNamespaceAliases.add(bindings.name.text);
        }
      }
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier && isStringLiteralLike(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : null;
      if (specifier !== null) {
        imports.push({ kind: "re-export", specifier });
      }

      if (!statement.exportClause) {
        if (specifier !== null) {
          hasStarReExport = true;
        }
        continue;
      }

      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          const exportedName = element.name.text;
          if (exportedName === "default") {
            hasDefaultOrExportAssignment = true;
          }
          const localName = (element.propertyName ?? element.name).text;
          const importedBinding = specifier === null ? importedBindings.get(localName) : undefined;
          exportedSymbols.add(exportedName);
          reExports.push({
            exportedName,
            importedName: importedBinding?.importedName ?? localName,
            specifier: specifier ?? importedBinding?.specifier ?? null
          });
        }
      } else if (ts.isNamespaceExport(statement.exportClause)) {
        hasStarReExport = true;
      }
      continue;
    }

    collectTopLevelDeclarations(statement, declaredSymbols, exportedSymbols);
  }

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length >= 1 &&
      isStringLiteralLike(node.arguments[0])
    ) {
      imports.push({ kind: "dynamic-import", specifier: node.arguments[0].text });
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isMicromarkParseCall(node.initializer, micromarkParseAliases, micromarkNamespaceAliases)
    ) {
      micromarkParserVariables.add(node.name.text);
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  let hasMicromarkDocumentParse = false;
  const findDocumentParse = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "document"
    ) {
      const receiver = node.expression.expression;
      if (
        (ts.isCallExpression(receiver) &&
          isMicromarkParseCall(receiver, micromarkParseAliases, micromarkNamespaceAliases)) ||
        (ts.isIdentifier(receiver) && micromarkParserVariables.has(receiver.text))
      ) {
        hasMicromarkDocumentParse = true;
      }
    }
    ts.forEachChild(node, findDocumentParse);
  };
  findDocumentParse(sourceFile);

  return {
    declaredSymbols,
    exportedSymbols,
    hasDefaultOrExportAssignment,
    hasMicromarkDocumentParse,
    hasStarReExport,
    imports: imports.sort((left, right) =>
      [left.kind, left.specifier].join("|").localeCompare([right.kind, right.specifier].join("|"))
    ),
    parseDiagnostics,
    reExports: reExports.sort((left, right) => left.exportedName.localeCompare(right.exportedName))
  };
}

export function resolveImportRepoPath(rootDir: string, importer: string, specifier: string): string | null {
  if (specifier.startsWith(".")) {
    return toRepoPath(rootDir, resolve(rootDir, dirname(importer), specifier));
  }
  if (specifier.startsWith("src/") || specifier.startsWith("packages/") || specifier.startsWith("fixtures/")) {
    return toRepoPath(rootDir, resolve(rootDir, specifier));
  }
  return null;
}

export function resolveSourceModulePath(rootDir: string, importer: string, specifier: string): string | null {
  const unresolved = resolveImportRepoPath(rootDir, importer, specifier);
  if (!unresolved) {
    return null;
  }

  const candidates = extname(unresolved).length > 0
    ? [unresolved]
    : [`${unresolved}.ts`, `${unresolved}.tsx`, `${unresolved}.mts`, `${unresolved}.cts`, `${unresolved}/index.ts`];
  return candidates.find((candidate) => existsSync(resolve(rootDir, candidate))) ?? unresolved;
}

export function toRepoPath(rootDir: string, absolutePath: string): string {
  return relative(resolve(rootDir), resolve(absolutePath)).replaceAll("\\", "/");
}

function collectTopLevelDeclarations(
  statement: ts.Statement,
  declaredSymbols: Set<string>,
  exportedSymbols: Set<string>
): void {
  const isExported =
    ts.canHaveModifiers(statement) &&
    (ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false);
  if (
    (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement)) &&
    statement.name
  ) {
    declaredSymbols.add(statement.name.text);
    if (isExported) {
      exportedSymbols.add(statement.name.text);
    }
    return;
  }

  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        declaredSymbols.add(declaration.name.text);
        if (isExported) {
          exportedSymbols.add(declaration.name.text);
        }
      }
    }
  }
}

function isMicromarkParseCall(
  expression: ts.Expression,
  parseAliases: ReadonlySet<string>,
  namespaceAliases: ReadonlySet<string>
): expression is ts.CallExpression {
  if (!ts.isCallExpression(expression)) {
    return false;
  }
  if (ts.isIdentifier(expression.expression)) {
    return parseAliases.has(expression.expression.text);
  }
  return (
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === "parse" &&
    ts.isIdentifier(expression.expression.expression) &&
    namespaceAliases.has(expression.expression.expression.text)
  );
}

function isStringLiteralLike(node: ts.Node | undefined): node is ts.StringLiteralLike {
  return node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));
}

function scriptKindForPath(path: string): ts.ScriptKind {
  if (/\.tsx$/iu.test(path)) {
    return ts.ScriptKind.TSX;
  }
  if (/\.jsx$/iu.test(path)) {
    return ts.ScriptKind.JSX;
  }
  if (/\.[cm]?js$/iu.test(path)) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function normalizeParseDiagnostics(sourceFile: ts.SourceFile): SourceParseDiagnostic[] {
  const diagnostics = (
    sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }
  ).parseDiagnostics ?? [];
  return diagnostics.map((diagnostic) => {
    const offset = diagnostic.start ?? 0;
    const position = sourceFile.getLineAndCharacterOfPosition(offset);
    return {
      code: diagnostic.code,
      column: position.character + 1,
      line: position.line + 1,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      offset
    };
  });
}
